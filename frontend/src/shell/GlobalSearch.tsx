import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, type LibraryDocument } from "../api/client";
import { ApiError } from "../api/errors";
import { SearchDialog, type SearchGroup, type SearchHit, SearchTrigger } from "../design/components";
import { searchShortcut } from "../design/words";
import { humanWhere } from "../library/where";
import { excerpt, rank } from "./search";

const LABEL = "Search the library and catalogue";
/** Passages are searched by the service, which limits searches a minute: only once typing pauses, and from three letters. */
const PASSAGE_PAUSE_MS = 350;
const PASSAGE_MIN = 3;
const EACH = 5;

/** The newest version's number: the outline an admin gets for someone else's document, else the highest uploaded. */
const newest = (doc: LibraryDocument) => doc.newest?.number ?? Math.max(0, ...doc.versions.map((version) => version.number));
const arabic = (text: string) => (/[؀-ۿ]/.test(text) ? "ar" : undefined);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function usePaused(value: string, ms: number) {
  const [paused, setPaused] = useState(value);
  useEffect(() => {
    const later = window.setTimeout(() => setPaused(value), ms);
    return () => window.clearTimeout(later);
  }, [value, ms]);
  return paused;
}

/**
 * Global search (redesign phase 6): Ctrl+K (⌘K) or the masthead's field opens
 * one dialog over documents, the catalogue in service (systems, offerings,
 * journeys) and passages in service. Names are matched here from what the
 * library and catalogue pages already load; passages go to the service's
 * passage search. A result opens its page.
 */
export function useGlobalSearch(): { trigger: ReactNode; overlay: ReactNode } {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const close = useCallback(() => setOpen(false), []);

  // Ctrl+K (⌘K) toggles search from anywhere, fields included: a modifier key is not a
  // single-character shortcut (WCAG 2.1.4), so it needs no off switch. Never over another dialog.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "k") return;
      if (document.querySelector("dialog[open]:not(.ds-search)")) return;
      event.preventDefault();
      setOpen((now) => !now);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const typed = query.trim();
  const paused = usePaused(typed, PASSAGE_PAUSE_MS);
  const documents = useQuery({ queryKey: ["library", "documents"], queryFn: api.libraryDocuments, enabled: open, staleTime: 60_000 });
  const release = useQuery({ queryKey: ["architecture", "active"], queryFn: api.activeRelease, enabled: open, staleTime: 60_000 });
  const passages = useQuery({
    queryKey: ["library", "search", paused],
    queryFn: () => api.search(paused),
    enabled: open && paused.length >= PASSAGE_MIN,
    retry: false,
    staleTime: 60_000,
  });

  const groups: SearchGroup[] = [];
  let found = 0;
  if (typed) {
    const docs = rank(documents.data ?? [], typed, (doc) => [doc.title], EACH);
    const docHits: SearchHit[] = docs.items.map((doc) => ({
      id: doc.id,
      href: `/library/${encodeURIComponent(doc.id)}`,
      title: doc.title,
      lang: arabic(doc.title),
      detail: <>Document · owner <bdi>{doc.is_owner ? "you" : doc.owner.display_name}</bdi>{newest(doc) ? <> · version {newest(doc)}</> : null}</>,
    }));
    if (docs.total > EACH) docHits.push({ id: "more", href: `/library?q=${encodeURIComponent(typed)}`, title: `See all ${docs.total} documents matching '${typed}'` });
    found += docs.total;
    groups.push({
      id: "documents",
      label: "Documents",
      hits: docHits,
      note: documents.isPending ? "loading…" : documents.isError ? "couldn't load the library" : undefined,
    });

    const book = release.data;
    const catalogueNote = release.isPending ? "loading…" : release.isError ? "couldn't load the catalogue" : book === null ? "no catalogue version is in service" : undefined;
    const systems = rank(book?.systems ?? [], typed, (system) => [system.name, ...system.aliases, system.id], EACH);
    const offerings = rank(book?.products ?? [], typed, (offering) => [offering.name, offering.code], EACH);
    const journeys = rank(book?.journeys ?? [], typed, (journey) => [journey.name], EACH);
    found += systems.total + offerings.total + journeys.total;
    const more = (total: number) => (total > EACH ? `${total - EACH} more; refine the words` : undefined);
    groups.push(
      {
        id: "systems",
        label: "Systems",
        note: catalogueNote ?? more(systems.total),
        hits: systems.items.map((system) => ({
          id: system.id,
          href: `/architecture/systems/${encodeURIComponent(system.id)}`,
          title: system.name,
          lang: arabic(system.name),
          detail: <>System{system.aliases.length ? <> · also <bdi>{system.aliases.slice(0, 3).join(", ")}</bdi></> : null}</>,
        })),
      },
      {
        id: "offerings",
        label: "Offerings",
        note: catalogueNote ? undefined : more(offerings.total),
        hits: offerings.items.map((offering) => ({
          id: offering.id,
          href: `/architecture/offerings/${encodeURIComponent(offering.id)}`,
          title: offering.name,
          lang: arabic(offering.name),
          detail: <>Offering{offering.code ? <> · <bdi>{offering.code}</bdi></> : null}</>,
        })),
      },
      {
        id: "journeys",
        label: "Journeys",
        note: catalogueNote ? undefined : more(journeys.total),
        hits: journeys.items.map((journey) => ({
          id: journey.id,
          href: `/architecture/journeys/${encodeURIComponent(journey.id)}`,
          title: journey.name,
          lang: arabic(journey.name),
          detail: "Customer journey",
        })),
      },
    );

    // Passages last: names above match exactly, the passage search by meaning.
    const waiting = typed.length >= PASSAGE_MIN && (paused !== typed || passages.isFetching);
    const limited = passages.error instanceof ApiError && passages.error.status === 429;
    const chunks = paused === typed && passages.isSuccess ? passages.data : [];
    const passageHits: SearchHit[] = chunks.slice(0, EACH).map((hit) => ({
      id: hit.id,
      href: `/library/${encodeURIComponent(hit.document_id)}#passage-${encodeURIComponent(hit.block_id)}`,
      title: excerpt(hit.original_text),
      lang: hit.language?.startsWith("ar") ? "ar" : arabic(hit.original_text),
      detail: <>Passage in <bdi>{hit.document_title}</bdi> · <bdi>{humanWhere(hit.location)}</bdi></>,
    }));
    if (chunks.length) passageHits.push({ id: "more", href: `/library/search?q=${encodeURIComponent(typed)}`, title: `See every passage for '${typed}'` });
    found += chunks.length;
    groups.push({
      id: "passages",
      label: "Passages in service",
      hits: passageHits,
      note:
        typed.length < PASSAGE_MIN ? undefined
          : waiting ? "searching…"
            : limited ? "too many searches in a minute; pause, then type again"
              : passages.isError ? "couldn't search passages"
                : passages.isSuccess && chunks.length === 0 ? "none match" : undefined,
    });
  }

  const still = groups.some((group) => group.note === "loading…" || group.note === "searching…");
  const status = !typed ? "" : found ? `${plural(found, "match", "matches")} for '${typed}'${still ? ", still looking" : ""}.` : still ? "Searching…" : `Nothing matches '${typed}'. Try fewer words, or the name's own language.`;

  const trigger = <SearchTrigger id="shell-search" label="Search" expanded={open} onClick={() => setOpen(true)} />;
  const overlay = (
    <SearchDialog
      open={open}
      onClose={close}
      label={LABEL}
      placeholder="Documents, systems, offerings, journeys, passages"
      query={query}
      onQuery={setQuery}
      groups={groups}
      status={status}
      hint={<>Find a document, a system, offering or journey in the catalogue in service, or a passage in service. Open search from any page with <kbd>{searchShortcut()}</kbd>.</>}
      onOpen={(hit) => {
        setOpen(false);
        navigate(hit.href);
      }}
    />
  );
  return { trigger, overlay };
}

import "./library.css";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { api, type ReferenceChunk } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { Button, EmptyState, PageHeader, Skeleton, Status, TextField } from "../design/components";
import { RouterLink } from "../shell/links";
import { Content } from "./parts";
import { contextPlaces } from "./searchContext";
import { humanWhere, langOf, plural } from "./where";

/**
 * Browse archetype for passages (plan 02 §1): every passage in service, across
 * all owners, the way requirement work's grounding finds them. The query lives
 * in the URL; a result opens its document at that passage.
 */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = (params.get("q") ?? "").trim();
  const [draft, setDraft] = useState(query);
  // The field follows the address when it changes from outside (back, forward, a link).
  const [shownFor, setShownFor] = useState(query);
  if (shownFor !== query) {
    setShownFor(query);
    setDraft(query);
  }
  const search = useQuery({
    queryKey: ["library", "search", query],
    queryFn: () => api.search(query),
    enabled: query !== "",
    retry: false,
    staleTime: 60_000,
  });
  const results = search.data ?? [];
  const limited = search.error instanceof ApiError && search.error.status === 429;
  const documents = new Set(results.map((item) => item.document_id)).size;

  return (
    <div className="lib">
      <PageHeader
        title="Search passages"
        documentTitle={query ? `'${query}' · Search passages` : "Search passages"}
        lead="Every passage in service, across all owners: what requirement work can cite today."
      />
      <form
        role="search"
        aria-label="Passages in service"
        className="lib-searchbar"
        onSubmit={(event) => {
          event.preventDefault();
          const next = draft.trim();
          setParams(next ? { q: next } : {});
        }}
      >
        <TextField label="Words from a policy" data-find type="search" maxLength={2000} value={draft} placeholder="For example: XGPON coverage for business bundles" onChange={(event) => setDraft(event.target.value)} />
        <Button type="submit" variant="primary" icon={<Search size={14} />} busy={search.isFetching}>Search</Button>
      </form>

      {query && search.isPending && <Skeleton label="Searching" rows={3} />}
      {search.isError && (
        <p className="lib-outcome" role="status">
          <Status tone="attention">{limited ? "Too many searches in a minute. Wait a moment, then search again." : `Couldn't search: ${errorMessage(search.error)}`}</Status>{" "}
          {!limited && <Button variant="link" onClick={() => void search.refetch()}>Try again</Button>}
        </p>
      )}
      {/* One status line, there before any search, says what each search found (§15). */}
      <p className="lib-quiet" role="status">
        {search.isSuccess && (results.length === 0
          ? <>No passage in service matches '<bdi>{query}</bdi>'.</>
          : <>{plural(results.length, "passage")} from {plural(documents, "document")} for '<bdi>{query}</bdi>', best first.</>)}
      </p>
      {search.isSuccess && (
        <>
          {results.length === 0 ? (
            <EmptyState title="Nothing in service matches." action={<Button onClick={() => { setDraft(""); setParams({}); }}>Clear the search</Button>}>
              <p>Only passages in service are searched. Try fewer words, or words in the document's own language.</p>
            </EmptyState>
          ) : (
            <ol className="lib-results">
              {results.map((hit) => <Result key={hit.id} hit={hit} />)}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

function Result({ hit }: { hit: ReferenceChunk }) {
  const [open, setOpen] = useState(false);
  // Surrounding text earns its toggle only when it reaches beyond the passage's own place.
  const hasContext = hit.context_locations.length >= 2 && hit.context_text.trim() !== hit.original_text.trim();
  const place = humanWhere([...hit.heading_path.filter((part) => !hit.location.includes(part)), hit.location].join(" › "));
  const lang = langOf(hit.language, hit.original_text);
  return (
    <li>
      <figure className="ds-quote">
        <blockquote dir="auto" lang={lang} className="ds-quote__text">{hit.original_text}</blockquote>
        <figcaption className="ds-quote__source">
          <Content text={hit.document_title} /> · version {hit.version_number} · <bdi>{place}</bdi>
          {hit.field_context && <> · <bdi>{hit.field_context}</bdi></>} ·{" "}
          <RouterLink href={`/library/${encodeURIComponent(hit.document_id)}#passage-${encodeURIComponent(hit.block_id)}`}>
            Open at the passage<span className="ds-visually-hidden"> in <bdi>{hit.document_title}</bdi></span>
          </RouterLink>
        </figcaption>
      </figure>
      {hasContext && (
        <div className="lib-context">
          <Button variant="link" aria-expanded={open} onClick={() => setOpen((on) => !on)}>
            {open ? "Hide the surrounding text" : `Show the surrounding text (${plural(hit.context_locations.length, "place")})`}
          </Button>
          {open && (
            <dl className="ds-facts lib-context__places">
              {contextPlaces(hit.context_text, hit.location).map((item) => (
                <div key={item.location}>
                  <dt>{humanWhere(item.location)}{item.cited && <span className="ds-visually-hidden"> (the passage found)</span>}</dt>
                  <dd dir="auto" lang={langOf(hit.language, item.text)} className={item.cited ? "lib-context__cited" : undefined}>{item.text}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </li>
  );
}

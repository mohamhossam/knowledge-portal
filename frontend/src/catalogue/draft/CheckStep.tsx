import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, RotateCw } from "lucide-react";
import { type FormEvent, Fragment, useState } from "react";

import { api, type DriftItem, type ImpactComparison, type OutdatedPassage, type Release, type SampleRequirement } from "../../api/client";
import { ApiError, errorMessage } from "../../api/errors";
import { ActionGroup, Button, EmptyState, Lines, Section, Status, type StatusTone, TextArea, TextField } from "../../design/components";
import { count } from "../../home/format";
import { ButtonLink, RouterLink } from "../../shell/links";
import { BUILD_STATE, buildState, impactVerdict } from "../drafting";
import { lines } from "../editing";
import { useCatalogueContext } from "../useCatalogue";
import { useBuild, useSamples } from "../useEditing";
import { Said } from "./parts";
import { type SampleResult, useSampleResults } from "./progress";

const BUILD_TONE: Record<ReturnType<typeof buildState>, StatusTone> = {
  built: "done",
  building: "working",
  failed: "attention",
  stale: "held",
  never: "neutral",
};

const busyModel = (error: unknown) => error instanceof ApiError && error.status === 429;

/**
 * Step 4 of a draft: built for matching, then the team's sample requirements
 * mapped with the version in service and with this draft, so the curator sees
 * which mappings publishing would move.
 */
export function CheckStep() {
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const build = useBuild(release);
  const state = buildState(release, build.job.data);
  return (
    <div className="draft-step">
      <BuildSection release={release} build={build} state={state} />
      <Provenance release={release} />
      <Citations release={release} base={base} />
      <Drift release={release} />
      <Samples release={release} built={state === "built"} />
      <p className="draft-next">
        <ButtonLink to={`${base}/publish`} variant={state === "built" ? "primary" : "secondary"}>Next: publish</ButtonLink>
      </p>
    </div>
  );
}

function BuildSection({ release, build, state }: { release: Release; build: ReturnType<typeof useBuild>; state: ReturnType<typeof buildState> }) {
  const job = build.job.data;
  const failure = build.start.error ?? build.retry.error;
  return (
    <Section title="The matching index">
      <p className="draft-lead">
        Requirement work matches against an index of the version's systems, connections, offerings, journeys and documents. A draft is
        built at its revision; every edit after it needs another build.
      </p>
      <p role="status">
        <Status tone={BUILD_TONE[state]}>
          {BUILD_STATE[state]}
          {state === "built" && ` at revision ${release.revision}`}
          {state === "building" && job && ` (attempt ${job.attempts})`}
          {state === "failed" && job?.error_category && `: ${job.error_category.replace(/_/g, " ")}`}
          {state === "stale" && ` at revision ${release.built_revision}; the draft is at revision ${release.revision}`}
        </Status>
      </p>
      <Said text={failure ? errorMessage(failure) : null} failed />
      {(state === "never" || state === "stale") && (
        <ActionGroup>
          <Button variant="primary" busy={build.start.isPending} onClick={() => build.start.mutate()}>
            {build.start.isPending ? "Starting the build…" : state === "stale" ? "Build it again" : "Build it"}
          </Button>
        </ActionGroup>
      )}
      {state === "failed" && job && (
        <ActionGroup>
          <Button icon={<RotateCw size={14} />} busy={build.retry.isPending} onClick={() => build.retry.mutate(job.id)}>Build it again</Button>
        </ActionGroup>
      )}
    </Section>
  );
}

/** Facts the draft holds whose every source document has left it: re-confirm, keep or remove. */
function Provenance({ release }: { release: Release }) {
  const facts = useQuery({
    queryKey: ["architecture", "releases", release.id, "provenance", release.revision],
    queryFn: () => api.provenance(release.id),
  });
  const items = facts.data ?? [];
  if (facts.isPending || (!facts.isError && !items.length)) return null;
  return (
    <Section title="Facts whose sources left this version" count={items.length}>
      <p className="draft-lead">
        The catalogue took these from documents this version no longer holds, in any version. Check each still stands, or
        change it in the catalogue; nothing here changes on its own.
      </p>
      {facts.isError ? (
        <p role="status"><Status tone="attention">{errorMessage(facts.error)}</Status></p>
      ) : (
        <Lines label="Facts whose sources left this version">
          {items.map((item) => (
            <li key={`${item.kind}:${item.subject}:${item.label}`} dir="auto">
              {item.label}
              <span className="draft-detail"> · from {item.sources.map((source) => `‘${source.title}’`).join(", ")}</span>
            </li>
          ))}
        </Lines>
      )}
    </Section>
  );
}

/** What the draft's facts cite that its source register does not hold: such a citation can't
 * say its source's level or title, so the source is registered or the citation corrected. */
function Citations({ release, base }: { release: Release; base: string }) {
  const found = useQuery({
    queryKey: ["architecture", "releases", release.id, "citations", release.revision],
    queryFn: () => api.citations(release.id),
  });
  const items = found.data ?? [];
  if (found.isPending || (!found.isError && !items.length)) return null;
  return (
    <Section title="Sources it cites but doesn’t register" count={items.length}>
      <p className="draft-lead">
        <Status tone="attention">Not registered</Status>{" "}
        These facts name a source the register doesn’t hold, so they can’t show its level or title.{" "}
        <RouterLink href={`${base}/governance`}>Register the source</RouterLink>, or correct the citation on the fact.
      </p>
      {found.isError ? (
        <p role="status"><Status tone="attention">{errorMessage(found.error)}</Status></p>
      ) : (
        <Lines label="Sources it cites but doesn’t register">
          {items.map((item) => (
            <li key={item.cited} dir="auto">
              <bdi>{item.cited}</bdi>
              {/* A line of its own under the citation, so it starts with words, not a separator. */}
              <span className="draft-detail">
                Cited by {count(item.facts, "fact")}, such as {item.examples.join("; ")}
              </span>
            </li>
          ))}
        </Lines>
      )}
    </Section>
  );
}

const passageKey = (item: OutdatedPassage) => `${item.version_id}\u0000${item.location}`;

/** Passages of the draft's documents that name what it changes or removes: a curator marks one
 * outdated so it is no longer searched as evidence, while its citations still open it. */
function Drift({ release }: { release: Release }) {
  const queryClient = useQueryClient();
  const drift = useQuery({
    queryKey: ["architecture", "releases", release.id, "drift", release.revision],
    queryFn: () => api.drift(release.id),
  });
  const marked = new Set((release.outdated_passages ?? []).map(passageKey));
  const save = useMutation({
    mutationFn: (passages: OutdatedPassage[]) =>
      api.setOutdatedPassages(release.id, { expected_revision: release.revision, passages }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["architecture"] }),
  });
  const items: DriftItem[] = drift.data ?? [];
  if (drift.isPending || (!drift.isError && !items.length)) return null;
  const toggle = (passage: OutdatedPassage) => {
    const current = release.outdated_passages ?? [];
    const key = passageKey(passage);
    save.mutate(marked.has(key) ? current.filter((item) => passageKey(item) !== key) : [...current, passage]);
  };
  return (
    <Section title="Passages about what this draft changes" count={items.length}>
      <p className="draft-lead">
        These passages name a system, offering or journey this draft changes or removes, so they may describe how it was. Mark a
        passage outdated to keep it out of the evidence requirement work searches; its citations still open it. A mark takes
        effect with the next build.
      </p>
      <Said text={save.isError ? errorMessage(save.error) : drift.isError ? errorMessage(drift.error) : null} failed />
      {items.map((item) => (
        <section key={`${item.item}:${item.key}`} className="draft-drift" aria-labelledby={`drift-${item.item}-${item.key}`}>
          <h3 id={`drift-${item.item}-${item.key}`} className="draft-subhead">
            <bdi>{item.label}</bdi>{" "}
            <span className="draft-detail">
              {item.change === "removed" ? "removed" : `changed${item.fields.length ? `: ${item.fields.join(", ")}` : ""}`}
            </span>
          </h3>
          <ul className="draft-drift__list">
            {item.passages.map((passage) => {
              const key = passageKey(passage);
              const outdated = marked.has(key);
              const where = release.documents.find((document) => document.id === passage.version_id)?.title ?? "A document";
              return (
                <li key={key} className="draft-drift__item">
                  <p className="draft-detail"><bdi>{where}</bdi> · {passage.location}</p>
                  <blockquote className="draft-drift__quote" dir="auto">{passage.text.split("\n").slice(1).join(" ").slice(0, 280)}</blockquote>
                  <Button
                    variant="link"
                    aria-pressed={outdated}
                    busy={save.isPending}
                    onClick={() => !save.isPending && toggle({ version_id: passage.version_id, location: passage.location })}
                  >
                    {outdated ? "Outdated: search it again" : "Mark it outdated"}
                  </Button>
                </li>
              );
            })}
          </ul>
          {item.more > 0 && <p className="draft-detail">{count(item.more, "more passage")} {item.more === 1 ? "names" : "name"} it.</p>}
        </section>
      ))}
    </Section>
  );
}

const names = (systems: { name: string }[]) => (systems.length ? systems.map((system) => system.name).join(", ") : "nothing");

function Samples({ release, built }: { release: Release; built: boolean }) {
  const { samples, save } = useSamples();
  const { results, record } = useSampleResults(release);
  const [editing, setEditing] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const items = samples.data?.items ?? [];
  const keyOf = (item: SampleRequirement) => item.id ?? item.text;

  const compare = async (key: string, text: string): Promise<boolean> => {
    setRunning(key);
    try {
      record(key, { comparison: await api.compareImpact(release.id, text) });
      return true;
    } catch (error) {
      record(key, { error });
      return !busyModel(error);
    } finally {
      setRunning(null);
    }
  };
  const compareAll = async () => {
    for (const [index, item] of items.entries()) {
      setProgress(`Comparing ${index + 1} of ${items.length}…`);
      if (!(await compare(keyOf(item), item.text))) break;
    }
    setProgress(null);
  };
  const compared = items.filter((item) => results[keyOf(item)]?.comparison).length;
  const moved = items.filter((item) => {
    const comparison = results[keyOf(item)]?.comparison;
    return comparison && impactVerdict(comparison).moved;
  }).length;
  const waits = built ? null : "Build the draft first: comparing needs it built at its revision.";

  return (
    <Section title="Sample requirements" count={items.length}>
      <p className="draft-lead">
        The team's examples, one list for every draft. Each is mapped with the version in service and with this draft, so you can see
        which mappings publishing would move.
      </p>
      {samples.isError ? <p role="status"><Status tone="attention">{errorMessage(samples.error)}</Status></p> : null}
      {editing ? (
        <SamplesEdit items={items} save={save} onDone={() => setEditing(false)} />
      ) : (
        <ActionGroup>
          <Button
            variant="primary"
            busy={Boolean(progress) || running !== null}
            unavailableReason={waits ?? (items.length ? null : "Add samples first.")}
            onClick={() => void compareAll()}
          >
            {progress ?? `Compare all ${items.length}`}
          </Button>
          <Button onClick={() => setEditing(true)}>{items.length ? "Edit the samples" : "Add samples"}</Button>
        </ActionGroup>
      )}
      <Said text={compared ? `${compared === items.length ? "All compared" : `${compared} of ${items.length} compared`}: ${moved ? `${count(moved, "mapping")} would move.` : "no mapping would move."}` : null} />
      {items.length ? (
        <table className="ds-table draft-samples">
          <caption className="ds-visually-hidden">Sample requirements mapped with the version in service and with this draft</caption>
          <thead>
            <tr>
              <th scope="col">Requirement</th>
              <th scope="col">With this draft</th>
              <th scope="col"><span className="ds-visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const key = keyOf(item);
              const result = results[key];
              const isOpen = open === key;
              return (
                <Fragment key={key}>
                  <tr>
                    <th scope="row" dir="auto"><span className="draft-clamp">{item.text}</span></th>
                    <td><Verdict result={result} /></td>
                    <td>
                      <ActionGroup label={`Sample ${index + 1}`}>
                        <Button variant="link" busy={running === key || Boolean(progress)} unavailableReason={waits ? "Build first." : null} onClick={() => void compare(key, item.text)}>
                          {running === key ? "Comparing…" : result?.comparison ? "Compare again" : "Compare"}
                        </Button>
                        {result?.comparison && result.comparison.this_version.systems.length > 0 && (
                          <Button
                            variant="link"
                            icon={isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            aria-expanded={isOpen}
                            onClick={() => setOpen(isOpen ? null : key)}
                          >
                            The evidence
                          </Button>
                        )}
                      </ActionGroup>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={3}><EvidenceFor release={release} text={item.text} /></td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      ) : (
        !editing && <EmptyState title="No sample yet."><p>Add a few typical requirements to compare drafts against.</p></EmptyState>
      )}
      <TryOne release={release} built={built} />
    </Section>
  );
}

function Verdict({ result }: { result: SampleResult | undefined }) {
  if (result?.comparison) return <Comparison comparison={result.comparison} />;
  if (result?.error) return <Status tone="attention">{busyModel(result.error) ? "The model is busy; try again in a minute." : errorMessage(result.error)}</Status>;
  return <span className="draft-quiet">Not compared yet</span>;
}

function Comparison({ comparison }: { comparison: ImpactComparison }) {
  const verdict = impactVerdict(comparison);
  return (
    <>
      <Status tone={verdict.moved ? "held" : "done"}>{verdict.label}</Status>
      <span className="draft-detail">In service: {names(comparison.in_use.systems)} · This draft: {names(comparison.this_version.systems)}</span>
      {comparison.this_version.uncertainty && <span className="draft-detail" dir="auto">{comparison.this_version.uncertainty}</span>}
    </>
  );
}

function SamplesEdit({ items, save, onDone }: { items: SampleRequirement[]; save: ReturnType<typeof useSamples>["save"]; onDone: () => void }) {
  const [text, setText] = useState(items.map((item) => item.text).join("\n"));
  const [tried, setTried] = useState(false);
  const finished = lines(text.split("\n"));
  const problem = finished.length > 20 ? "Keep it to 20 samples." : finished.some((each) => each.length > 2000) ? "Keep each sample under 2000 characters." : null;
  return (
    <form
      className="draft-panel"
      aria-label="Edit the samples"
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if (problem) return;
        // A sample kept as it was keeps its id; anything new is new.
        save.mutate(finished.map((each) => ({ id: items.find((item) => item.text === each)?.id ?? null, text: each })), { onSuccess: onDone });
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onDone();
      }}
    >
      <TextArea
        label="Samples"
        hint="One requirement per line, at most 20."
        rows={Math.min(14, Math.max(4, finished.length + 2))}
        value={text}
        error={tried ? problem : null}
        onChange={(event) => setText(event.target.value)}
        // The panel opens on a press of "Edit the samples": its one field is where the reader goes next.
        autoFocus
      />
      <Said text={save.isError ? errorMessage(save.error) : null} failed />
      <ActionGroup>
        <Button type="submit" variant="primary" busy={save.isPending}>{save.isPending ? "Saving…" : "Save the samples"}</Button>
        <Button onClick={onDone}>Cancel</Button>
      </ActionGroup>
    </form>
  );
}

/** A cited passage cut to a few lines, so its quote marks always close. */
const brief = (text: string) => (text.length > 280 ? `${text.slice(0, 277).trimEnd()}…` : text);

/** What this draft cites for each system it would map a requirement to. */
function EvidenceFor({ release, text }: { release: Release; text: string }) {
  const { base, book } = useCatalogueContext();
  const preview = useQuery({
    queryKey: ["architecture", "releases", release.id, release.revision, "preview-impact", text],
    queryFn: () => api.previewImpact(release.id, text),
    staleTime: Infinity,
    retry: false,
  });
  if (preview.isPending) return <p className="draft-quiet" role="status">Finding the evidence…</p>;
  if (preview.isError) return <p role="status"><Status tone="attention">{busyModel(preview.error) ? "The model is busy; try again in a minute." : errorMessage(preview.error)}</Status></p>;
  return (
    <div className="draft-evidence">
      {preview.data.system_ids.map((systemId) => {
        const citations = preview.data.citations.filter((citation) => citation.system_id === systemId);
        const name = book.systems.get(systemId)?.name ?? systemId;
        return (
          <div key={systemId}>
            <p className="draft-pane__label"><RouterLink href={`${base}/systems/${encodeURIComponent(systemId)}`}><bdi>{name}</bdi></RouterLink></p>
            {citations.length ? (
              <Lines label={`What the draft cites for ${name}`}>
                {citations.map((citation) => (
                  <li key={citation.chunk_id}>
                    <span dir="auto">“{brief(citation.quote)}”</span>{" "}
                    <RouterLink href={`${base}/evidence/${encodeURIComponent(citation.chunk_id)}?quote=${encodeURIComponent(citation.quote)}`}>The passage</RouterLink>
                  </li>
                ))}
              </Lines>
            ) : (
              <p className="draft-quiet">No passage is cited for it.</p>
            )}
          </div>
        );
      })}
      {preview.data.uncertainty && <p className="draft-quiet" dir="auto">{preview.data.uncertainty}</p>}
    </div>
  );
}

/** One requirement compared without saving it as a sample. */
function TryOne({ release, built }: { release: Release; built: boolean }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<SampleResult | null>(null);
  const [pending, setPending] = useState(false);
  const [tried, setTried] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!text.trim() || !built || pending) return;
    setPending(true);
    try {
      setResult({ comparison: await api.compareImpact(release.id, text.trim()) });
    } catch (error) {
      setResult({ error });
    } finally {
      setPending(false);
    }
  };
  return (
    <form className="draft-form draft-tryone" aria-label="Try one requirement" onSubmit={(event) => void submit(event)}>
      <TextField
        label="Try a requirement without saving it"
        maxLength={2000}
        value={text}
        error={tried && !text.trim() ? "Write a requirement to compare." : null}
        onChange={(event) => setText(event.target.value)}
      />
      <ActionGroup>
        <Button type="submit" busy={pending} unavailableReason={built ? null : "Build the draft first."}>{pending ? "Comparing…" : "Compare it"}</Button>
      </ActionGroup>
      <p role="status" className="draft-said">{result ? <Verdict result={result} /> : null}</p>
    </form>
  );
}

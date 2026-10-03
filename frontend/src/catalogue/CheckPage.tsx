import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, ChevronRight, RotateCw } from "lucide-react";
import { type FormEvent, Fragment, useId, useState } from "react";
import { Link } from "react-router-dom";

import { api, type ImpactComparison, type Release, type SampleRequirement } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { count } from "../home/format";
import { BUILD_STATE, buildState, impactVerdict } from "./drafting";
import { lines } from "./editing";
import { EditPanel } from "./DraftEdits";
import { LinesField } from "./forms";
import { useCatalogueContext } from "./useCatalogue";
import { useBuild, useSamples } from "./useEditing";

type Result = { comparison?: ImpactComparison; error?: unknown };

/**
 * Checking a draft before it is published: built for matching, then the team's
 * sample requirements mapped with the version in service and with this draft.
 */
export function CheckPage() {
  const { book } = useCatalogueContext();
  if (book.release.status !== "draft") {
    return <p className="timetable__quiet catalogue__first">Only a version in preparation is checked before publishing.</p>;
  }
  return <Check release={book.release} />;
}

function Check({ release }: { release: Release }) {
  const { base } = useCatalogueContext();
  const build = useBuild(release);
  const state = buildState(release, build.job.data);
  return (
    <>
      <BuildSection release={release} build={build} state={state} />
      <Samples release={release} built={state === "built"} />
      {state === "built" && (
        <p className="timetable__next">
          <Link to={`${base}/publish`}>
            Publish ‘<span dir="auto">{release.name || "Untitled version"}</span>’
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </p>
      )}
    </>
  );
}

/** A cited passage cut to a few lines, so its quote marks always close. */
const brief = (text: string) => (text.length > 280 ? `${text.slice(0, 277).trimEnd()}…` : text);

function BuildSection({ release, build, state }: { release: Release; build: ReturnType<typeof useBuild>; state: ReturnType<typeof buildState> }) {
  const job = build.job.data;
  const failure = build.start.error ?? build.retry.error;
  return (
    <section className="govsection catalogue__first" aria-labelledby="build-title">
      <h2 id="build-title" className="govsection__title">The matching index</h2>
      <p className="govsection__lead">
        Requirement work matches against an index of the version's systems, connections, offerings, journeys and documents. A draft
        is built at its revision; every edit after it needs another build.
      </p>
      <p className={state === "failed" ? "build-state build-state--failed" : "build-state"} role={state === "failed" ? "alert" : "status"}>
        <span className="status">{BUILD_STATE[state]}{state === "never" && "."}</span>
        <span className="secondary">
          {state === "built" && ` at revision ${release.revision}.`}
          {state === "building" && job && ` (attempt ${job.attempts}).`}
          {state === "failed" && job?.error_category && `: ${job.error_category.replace(/_/g, " ")}.`}
          {state === "stale" && ` at revision ${release.built_revision}; the draft is at revision ${release.revision}.`}
        </span>
      </p>
      {failure ? <p className="docpage__failure" role="alert">{errorMessage(failure)}</p> : null}
      {(state === "never" || state === "stale") && (
        <p className="govsection__actions">
          <button type="button" className="action-button" disabled={build.start.isPending} onClick={() => build.start.mutate()}>
            {build.start.isPending ? "Starting the build…" : state === "stale" ? "Build it again" : "Build it"}
          </button>
        </p>
      )}
      {state === "failed" && job && (
        <p className="govsection__actions">
          <button type="button" className="text-button" disabled={build.retry.isPending} onClick={() => build.retry.mutate(job.id)}>
            <RotateCw size={14} aria-hidden="true" />
            Build it again
          </button>
        </p>
      )}
    </section>
  );
}

function Samples({ release, built }: { release: Release; built: boolean }) {
  const { samples, save } = useSamples();
  const [editing, setEditing] = useState(false);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const items = samples.data?.items ?? [];

  const compare = async (key: string, text: string): Promise<boolean> => {
    setRunning(key);
    try {
      const comparison = await api.compareImpact(release.id, text);
      setResults((current) => ({ ...current, [key]: { comparison } }));
      return true;
    } catch (error) {
      setResults((current) => ({ ...current, [key]: { error } }));
      return !(error instanceof ApiError && error.status === 429);
    } finally {
      setRunning(null);
    }
  };
  const compareAll = async () => {
    for (const item of items) {
      setBusy(`Comparing ${items.indexOf(item) + 1} of ${items.length}…`);
      if (!(await compare(item.id ?? item.text, item.text))) break;
    }
    setBusy(null);
  };
  const moved = items.filter((item) => {
    const comparison = results[item.id ?? item.text]?.comparison;
    return comparison && impactVerdict(comparison).moved;
  }).length;
  const compared = items.filter((item) => results[item.id ?? item.text]?.comparison).length;

  return (
    <section className="govsection" aria-labelledby="samples-title">
      <h2 id="samples-title" className="govsection__title">Sample requirements</h2>
      <p className="govsection__lead">
        The team's examples, one list for every draft. Each is mapped with the version in service and with this draft, so you
        can see which mappings publishing would move.
      </p>
      {!built && (
        <p id="samples-waits" className="versions__waits">Build the draft above first; comparing needs it built at its revision.</p>
      )}
      {samples.isError ? <p className="docpage__failure" role="alert">{errorMessage(samples.error)}</p> : null}
      {editing ? (
        <SamplesEdit items={items} save={save} onDone={() => setEditing(false)} />
      ) : (
        <p className="govsection__actions">
          <button
            type="button"
            className="action-button"
            disabled={!built || !items.length || !!busy || running !== null}
            aria-describedby={!built ? "samples-waits" : undefined}
            onClick={() => void compareAll()}
          >
            {busy ?? `Compare all ${items.length}`}
          </button>
          <button type="button" className="text-button" onClick={() => setEditing(true)}>
            {items.length ? "Edit the samples" : "Add samples"}
          </button>
        </p>
      )}
      {compared > 0 && (
        <p className="toolbar__notice" role="status">
          {compared === items.length ? "All compared" : `${compared} of ${items.length} compared`}:{" "}
          {moved ? `${count(moved, "mapping")} would move.` : "no mapping would move."}
        </p>
      )}
      {items.length ? (
        <table className="govtable samples">
          <caption className="visually-hidden">Sample requirements mapped with the version in service and with this draft</caption>
          <thead>
            <tr>
              <th scope="col">Requirement</th>
              <th scope="col" className="samples__result">With this draft</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const key = item.id ?? item.text;
              const result = results[key];
              const verdict = result?.comparison ? impactVerdict(result.comparison) : null;
              const isOpen = open === key;
              return (
                <Fragment key={key}>
                  <tr className={`row${verdict?.moved ? " row--due" : ""}${isOpen ? " is-open" : ""}`}>
                    <th scope="row" dir="auto">
                      <span className="clamp">{item.text}</span>
                    </th>
                    <td className="samples__result">
                      {verdict && result?.comparison ? (
                        <>
                          <span className="status">{verdict.label}</span>
                          <span className="secondary govtable__by">
                            In service: {names(result.comparison.in_use.systems)} · This draft: {names(result.comparison.this_version.systems)}
                          </span>
                          {result.comparison.this_version.uncertainty && (
                            <span className="secondary govtable__by" dir="auto">{result.comparison.this_version.uncertainty}</span>
                          )}
                        </>
                      ) : result?.error ? (
                        <span className="status status--failed">
                          {result.error instanceof ApiError && result.error.status === 429
                            ? "The model is busy; try again in a minute."
                            : errorMessage(result.error)}
                        </span>
                      ) : (
                        <span className="secondary">Not compared yet</span>
                      )}
                      <span className="samples__actions">
                        <button
                          type="button"
                          className="text-button"
                          disabled={!built || running !== null || !!busy}
                          aria-describedby={!built ? "samples-waits" : undefined}
                          onClick={() => void compare(key, item.text)}
                        >
                          {running === key ? "Comparing…" : verdict ? "Compare again" : "Compare"}
                        </button>
                        {result?.comparison && result.comparison.this_version.systems.length > 0 && (
                          <button type="button" className="text-button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)}>
                            {isOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                            The evidence
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="samples__detail">
                      <td colSpan={2}>
                        <EvidenceFor release={release} text={item.text} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      ) : (
        !editing && <p className="timetable__quiet">No sample yet. Add a few typical requirements to compare drafts against.</p>
      )}
      <TryOne release={release} built={built} />
    </section>
  );
}

const names = (systems: { name: string }[]) => (systems.length ? systems.map((system) => system.name).join(", ") : "nothing");

function SamplesEdit({ items, save, onDone }: { items: SampleRequirement[]; save: ReturnType<typeof useSamples>["save"]; onDone: () => void }) {
  const [texts, setTexts] = useState(items.map((item) => item.text));
  const finished = lines(texts);
  const problem = finished.length > 20
    ? "Keep it to 20 samples."
    : finished.some((text) => text.length > 2000) ? "Keep each sample under 2000 characters." : null;
  return (
    <EditPanel
      title="Edit the samples"
      action="Save the samples"
      busy={save.isPending}
      problem={problem}
      error={save.error}
      onCancel={onDone}
      onSubmit={() =>
        save.mutate(
          // A sample kept as it was keeps its id; anything new is new.
          finished.map((text) => ({ id: items.find((item) => item.text === text)?.id ?? null, text })),
          { onSuccess: onDone },
        )
      }
    >
      <LinesField label="Samples" value={texts} hint="One requirement per line, at most 20." onChange={setTexts} />
    </EditPanel>
  );
}

/** What this draft cites for each system it would map a requirement to. */
function EvidenceFor({ release, text }: { release: Release; text: string }) {
  const { base, book } = useCatalogueContext();
  const preview = useQuery({
    queryKey: ["architecture", "releases", release.id, release.revision, "preview-impact", text],
    queryFn: () => api.previewImpact(release.id, text),
    staleTime: Infinity,
    retry: false,
  });
  if (preview.isPending) return <p className="secondary">Finding the evidence…</p>;
  if (preview.isError) {
    return (
      <p className="docpage__failure" role="alert">
        {preview.error instanceof ApiError && preview.error.status === 429 ? "The model is busy; try again in a minute." : errorMessage(preview.error)}
      </p>
    );
  }
  const bySystem = preview.data.system_ids.map((systemId) => ({
    systemId,
    citations: preview.data.citations.filter((citation) => citation.system_id === systemId),
  }));
  return (
    <div className="evidence-list">
      {bySystem.map(({ systemId, citations }) => (
        <div key={systemId} className="evidence-list__system">
          <p className="suggestion-detail__label">
            <Link to={`${base}/systems/${encodeURIComponent(systemId)}`} dir="auto">{book.systems.get(systemId)?.name ?? systemId}</Link>
          </p>
          {citations.length ? (
            <ul className="evidence-list__items">
              {citations.map((citation) => (
                <li key={citation.chunk_id}>
                  <span dir="auto">“{brief(citation.quote)}”</span>{" "}
                  <Link to={`${base}/evidence/${encodeURIComponent(citation.chunk_id)}`}>The passage</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="secondary">No passage is cited for it.</p>
          )}
        </div>
      ))}
      {preview.data.uncertainty && <p className="secondary" dir="auto">{preview.data.uncertainty}</p>}
    </div>
  );
}

/** One requirement compared without saving it as a sample. */
function TryOne({ release, built }: { release: Release; built: boolean }) {
  const id = useId();
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    setPending(true);
    try {
      setResult({ comparison: await api.compareImpact(release.id, text.trim()) });
    } catch (error) {
      setResult({ error });
    } finally {
      setPending(false);
    }
  };
  const verdict = result?.comparison ? impactVerdict(result.comparison) : null;
  return (
    <form className="searchbar tryone" role="search" aria-labelledby={`${id}-title`} onSubmit={(event) => void submit(event)}>
      <h3 id={`${id}-title`} className="visually-hidden">Try one requirement</h3>
      <label className="field searchbar__field" htmlFor={`${id}-text`}>
        <span className="field__label">Try a requirement without saving it</span>
        <input id={`${id}-text`} className="field__input" dir="auto" maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      <button
        type="submit"
        className="action-button"
        disabled={!built || !text.trim() || pending}
        aria-describedby={!built || !text.trim() ? `${id}-waits` : undefined}
      >
        {pending ? "Comparing…" : "Compare it"}
      </button>
      {(!built || !text.trim()) && (
        <p id={`${id}-waits`} className="versions__waits tryone__result">
          {!built ? "Build the draft first." : "Write a requirement to compare."}
        </p>
      )}
      {result && (
        <p className="tryone__result" role="status">
          {verdict && result.comparison ? (
            <>
              <strong>{verdict.label}.</strong> In service: {names(result.comparison.in_use.systems)} · This draft:{" "}
              {names(result.comparison.this_version.systems)}
            </>
          ) : (
            <span className="status--failed">{errorMessage(result.error)}</span>
          )}
        </p>
      )}
    </form>
  );
}

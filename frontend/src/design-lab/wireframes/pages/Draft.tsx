import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, useCallback, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api, type Release, type Suggestion } from "../../../api/client";
import {
  bulkAcceptable,
  changeSentence,
  lexicon,
  suggestionState,
  waitsFor,
} from "../../../catalogue/suggestions";
import { useActiveRelease, useChanges, useRelease, useSuggestions } from "../data";
import { useDelayedCommit, useFocusAfterRender, useStickySize } from "../hooks";
import { SimulatedFailure, useLab, wf } from "../lab-context";
import { ConsequencePanel, Empty, KeysLine, Note, Outcome, Page, ReasonedButton, Skeleton, StateLine, Status, Suggested } from "../ui";
import { DiffList } from "./Catalogue";

type Step = "sources" | "decide" | "changes" | "check" | "publish";
const STEPS: { id: Step; label: string }[] = [
  { id: "sources", label: "Sources" },
  { id: "decide", label: "Decide" },
  { id: "changes", label: "Changes" },
  { id: "check", label: "Check" },
  { id: "publish", label: "Publish" },
];

type Decision = "accepted" | "rejected";

/** Flow archetype with steps: the draft workspace, its state line always in view. */
export function DraftWorkspace({ step }: { step: Step }) {
  const { releaseId = "" } = useParams();
  const release = useRelease(releaseId);
  const suggestions = useSuggestions(releaseId);
  const lab = useLab();
  const top = useRef<HTMLDivElement>(null);
  useStickySize(top, "--wf-sticky-state");
  const decided = useMemo(() => {
    const map = new Map<string, Decision>();
    for (const [key, write] of Object.entries(lab.writes)) {
      if (key.startsWith(`decide:${releaseId}:`)) map.set(key.split(":")[2]!, write.value as Decision);
    }
    return map;
  }, [lab.writes, releaseId]);

  if (release.isPending || suggestions.isPending) return <Skeleton label="Opening the draft" rows={8} />;
  if (!release.data || release.data.status !== "draft") return <Empty title="This isn't a draft." why="It may have been published or deleted." action={<Link to={wf("/architecture/versions")}>All versions</Link>} />;

  const all = suggestions.data?.suggestions ?? [];
  const open = all.filter((item) => item.status === "proposed" && !decided.has(item.id));
  const toDecide = open.filter((item) => suggestionState(item) === "decide").length;
  const built = Boolean(lab.writes[`build:${releaseId}`]);
  const checkedAt = lab.writes[`check:${releaseId}`]?.at;
  const lastDecision = Math.max(0, ...Object.values(lab.writes).filter((w) => w.key.startsWith(`decide:${releaseId}:`)).map((w) => w.at));
  const stale = checkedAt !== undefined && lastDecision > checkedAt;
  const published = lab.writes[`publish:${releaseId}`];
  const base = wf(`/architecture/versions/${releaseId}`);

  return (
    <Page
      title={`Draft '${release.data.name}'`}
      archetype="Flow (5 steps)"
      head={
        <>
          <StateLine innerRef={top}>
            {published ? (
              <>Published. In service since {new Date(published.at).toTimeString().slice(0, 5)}.</>
            ) : (
              <>
                {open.length} suggestions undecided ({toDecide} need you) · {built ? "Built for matching" : "Not built"} · {checkedAt ? (stale ? "Checked, but the draft changed since" : "Checked") : "Not checked"}
              </>
            )}
          </StateLine>
          <nav aria-label="Draft steps" className="wf-steps">
            <ol>
              {STEPS.map((item, index) => (
                <li key={item.id}>
                  <Link to={`${base}/${item.id}`} aria-current={item.id === step ? "step" : undefined}>
                    {index + 1} {item.label}
                    <span className="wf-quiet">
                      {item.id === "decide" ? ` · ${toDecide} need you` : item.id === "check" ? (checkedAt ? (stale ? " · out of date" : " · done") : " · not yet") : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
          <p className="wf-quiet"><Link to={`${base}/edit/systems`}>Edit the draft by hand</Link> (the catalogue's pages, inside this workspace)</p>
        </>
      }
    >
      {step === "sources" && <Sources release={release.data} />}
      {step === "decide" && <Decide release={release.data} suggestions={all} decided={decided} />}
      {step === "changes" && <Changes release={release.data} suggestions={all} decided={decided} undecided={open.length} />}
      {step === "check" && <Check release={release.data} stale={stale} />}
      {step === "publish" && <Publish release={release.data} undecided={open.length} built={built} checked={Boolean(checkedAt)} stale={stale} decided={decided} />}
    </Page>
  );
}

function Sources({ release }: { release: Release }) {
  const lab = useLab();
  const runs = useQuery({ queryKey: ["wf", "extractions", release.id], queryFn: () => api.extractions(release.id) });
  const [fileOpen, setFileOpen] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  return (
    <>
      <section className="wf-section" aria-labelledby="src-docs">
        <h2 id="src-docs">Documents read for this draft</h2>
        <ul className="wf-lines">
          {release.documents.map((doc) => {
            const run = runs.data?.find((item) => item.document_version_id === doc.id);
            const state = run?.job.status === "failed" ? "attention" : run?.job.status === "succeeded" ? "done" : run?.job.status === "running" ? "working" : "waiting";
            return <li key={doc.id}><Status state={state} /> <bdi>{doc.title}</bdi> <span className="wf-quiet">· {doc.filename} · {doc.language}</span></li>;
          })}
        </ul>
        <button type="button" className="wf-button" onClick={() => { lab.startJob({ kind: "Reading", subject: "architecture-update.pdf", to: wf(`/architecture/versions/${release.id}/sources`) }); setOutcome("Reading started. Progress is in Jobs; you can leave this page."); }}>
          Add documents…
        </button>
        <Outcome text={outcome} />
      </section>
      <section className="wf-section" aria-labelledby="src-file">
        <h2 id="src-file">Catalogue file</h2>
        <p>Fill in the Excel template, or take the draft as a file, edit it and import it back.</p>
        <div className="wf-actions">
          <button type="button" className="wf-button">Download the template</button>
          <button type="button" className="wf-button" aria-expanded={fileOpen} onClick={() => setFileOpen(true)}>Import a catalogue file…</button>
        </div>
        {fileOpen && (
          <ConsequencePanel
            danger
            title="Replace the draft's content with the file"
            happens="The file replaces the draft's content, including any hand edits."
            affects={<p>Simulated difference: 2 systems added, 1 changed, 0 removed.</p>}
            reversible="You can't undo a replace; import the previous file to go back."
            confirm="Replace the draft's content"
            keep="Keep the draft as it is"
            onConfirm={() => lab.simulate(`file:${release.id}`, true).then(() => { setFileOpen(false); setOutcome("Replaced. 3 differences applied."); }, () => setOutcome("Couldn't replace. Try again."))}
            onKeep={() => setFileOpen(false)}
          />
        )}
      </section>
      <Note>One job per view: the catalogue file has its own card and its own compare before replace, away from the review path.</Note>
    </>
  );
}

/** Queue + Review desk: exceptions first, the ready set as one inspectable line, a 6 s undo on every decision. */
function Decide({ release, suggestions, decided }: { release: Release; suggestions: Suggestion[]; decided: Map<string, Decision> }) {
  const lab = useLab();
  const words = useMemo(() => lexicon(release, suggestions), [release, suggestions]);
  const [active, setActive] = useState(0);
  const [showReady, setShowReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const focusLater = useFocusAfterRender();

  const commit = useCallback(async ({ id, decision }: { id: string; decision: Decision }) => {
    try {
      await lab.simulate(`decide:${release.id}:${id}`, decision);
    } catch (error) {
      setFailure(error instanceof SimulatedFailure && error.kind === "conflict"
        ? "Someone changed this draft while you were working. Reload to see their change; your decisions stay listed."
        : "Couldn't record the decision. It's kept here; try again.");
    }
  }, [lab, release.id]);
  const { pending, schedule, undo } = useDelayedCommit(commit, 6000);
  const pendingIds = new Map(pending.map((item) => [item.value.id, item.value.decision]));

  const open = suggestions.filter((item) => item.status === "proposed" && !decided.has(item.id));
  const needsYou = open.filter((item) => suggestionState(item) === "decide");
  const waits = open.filter((item) => suggestionState(item) === "waits");
  const { ready, lifted } = bulkAcceptable(release, open);
  const readySet = [...ready, ...lifted].filter((item) => !needsYou.includes(item));
  const queue = needsYou;
  const current = queue[Math.min(active, queue.length - 1)];

  const decide = (item: Suggestion, decision: Decision) => {
    const sentence = changeSentence(item, words);
    schedule(item.id, sentence, { id: item.id, decision });
    lab.announce(`${decision === "accepted" ? "Accepted" : "Rejected"}: ${sentence}. Undo with z within 6 seconds.`);
    // Pending rows stay listed (with Undo) until sent, so move on to the next row.
    const next = Math.min(active + 1, queue.length - 1);
    setActive(next);
    focusLater(() => grid.current?.querySelector<HTMLElement>(`[data-row="${next}"] [data-cell]`));
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const item = current;
    const move = (to: number) => {
      const bounded = Math.max(0, Math.min(to, queue.length - 1));
      setActive(bounded);
      grid.current?.querySelector<HTMLElement>(`[data-row="${bounded}"] [data-cell]`)?.focus();
    };
    if (event.key === "ArrowDown" || event.key === "j" || event.key === "n") move(active + 1);
    else if (event.key === "ArrowUp" || event.key === "k") move(active - 1);
    else if (event.key === "a" && item && !pendingIds.has(item.id)) decide(item, "accepted");
    else if (event.key === "r" && item && !pendingIds.has(item.id)) decide(item, "rejected");
    else if (event.key === "z") {
      const undone = undo();
      lab.announce(undone ? `Undone. '${undone.label}' is back to decide.` : "Nothing to undo.");
    } else if (event.key === "e") lab.announce("Accept with edits opens the editor in the detail pane.");
    else return;
    event.preventDefault();
  };

  return (
    <>
      {failure && <Outcome text={failure} failed />}
      <section className="wf-section" aria-labelledby="dc-you">
        <h2 id="dc-you">Needs you <span className="wf-quiet">{needsYou.length}</span></h2>
        <KeysLine keys={[["↑↓ j k", "move"], ["a", "accept"], ["r", "reject"], ["e", "accept with edits"], ["z", "undo"]]} />
        {queue.length === 0 ? (
          <Empty title="Nothing needs your decision." why="Every suggestion that needs a person is decided." action={<Link to="../changes" relative="path" className="wf-button">Review the changes</Link>} />
        ) : (
          <div className="wf-desk__body">
            <div role="grid" aria-label="Suggestions that need you" className="wf-grid wf-grid--decide" ref={grid} onKeyDown={onKey}>
              {queue.map((item, index) => {
                const p = pendingIds.get(item.id);
                return (
                  <div key={item.id} role="row" data-row={index} className={`wf-grid__row${index === active ? " is-active" : ""}${p ? " is-pending" : ""}`} onClick={() => setActive(index)}>
                    <span role="gridcell" data-cell tabIndex={index === active ? 0 : -1} onFocus={() => setActive(index)}>
                      <Suggested basis={item.basis} />
                    </span>
                    <span role="gridcell" dir="auto" className={p === "rejected" ? "wf-struck" : undefined}>{changeSentence(item, words)}</span>
                    <span role="gridcell">
                      {p ? (
                        <>{p === "accepted" ? "Accepted" : "Rejected"} · <button type="button" className="wf-link-button" onClick={() => undo(item.id)}>Undo (z)</button></>
                      ) : (
                        <>
                          <button type="button" className="wf-button" tabIndex={-1} onClick={() => decide(item, "accepted")}>Accept</button>{" "}
                          <button type="button" className="wf-button" tabIndex={-1} onClick={() => decide(item, "rejected")}>Reject</button>
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            {current && (
              <aside className="wf-detail" aria-label="Evidence">
                <h3>Why it was suggested</h3>
                <p><Suggested basis={current.basis} /></p>
                {current.possible_matches.length > 0 && <p>It may be an existing system: {current.possible_matches.map((match) => `${match.system_name} (${match.reason})`).join(", ")}.</p>}
                {current.rationale && <p dir="auto">{current.rationale}</p>}
                {current.citations.map((citation) => (
                  <blockquote key={citation.location} className="wf-quote" dir="auto">
                    <mark>{citation.quote}</mark>
                    <footer className="wf-quiet">{release.documents.find((doc) => doc.id === current.document_version_id)?.title ?? "Source"} · {citation.location}</footer>
                  </blockquote>
                ))}
                <p className="wf-quiet">Model {current.model} · {current.prompt_version}</p>
              </aside>
            )}
          </div>
        )}
      </section>

      <section className="wf-section" aria-labelledby="dc-ready">
        <h2 id="dc-ready">Ready, safe to accept <span className="wf-quiet">{readySet.length}</span></h2>
        {readySet.length === 0 ? (
          <p className="wf-quiet">None.</p>
        ) : (
          <>
            <p>
              {readySet.length} suggestions add nothing that conflicts and wait on nothing a person must decide.{" "}
              <button type="button" className="wf-button" aria-expanded={showReady} onClick={() => setShowReady((on) => !on)}>{showReady ? "Hide them" : `Show the ${readySet.length}`}</button>{" "}
              <ReasonedButton
                className="wf-button wf-button--primary"
                reason={showReady ? null : `Show the ${readySet.length} first, so you've seen what is accepted.`}
                onClick={() => {
                  readySet.forEach((item) => schedule(item.id, changeSentence(item, words), { id: item.id, decision: "accepted" }));
                  lab.announce(`Accepted ${readySet.length} suggestions. Undo with z within 6 seconds.`);
                }}
              >
                Accept {readySet.length}
              </ReasonedButton>
            </p>
            {showReady && <ul className="wf-lines">{readySet.map((item) => <li key={item.id}><Suggested basis={item.basis} /> <span dir="auto">{changeSentence(item, words)}</span></li>)}</ul>}
          </>
        )}
      </section>

      <section className="wf-section" aria-labelledby="dc-waits">
        <h2 id="dc-waits">Waits for another <span className="wf-quiet">{waits.length}</span></h2>
        <ul className="wf-lines">{waits.map((item) => <li key={item.id}><span dir="auto">{changeSentence(item, words)}</span> · <span className="wf-quiet">{waitsFor(item, words)}</span></li>)}</ul>
      </section>

      {pending.length > 0 && (
        <div className="wf-undo" role="status">
          {pending.length === 1 ? <>{pendingIds.values().next().value === "accepted" ? "Accepted" : "Rejected"}: <span dir="auto">{pending[0]!.label}</span>.</> : <>{pending.length} decisions waiting to be sent.</>}{" "}
          <button type="button" className="wf-button" onClick={() => undo()}>Undo (z)</button>
        </div>
      )}
      <Note>Decisions are final in the API, so the lab holds each for 6 s before "sending" (BG3). "Accepted in bulk" is known in this session only (BG4).</Note>
    </>
  );
}

function Changes({ release, suggestions, decided, undecided }: { release: Release; suggestions: Suggestion[]; decided: Map<string, Decision>; undecided: number }) {
  const active = useActiveRelease();
  const changes = useChanges(release.id);
  const words = useMemo(() => lexicon(release, suggestions), [release, suggestions]);
  const origin = (key: string) => {
    const match = suggestions.find((item) => item.content.system_id === key || item.content.target_system_id === key);
    if (match && (match.status === "accepted" || decided.get(match.id) === "accepted")) return `Suggestion, accepted by ${match.decided_by ?? "you"}`;
    return "Hand edit or file";
  };
  if (!changes.data || !active.data) return <Skeleton label="Comparing with the version in service" rows={5} />;
  return (
    <>
      {undecided > 0 && <p><Status state="waiting">{undecided} suggestions are still undecided</Status> — they aren't in this list and won't be published.</p>}
      <DiffList diff={changes.data} from={active.data} to={release} origin={origin} />
      <Note>Removed rows read "− Removed" in words with full weight; origin comes from suggestions ({words ? "lexicon ready" : ""}) and the release's change history.</Note>
    </>
  );
}

function Check({ release, stale }: { release: Release; stale: boolean }) {
  const lab = useLab();
  const samples = useQuery({ queryKey: ["wf", "samples"], queryFn: api.samples });
  const [outcome, setOutcome] = useState<{ text: string; failed?: boolean } | null>(null);
  const built = lab.writes[`build:${release.id}`];
  const checked = lab.writes[`check:${release.id}`];
  return (
    <>
      <section className="wf-section" aria-labelledby="ck-build">
        <h2 id="ck-build">1. Build for matching</h2>
        {built ? <p><Status state="done">Built</Status></p> : (
          <button type="button" className="wf-button" onClick={() => {
            lab.startJob({ kind: "Building", subject: release.name ?? "the draft", to: wf(`/architecture/versions/${release.id}/check`) }, 3000);
            void lab.simulate(`build:${release.id}`, true, 3000);
            setOutcome({ text: "Building. It runs on the server; you can leave this page." });
          }}>Build it</button>
        )}
      </section>
      <section className="wf-section" aria-labelledby="ck-samples">
        <h2 id="ck-samples">2. Compare the team's sample requirements</h2>
        <p>{samples.data ? `${samples.data.items.length} sample requirements` : "Reading the samples…"}</p>
        <button type="button" className="wf-button" onClick={() => lab.simulate(`check:${release.id}`, { moves: 3 }).then(
          () => setOutcome({ text: "Checked. 3 requirements would map differently; 1 now also finds BSCS." }),
          (error: unknown) => setOutcome({ text: error instanceof Error ? error.message : "Couldn't check. Try again.", failed: true }),
        )}>
          {checked ? "Check again" : "Check now"}
        </button>
        {checked && <p>{stale ? <Status state="held">Out of date: the draft changed since
          {new Date(checked.at).toTimeString().slice(0, 5)}</Status> : <>Checked at {new Date(checked.at).toTimeString().slice(0, 5)}. 3 requirements would map differently.</>}</p>}
      </section>
      <Outcome text={outcome?.text ?? null} failed={outcome?.failed} />
      <Note>Results are kept for this session and marked stale when the draft changes (BG6: the API doesn't store them). 429 shows a countdown, not an error.</Note>
    </>
  );
}

function Publish({ release, undecided, built, checked, stale, decided }: { release: Release; undecided: number; built: boolean; checked: boolean; stale: boolean; decided: Map<string, Decision> }) {
  const lab = useLab();
  const active = useActiveRelease();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const published = lab.writes[`publish:${release.id}`];
  const accepted = [...decided.values()].filter((value) => value === "accepted").length;
  const rejected = decided.size - accepted;

  if (published) {
    return (
      <section className="wf-section" aria-labelledby="pb-done">
        <h2 id="pb-done">In service</h2>
        <p>'{release.name}' is in service. You decided {accepted} accepted and {rejected} rejected in this session.</p>
        <p><Link to={wf("/architecture/versions")}>See all versions</Link> · <Link to={wf(`/architecture/versions/${release.id}/changes`)}>View the changes</Link></p>
      </section>
    );
  }
  return (
    <>
      <ul className="wf-lines">
        <li>{built ? <Status state="done">Built for matching</Status> : <Status state="waiting">Not built yet — publishing builds it first</Status>}</li>
        <li>{checked ? (stale ? <Status state="held">Checked, but out of date</Status> : <><Status state="done">Checked</Status> · 3 requirements would map differently</>) : <Status state="waiting">Not checked</Status>}</li>
        <li>{undecided > 0 ? <Status state="waiting">{undecided} suggestions undecided — left out</Status> : <Status state="done">Every suggestion decided</Status>}</li>
      </ul>
      {!open ? (
        <button type="button" className="wf-button wf-button--primary" onClick={() => setOpen(true)}>Publish and put in service…</button>
      ) : (
        <ConsequencePanel
          title={`Publish '${release.name}'`}
          happens={<>Publishing puts '<bdi>{release.name}</bdi>' in service at once, replacing '<bdi>{active.data?.name}</bdi>'.</>}
          affects={
            <ul className="wf-lines">
              <li>{checked ? (stale ? "The check is out of date: the draft changed since." : "3 requirements would map differently.") : "Not checked: mapping impact is unknown."}</li>
              {undecided > 0 && <li>{undecided} suggestions are still undecided, and they won't be included.</li>}
              {!built && <li>It is built first. Keep this tab open until it finishes (the build-then-publish runs here, BG7).</li>}
            </ul>
          }
          reversible={<>The version it replaces can be put back from Versions.</>}
          reasonLabel="Why publish it?"
          reasonHint="Recorded in the catalogue's history."
          confirm="Publish and put in service"
          keep="Not yet"
          busy={busy}
          failure={failure}
          onConfirm={(reason) => {
            setBusy(true);
            setFailure(null);
            lab.simulate(`publish:${release.id}`, reason, built ? 600 : 2500).then(
              () => { setBusy(false); lab.announce(`'${release.name}' is in service.`); },
              (error: unknown) => {
                setBusy(false);
                setFailure(error instanceof SimulatedFailure && error.kind === "conflict" ? "Someone changed this draft while you were here. Reload to see their change; your reason stays." : "Couldn't publish. Try again.");
              },
            );
          }}
          onKeep={() => setOpen(false)}
        />
      )}
    </>
  );
}

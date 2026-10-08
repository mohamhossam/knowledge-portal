import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { api, type Release, type Suggestion } from "../../../api/client";
import { bulkAcceptable, changeSentence, lexicon, suggestionState, waitsFor } from "../../../catalogue/suggestions";
import {
  ActionGroup,
  Button,
  type Column,
  ConsequencePanel,
  DataTable,
  DecisionButtons,
  EmptyState,
  EvidenceQuote,
  ImpactPanel,
  type ImpactState,
  JobStatus,
  PageHeader,
  ProvenanceTrail,
  Section,
  Skeleton,
  SplitPane,
  StateLine,
  Status,
  Suggested,
  UndoToast,
} from "../../../design/components";
import { useDelayedCommit, useFocusAfterRender } from "../../../design/hooks";
import { useActiveRelease, useChanges, useRelease, useSuggestions } from "../../wireframes/data";
import { SimulatedFailure, useLab } from "../../wireframes/lab-context";
import { clock, proto } from "../paths";
import { ButtonLink, KeysHint, Lines, Outcome, RouterLink, StepNav } from "../ui";
import { Diff } from "./Catalogue";

type Step = "sources" | "decide" | "changes" | "check" | "publish";
type Decision = "accepted" | "rejected";

/** The check is simulated (BG6: the API keeps no results); these are its fixed outcomes. */
const CHECK_RESULT = { moved: 3, alsoFind: 1 };

/** Flow archetype with five steps: the draft workspace, its state line always in view. */
export function DraftWorkspace({ step }: { step: Step }) {
  const { releaseId = "" } = useParams();
  const release = useRelease(releaseId);
  const suggestions = useSuggestions(releaseId);
  const lab = useLab();
  const decided = useMemo(() => {
    const map = new Map<string, Decision>();
    for (const [key, write] of Object.entries(lab.writes)) {
      if (key.startsWith(`decide:${releaseId}:`)) map.set(key.split(":")[2]!, write.value as Decision);
    }
    return map;
  }, [lab.writes, releaseId]);

  if (release.isPending || suggestions.isPending) return <Skeleton label="Opening the draft" rows={8} />;
  if (!release.data || release.data.status !== "draft") {
    return (
      <>
        <PageHeader title="This isn't a draft" />
        <EmptyState title="It may have been published or deleted." action={<ButtonLink to={proto("/architecture/versions")}>All versions</ButtonLink>} />
      </>
    );
  }

  const all = suggestions.data?.suggestions ?? [];
  const open = all.filter((item) => item.status === "proposed" && !decided.has(item.id));
  const toDecide = open.filter((item) => suggestionState(item) === "decide").length;
  const built = Boolean(lab.writes[`build:${releaseId}`]);
  const checkedAt = lab.writes[`check:${releaseId}`]?.at;
  const lastDecision = Math.max(0, ...Object.values(lab.writes).filter((write) => write.key.startsWith(`decide:${releaseId}:`)).map((write) => write.at));
  const stale = checkedAt !== undefined && lastDecision > checkedAt;
  const published = lab.writes[`publish:${releaseId}`];
  const base = proto(`/architecture/versions/${releaseId}`);
  const steps = [
    { id: "sources", label: "Sources", href: `${base}/sources` },
    { id: "decide", label: "Decide", href: `${base}/decide`, note: toDecide ? `${toDecide} need you` : "done" },
    { id: "changes", label: "Changes", href: `${base}/changes` },
    { id: "check", label: "Check", href: `${base}/check`, note: checkedAt ? (stale ? "out of date" : "done") : "not yet" },
    { id: "publish", label: "Publish", href: `${base}/publish` },
  ];

  return (
    <>
      <PageHeader
        title={`Draft '${release.data.name}'`}
        provenance={<><RouterLink href={`${base}/edit/systems`}>Edit the draft by hand</RouterLink> (the catalogue's pages, inside this workspace)</>}
      >
        <StateLine>
          {published ? (
            <>Published. In service since {clock(published.at)}.</>
          ) : (
            <>
              <strong>{open.length}</strong> suggestions undecided ({toDecide} need you) · {built ? "Built for matching" : "Not built"} · {checkedAt ? (stale ? "Checked, but the draft changed since" : `Checked at ${clock(checkedAt)}`) : "Not checked"}
            </>
          )}
        </StateLine>
        <StepNav steps={steps} current={step} />
      </PageHeader>
      {step === "sources" && <Sources release={release.data} />}
      {step === "decide" && <Decide release={release.data} suggestions={all} decided={decided} />}
      {step === "changes" && <Changes release={release.data} suggestions={all} decided={decided} undecided={open.length} />}
      {step === "check" && <Check release={release.data} stale={stale} />}
      {step === "publish" && <Publish release={release.data} undecided={open.length} built={built} stale={stale} decided={decided} />}
    </>
  );
}

function Sources({ release }: { release: Release }) {
  const lab = useLab();
  const runs = useQuery({ queryKey: ["wf", "extractions", release.id], queryFn: () => api.extractions(release.id) });
  const [fileOpen, setFileOpen] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  return (
    <>
      <Section title="Documents read for this draft" count={release.documents.length}>
        <Lines>
          {release.documents.map((doc) => {
            const run = runs.data?.find((item) => item.document_version_id === doc.id);
            const state = run?.job.status === "failed" ? "attention" : run?.job.status === "succeeded" ? "done" : run?.job.status === "running" ? "working" : "waiting";
            return (
              <li key={doc.id}>
                <JobStatus state={state} /> <bdi>{doc.title}</bdi> <span className="proto-quiet">· <bdi>{doc.filename}</bdi> · {doc.language}</span>
              </li>
            );
          })}
        </Lines>
        <ActionGroup>
          <Button onClick={() => { lab.startJob({ kind: "Reading", subject: "architecture-update.pdf", to: proto(`/architecture/versions/${release.id}/sources`) }); setOutcome("Reading started. Jobs shows its progress; you can leave this page."); }}>
            Add documents…
          </Button>
        </ActionGroup>
      </Section>
      <Section title="Catalogue file">
        <p>Fill in the Excel template, or take the draft as a file, edit it and import it back.</p>
        <ActionGroup>
          <Button>Download the template</Button>
          <Button aria-expanded={fileOpen} onClick={() => setFileOpen(true)}>Import a catalogue file…</Button>
        </ActionGroup>
        {fileOpen && (
          <ConsequencePanel
            tone="danger"
            title="Replace the draft's content with the file"
            happens="The file replaces the draft's content, including any hand edits."
            affects={<p>Simulated difference: 2 systems added, 1 changed, 0 removed.</p>}
            reversibility="A replace can't be undone. To go back, import the previous file."
            confirmLabel="Replace the draft's content"
            keepLabel="Keep the draft as it is"
            onConfirm={() => lab.simulate(`file:${release.id}`, true).then(() => { setFileOpen(false); setOutcome("Replaced. 3 differences applied."); }, () => setOutcome("Couldn't replace. Try again."))}
            onKeep={() => setFileOpen(false)}
          />
        )}
      </Section>
      <Outcome text={outcome} />
    </>
  );
}

/** Queue + review desk: exceptions first, the safe set as one inspectable line, a 6 s undo on every decision. */
function Decide({ release, suggestions, decided }: { release: Release; suggestions: Suggestion[]; decided: Map<string, Decision> }) {
  const lab = useLab();
  const words = useMemo(() => lexicon(release, suggestions), [release, suggestions]);
  const [currentId, setCurrentId] = useState<string | undefined>();
  const [showReady, setShowReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
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
  const current = needsYou.find((item) => item.id === currentId) ?? needsYou[0];
  const docTitle = (item: Suggestion) => release.documents.find((doc) => doc.id === item.document_version_id)?.title ?? "Source document";

  const decide = (item: Suggestion, decision: Decision) => {
    const sentence = changeSentence(item, words);
    schedule(item.id, sentence, { id: item.id, decision });
    lab.announce(`${decision === "accepted" ? "Accepted" : "Rejected"}: ${sentence}. Undo with z within 6 seconds.`);
    // A pending row stays listed (with Undo) until it is sent, so move on to the next one.
    const index = needsYou.indexOf(item);
    const next = needsYou.slice(index + 1).find((other) => !pendingIds.has(other.id)) ?? needsYou[Math.min(index + 1, needsYou.length - 1)];
    if (next) {
      setCurrentId(next.id);
      focusLater(() => document.querySelector<HTMLElement>(`.proto-decide tr[data-row-id="${CSS.escape(next.id)}"] [data-cell-focus]`));
    }
  };
  const undoLast = (id?: string) => {
    const undone = undo(id);
    lab.announce(undone ? `Undone. '${undone.label}' is back to decide.` : "Nothing to undo.");
  };

  const onRowKey = (item: Suggestion, key: string) => {
    if (key === "z") undoLast();
    else if (key === "n") {
      const index = needsYou.indexOf(item);
      const next = needsYou.slice(index + 1).find((other) => !pendingIds.has(other.id));
      if (next) {
        setCurrentId(next.id);
        focusLater(() => document.querySelector<HTMLElement>(`.proto-decide tr[data-row-id="${CSS.escape(next.id)}"] [data-cell-focus]`));
      } else lab.announce("No undecided suggestion after this one.");
    } else if (pendingIds.has(item.id)) return key === "a" || key === "r" || key === "e";
    else if (key === "a") decide(item, "accepted");
    else if (key === "r") decide(item, "rejected");
    else if (key === "e") lab.announce("Accept with edits isn't in the prototype yet.");
    else return false;
    return true;
  };

  const columns: Column<Suggestion>[] = [
    {
      id: "change",
      header: "Suggested change",
      rowHeader: true,
      bidi: true,
      cell: (item) => <span className={pendingIds.get(item.id) === "rejected" ? "proto-excluded" : undefined}>{changeSentence(item, words)}</span>,
    },
    { id: "basis", header: "Basis", width: "15rem", cell: (item) => <Suggested basis={item.basis} /> },
    {
      id: "decision",
      header: "Decision",
      width: "19rem",
      cell: (item) => {
        const decision = pendingIds.get(item.id);
        return decision ? (
          <span className="ds-decision__state">
            {decision === "accepted" ? "Accepted" : "Rejected"}, sending in a moment ·{" "}
            <Button variant="link" tabIndex={-1} onClick={() => undoLast(item.id)}>Undo<span className="ds-visually-hidden">: {changeSentence(item, words)}</span></Button>
          </span>
        ) : (
          <DecisionButtons kind="suggestion" subject={changeSentence(item, words)} onDecide={(choice) => (choice === "accept" ? decide(item, "accepted") : choice === "reject" ? decide(item, "rejected") : lab.announce("Accept with edits isn't in the prototype yet."))} />
        );
      },
    },
  ];

  const evidence = current ? (
    <>
      <h2 className="ds-section__title">Why it was suggested</h2>
      <p dir="auto"><strong>{changeSentence(current, words)}</strong></p>
      <Suggested basis={current.basis} detail={<>Model {current.model} · {current.prompt_version}</>} />
      {current.possible_matches.length > 0 && (
        <p><Status tone="held">It may be an existing system</Status> {current.possible_matches.map((match) => `${match.system_name} (${match.reason})`).join(", ")}.</p>
      )}
      {current.rationale && <p dir="auto">{current.rationale}</p>}
      {current.citations.map((citation) => (
        <EvidenceQuote key={citation.location} text={citation.quote} source={<><bdi>{docTitle(current)}</bdi> · <bdi>{citation.location}</bdi></>} />
      ))}
      <ProvenanceTrail
        link={RouterLink}
        hops={[
          { label: "Suggestion", value: pendingIds.has(current.id) ? "decided, sending" : "not decided yet" },
          { label: "Evidence", value: current.citations[0]?.location ?? "—" },
          { label: "Document", value: docTitle(current) },
          { label: "Draft", value: release.name ?? "—", href: proto(`/architecture/versions/${release.id}/sources`) },
        ]}
      />
    </>
  ) : (
    <p className="proto-quiet">Choose a suggestion to see its evidence.</p>
  );

  return (
    <div className="proto-decide" data-density={lab.density === "automatic" ? "compact" : lab.density}>
      <Outcome text={failure} failed />
      <Section title="Needs you" count={needsYou.length}>
        {needsYou.length === 0 ? (
          <EmptyState title="Nothing needs your decision." action={<ButtonLink to={proto(`/architecture/versions/${release.id}/changes`)}>Review the changes</ButtonLink>}>
            <p>Every suggestion that needs a person is decided.</p>
          </EmptyState>
        ) : (
          <>
            <KeysHint keys={[["↑↓ j k", "move"], ["n", "next undecided"], ["a", "accept"], ["r", "reject"], ["z", "undo"]]} />
            <SplitPane
              paneLabel="Evidence"
              list={
                <DataTable
                  caption="Suggestions that need you"
                  captionHidden
                  columns={columns}
                  rows={needsYou}
                  rowId={(item) => item.id}
                  rowLabel={(item) => changeSentence(item, words)}
                  currentId={current?.id}
                  onCurrentChange={setCurrentId}
                  onActivate={() => focusLater(() => document.querySelector<HTMLElement>(".proto-decide tr.is-current .ds-decision button"))}
                  onRowKey={onRowKey}
                />
              }
              pane={evidence}
            />
          </>
        )}
      </Section>

      <Section title="Ready, safe to accept" count={readySet.length}>
        {readySet.length === 0 ? (
          <p className="proto-quiet">None.</p>
        ) : (
          <>
            <p>{readySet.length} suggestions add nothing that conflicts and wait on nothing a person must decide.</p>
            <ActionGroup>
              <Button aria-expanded={showReady} onClick={() => setShowReady((on) => !on)}>{showReady ? "Hide them" : `Show the ${readySet.length}`}</Button>
              <Button
                variant="primary"
                unavailableReason={showReady ? null : `Show the ${readySet.length} first, so you've seen what is accepted.`}
                onClick={() => {
                  readySet.forEach((item) => schedule(item.id, changeSentence(item, words), { id: item.id, decision: "accepted" }));
                  lab.announce(`Accepted ${readySet.length} suggestions. Undo with z within 6 seconds.`);
                }}
              >
                Accept {readySet.length}
              </Button>
            </ActionGroup>
            {showReady && (
              <Lines label="Ready to accept">
                {readySet.map((item) => <li key={item.id}><span dir="auto">{changeSentence(item, words)}</span> <Suggested basis={item.basis} /></li>)}
              </Lines>
            )}
          </>
        )}
      </Section>

      <Section title="Waits for another decision" count={waits.length}>
        {waits.length === 0 ? <p className="proto-quiet">None.</p> : (
          <Lines>{waits.map((item) => <li key={item.id}><span dir="auto">{changeSentence(item, words)}</span> · <span className="proto-quiet">{waitsFor(item, words)}</span></li>)}</Lines>
        )}
      </Section>

      {pending.length > 0 && (
        <UndoToast
          message={pending.length === 1 ? <>{pending[0]!.value.decision === "accepted" ? "Accepted" : "Rejected"}: <bdi>{pending[0]!.label}</bdi></> : <>{pending.length} decisions waiting to be sent</>}
          onUndo={() => undoLast()}
        />
      )}
    </div>
  );
}

function Changes({ release, suggestions, decided, undecided }: { release: Release; suggestions: Suggestion[]; decided: Map<string, Decision>; undecided: number }) {
  const active = useActiveRelease();
  const changes = useChanges(release.id);
  const origin = (key: string) => {
    const match = suggestions.find((item) => item.content.system_id === key || item.content.target_system_id === key);
    if (match && (match.status === "accepted" || decided.get(match.id) === "accepted")) return `Suggestion, accepted by ${match.decided_by ?? "you"}`;
    return "Hand edit or catalogue file";
  };
  if (!changes.data || !active.data) return <Skeleton label="Comparing with the version in service" rows={5} />;
  return (
    <>
      {undecided > 0 && <p><Status tone="neutral">{undecided} suggestions are still undecided</Status> They aren't in this list and won't be published.</p>}
      <Diff diff={changes.data} from={active.data} to={release} origin={origin} />
    </>
  );
}

function useImpact(release: Release, stale: boolean, checking: boolean): ImpactState {
  const lab = useLab();
  const checked = lab.writes[`check:${release.id}`];
  if (lab.scenario === "rp-unreachable") return { kind: "unknown", why: "Couldn't ask Requirement AI." };
  if (checking) return { kind: "checking" };
  if (!checked) return { kind: "not-checked" };
  return stale ? { kind: "stale", at: clock(checked.at) } : { kind: "checked", at: clock(checked.at) };
}

const IMPACT_COUNTS = [
  { label: "Sample requirements that would map differently", value: CHECK_RESULT.moved },
  { label: "Now also find BSCS", value: CHECK_RESULT.alsoFind },
];
const IMPACT_CAVEAT = "Checked against the team's sample requirements only. Results are kept for this session (the service doesn't store them).";

function Check({ release, stale }: { release: Release; stale: boolean }) {
  const lab = useLab();
  const samples = useQuery({ queryKey: ["wf", "samples"], queryFn: api.samples });
  const [outcome, setOutcome] = useState<{ text: string; failed?: boolean } | null>(null);
  const [checking, setChecking] = useState(false);
  const built = lab.writes[`build:${release.id}`];
  const impact = useImpact(release, stale, checking);
  const check = () => {
    setChecking(true);
    setOutcome(null);
    lab.simulate(`check:${release.id}`, CHECK_RESULT, 900).then(
      () => { setChecking(false); lab.announce(`Checked. ${CHECK_RESULT.moved} sample requirements would map differently.`); },
      (error: unknown) => { setChecking(false); setOutcome({ text: error instanceof Error ? error.message : "Couldn't check. Try again.", failed: true }); },
    );
  };
  return (
    <>
      <Section title="1. Build for matching">
        {built ? <p><Status tone="done">Built</Status></p> : (
          <ActionGroup>
            <Button onClick={() => {
              lab.startJob({ kind: "Building", subject: release.name ?? "the draft", to: proto(`/architecture/versions/${release.id}/check`) }, 3000);
              void lab.simulate(`build:${release.id}`, true, 3000);
              setOutcome({ text: "Building. It runs on the server; you can leave this page." });
            }}>Build it</Button>
          </ActionGroup>
        )}
      </Section>
      <Section title="2. Compare the team's sample requirements">
        <p>{samples.data ? `${samples.data.items.length} sample requirements are mapped against the draft and against the version in service.` : "Reading the samples…"}</p>
        <ImpactPanel title="Mapping impact" state={impact} counts={IMPACT_COUNTS} caveat={IMPACT_CAVEAT} onCheck={check} />
        {impact.kind === "checked" && <ActionGroup><Button onClick={check}>Check again</Button></ActionGroup>}
      </Section>
      <Outcome text={outcome?.text} failed={outcome?.failed} />
    </>
  );
}

function Publish({ release, undecided, built, stale, decided }: { release: Release; undecided: number; built: boolean; stale: boolean; decided: Map<string, Decision> }) {
  const lab = useLab();
  const active = useActiveRelease();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const impact = useImpact(release, stale, false);
  const published = lab.writes[`publish:${release.id}`];
  const accepted = [...decided.values()].filter((value) => value === "accepted").length;
  const rejected = decided.size - accepted;

  if (published) {
    return (
      <Section title="In service">
        <p>'<bdi>{release.name}</bdi>' is in service. You accepted {accepted} and rejected {rejected} suggestions in this session.</p>
        <ActionGroup>
          <ButtonLink to={proto("/architecture/versions")}>See all versions</ButtonLink>
          <ButtonLink to={proto(`/architecture/versions/${release.id}/changes`)}>View the changes</ButtonLink>
        </ActionGroup>
      </Section>
    );
  }
  return (
    <>
      <Section title="Before you publish">
        <Lines>
          <li>{built ? <Status tone="done">Built for matching</Status> : <Status tone="neutral">Not built yet. Publishing builds it first.</Status>}</li>
          <li>
            {impact.kind === "checked" ? <Status tone="done">Checked at {impact.at}</Status> : impact.kind === "stale" ? <Status tone="held">Checked, but out of date</Status> : impact.kind === "unknown" ? <Status tone="attention">Mapping impact unknown</Status> : <Status tone="neutral">Not checked</Status>}
          </li>
          <li>{undecided > 0 ? <Status tone="neutral">{undecided} suggestions undecided, and left out</Status> : <Status tone="done">Every suggestion decided</Status>}</li>
        </Lines>
      </Section>
      {!open ? (
        <ActionGroup><Button variant="primary" aria-expanded={false} onClick={() => setOpen(true)}>Publish and put in service…</Button></ActionGroup>
      ) : (
        <ConsequencePanel
          title={`Publish '${release.name}'`}
          happens={<>Publishing puts '<bdi>{release.name}</bdi>' in service at once, replacing '<bdi>{active.data?.name}</bdi>'.</>}
          affects={
            <>
              <ImpactPanel title="What changes for requirement work" state={impact} counts={IMPACT_COUNTS} caveat={IMPACT_CAVEAT} />
              {undecided > 0 && <p>{undecided} suggestions are still undecided, and they won't be included.</p>}
              {!built && <p>It is built first. Keep this tab open until it finishes: building then publishing runs from this page.</p>}
            </>
          }
          reversibility="The version it replaces can be put back from Versions."
          reason={{ label: "Why publish it?", hint: "Recorded in the catalogue's history." }}
          confirmLabel="Publish and put in service"
          keepLabel="Not yet"
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

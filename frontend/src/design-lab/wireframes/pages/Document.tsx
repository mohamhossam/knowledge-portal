import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, type RefObject, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";

import { api, type LibraryDocument, type LibraryVersion } from "../../../api/client";
import {
  counts,
  type Drafts,
  initialDrafts,
  livePublication,
  newestVersion,
  type Row,
  reviewRows,
  saveProblems,
  standing,
} from "../../../library/model";
import { DOC_STATE_WORDS, docState, useDependencies, useDocument } from "../data";
import { useDisclosure, useFocusAfterRender, useStickySize } from "../hooks";
import { SimulatedFailure, useLab, wf } from "../lab-context";
import { ConsequencePanel, Empty, KeysLine, Note, Outcome, Page, ProvenanceLine, ReasonedButton, Skeleton, Status, SubNav } from "../ui";

type Tab = "main" | "versions" | "cited-by" | "ownership";

/** Record archetype; its main tab is the Review desk while a version awaits review. */
export function DocumentRecord({ tab }: { tab: Tab }) {
  const { documentId = "" } = useParams();
  const document = useDocument(documentId);
  if (document.isPending) return <Skeleton label="Reading the document" rows={8} />;
  if (!document.data) return <Empty title="We couldn't open this document." why="It may have been withdrawn, or the service didn't answer." />;
  return <DocumentLoaded doc={document.data} tab={tab} />;
}

function DocumentLoaded({ doc, tab }: { doc: LibraryDocument; tab: Tab }) {
  const lab = useLab();
  const state = docState(doc);
  const reviewing = state === "review";
  const withdrawnWrite = lab.writes[`withdraw:${doc.id}`];
  const returned = lab.writes[`return:${doc.id}`];
  const live = livePublication(doc);
  const stand = standing(doc);
  const shownState = withdrawnWrite ? "withdrawn" : returned ? "service" : state;
  const base = wf(`/library/${doc.id}`);

  const provenance =
    stand.kind === "service" && live ? (
      <>In service since {live.activated_at?.slice(0, 10) ?? live.approved_at.slice(0, 10)} · approved by {live.approved_by.display_name} · from version {stand.versionNumber}</>
    ) : stand.kind === "withdrawn" ? (
      <>Withdrawn on {stand.publication.withdrawn_at?.slice(0, 10)} by {stand.publication.withdrawn_by?.display_name ?? "—"}: <q dir="auto">{stand.publication.withdrawal_reason}</q></>
    ) : (
      <>Not in service. Requirement work can't cite it until a review is approved.</>
    );

  return (
    <Page
      title={doc.title}
      archetype={tab === "main" && reviewing ? "Review desk (Record)" : "Record"}
      head={
        <>
          <p className="wf-headline">
            <Status state={shownState === "service" ? "done" : shownState === "attention" ? "attention" : shownState === "held" ? "held" : shownState === "reading" ? "working" : shownState === "withdrawn" ? "stopped" : "waiting"}>
              {DOC_STATE_WORDS[shownState]}
            </Status>{" "}
            · Owner {doc.owner.display_name}
          </p>
          <ProvenanceLine>{provenance}</ProvenanceLine>
          <HeadActions doc={doc} withdrawn={Boolean(withdrawnWrite) || stand.kind === "withdrawn"} returned={Boolean(returned)} />
          <SubNav
            label="Document"
            items={[
              { to: base, label: reviewing ? "Review" : "Overview", end: true },
              { to: `${base}/versions`, label: "Versions" },
              { to: `${base}/cited-by`, label: "Cited by" },
              { to: `${base}/ownership`, label: "Ownership" },
            ]}
          />
        </>
      }
    >
      {tab === "main" && (reviewing ? <ReviewDesk doc={doc} version={newestVersion(doc)!} /> : <Overview doc={doc} />)}
      {tab === "versions" && <Versions doc={doc} />}
      {tab === "cited-by" && <CitedBy doc={doc} />}
      {tab === "ownership" && <Ownership doc={doc} />}
    </Page>
  );
}

/** Withdraw or return to service, each through a consequence panel (§5). */
function HeadActions({ doc, withdrawn, returned }: { doc: LibraryDocument; withdrawn: boolean; returned: boolean }) {
  const lab = useLab();
  const panel = useDisclosure(() => window.document.getElementById("wf-page-title"));
  const deps = useDependencies(doc.id);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const inService = standing(doc).kind === "service" && !withdrawn;
  const canReturn = withdrawn && !returned;
  if (!inService && !canReturn) return <Outcome text={outcome} />;

  const unknown = lab.scenario === "rp-unreachable";
  const citing = deps.data?.items.length ?? 0;
  const more = Boolean(deps.data?.next_offset);
  const countText = unknown ? "Couldn't ask Requirement AI who cites it. The count is unknown, not zero." : `${citing}${more ? "+" : ""} requirements cite it now (only requirements you can see).`;

  const run = (key: string, done: string) => (reason: string) => {
    setBusy(true);
    setFailure(null);
    lab.simulate(key, reason).then(
      () => {
        setBusy(false);
        panel.close();
        setOutcome(done);
        lab.announce(done);
      },
      (error: unknown) => {
        setBusy(false);
        setFailure(error instanceof SimulatedFailure ? `${error.message} ${error.kind === "conflict" ? "Reload to see their change; your reason stays." : ""}` : "Couldn't do that. Try again.");
      },
    );
  };

  return (
    <div className="wf-headactions">
      {!panel.open && (
        <button type="button" className={inService ? "wf-button wf-button--danger-quiet" : "wf-button"} aria-expanded={false} onClick={panel.show}>
          {inService ? "Withdraw…" : "Return to service…"}
        </button>
      )}
      {panel.open && inService && (
        <ConsequencePanel
          danger
          panelRef={panel.panel}
          title={`Withdraw '${doc.title}'`}
          happens="Requirement work can no longer cite this document."
          affects={<p>{countText}{!unknown && citing > 0 && " They'll be asked to keep or revise their citation in Requirement AI."}</p>}
          reversible="You can return it to service later from this page."
          reasonLabel="Why are you withdrawing it?"
          reasonHint="The requirement owners see this."
          confirm={`Withdraw '${doc.title}'`}
          keep="Keep it in service"
          onConfirm={run(`withdraw:${doc.id}`, "Withdrawn. Requirement work can no longer cite it.")}
          onKeep={panel.close}
          busy={busy}
          failure={failure}
        />
      )}
      {panel.open && canReturn && (
        <ConsequencePanel
          panelRef={panel.panel}
          title={`Return '${doc.title}' to service`}
          happens={<>It was withdrawn: <q dir="auto">{standing(doc).kind === "withdrawn" ? (standing(doc) as { publication: { withdrawal_reason: string | null } }).publication.withdrawal_reason : "—"}</q>. Returning it makes its reviewed version citable again.</>}
          reversible="You can withdraw it again later."
          reasonLabel="Why is it coming back?"
          reasonHint="Recorded with the return, beside the withdrawal."
          confirm="Return to service"
          keep="Keep it withdrawn"
          onConfirm={run(`return:${doc.id}`, "Back in service.")}
          onKeep={panel.close}
          busy={busy}
          failure={failure}
        />
      )}
      <Outcome text={outcome} />
    </div>
  );
}

type Filter = "all" | "unseen" | "flagged" | "changed" | "excluded";

/** The Review desk: progress, grid (role="grid"), docked detail, bulk bar, save bar. */
function ReviewDesk({ doc, version }: { doc: LibraryDocument; version: LibraryVersion }) {
  const lab = useLab();
  const location = useLocation();
  const [drafts, setDrafts] = useState<Drafts>(() => initialDrafts(version));
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [find, setFind] = useState("");
  const [limit, setLimit] = useState(() => {
    const hash = location.hash.replace("#passage-", "");
    const index = [...version.blocks].sort((a, b) => a.ordinal - b.ordinal).findIndex((block) => block.id === hash);
    return Math.max(200, index + 50);
  });
  const [summary, setSummary] = useState("");
  const [saveState, setSaveState] = useState<{ text: string; failed?: boolean; conflict?: boolean } | null>(null);
  const [approved, setApproved] = useState(false);
  const bulk = useDisclosure(() => grid.current?.querySelector<HTMLElement>("[data-active='true'] [data-cell]") ?? null);
  const approve = useDisclosure(() => window.document.getElementById("wf-approve"));
  const grid = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const focusLater = useFocusAfterRender();
  useStickySize(bar, "--wf-sticky-bottom");

  const allRows = useMemo(() => reviewRows(doc, version, drafts), [doc, version, drafts]);
  const tally = counts(allRows);
  const start = initialDrafts(version);
  const dirty = version.blocks.filter((block) => {
    const a = drafts[block.id];
    const b = start[block.id];
    return a && b && (a.text !== b.text || a.included !== b.included || (!a.included && a.reason !== b.reason));
  }).length;
  const problems = saveProblems(version, drafts, summary);
  const rows = allRows.filter((row) => {
    const pass =
      filter === "all" ||
      (filter === "unseen" && !seen.has(row.key)) ||
      (filter === "flagged" && row.warnings.length > 0) ||
      (filter === "changed" && (row.change === "edited" || row.change === "new")) ||
      (filter === "excluded" && row.change === "excluded");
    const needle = find.trim().toLocaleLowerCase();
    return pass && (!needle || `${row.where} ${row.draft?.text ?? ""}`.toLocaleLowerCase().includes(needle));
  });
  const visible = rows.slice(0, limit);
  const current = visible[Math.min(active, visible.length - 1)];
  const deps = useDependencies(doc.id);

  const markSeen = (row: Row | undefined) => {
    if (row && !seen.has(row.key)) setSeen((all) => new Set(all).add(row.key));
  };
  const focusRow = (index: number) => {
    const bounded = Math.max(0, Math.min(index, rows.length - 1));
    if (bounded >= limit) setLimit((value) => value + 200);
    setActive(bounded);
    markSeen(rows[bounded]);
    focusLater(() => grid.current?.querySelector<HTMLElement>(`[data-row="${bounded}"] [data-cell]`));
  };
  const update = (key: string, change: Partial<{ text: string; included: boolean; reason: string }>) =>
    setDrafts((all) => ({ ...all, [key]: { ...all[key]!, ...change } }));

  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("textarea,input")) return;
    const row = current;
    const key = event.key;
    if (event.shiftKey && (key === "ArrowDown" || key === "ArrowUp")) {
      // Shift+arrow extends the selection over the row left and the row reached.
      const target = rows[Math.max(0, Math.min(active + (key === "ArrowDown" ? 1 : -1), rows.length - 1))];
      setSelected((all) => new Set(all).add(row!.key).add(target!.key));
      focusRow(active + (key === "ArrowDown" ? 1 : -1));
    } else if (key === "ArrowDown" || key === "j") focusRow(active + 1);
    else if (key === "ArrowUp" || key === "k") focusRow(active - 1);
    else if (key === "Home") focusRow(0);
    else if (key === "End") focusRow(rows.length - 1);
    else if (key === "n" || key === "N") {
      const forward = !event.shiftKey;
      const order = forward ? rows.map((_, i) => i).slice(active + 1) : rows.map((_, i) => i).slice(0, active).reverse();
      const next = order.find((i) => rows[i]!.warnings.length > 0 || !seen.has(rows[i]!.key));
      if (next !== undefined) focusRow(next);
      else lab.announce(forward ? "No flagged or unseen passage after this one." : "None before this one.");
    } else if (key === "x" && row?.draft) {
      update(row.key, { included: false });
      focusLater(() => window.document.getElementById("wf-reason"));
    } else if (key === "i" && row?.draft) {
      update(row.key, { included: true, reason: "" });
      lab.announce(`Passage ${row.ordinal} included.`);
    } else if (key === "e" && row?.draft) {
      setEditing(true);
      focusLater(() => window.document.getElementById("wf-edit"));
    } else if (key === " " && row) {
      setSelected((all) => {
        const next = new Set(all);
        if (next.has(row.key)) next.delete(row.key);
        else next.add(row.key);
        return next;
      });
    } else if (key === "Enter" && event.ctrlKey) {
      save();
    } else return;
    event.preventDefault();
  };

  function save() {
    if (problems.length) {
      setSaveState({ text: problems.join(" "), failed: true });
      return;
    }
    setSaveState({ text: "Saving…" });
    lab.simulate(`review:${doc.id}`, { drafts, summary }).then(
      () => setSaveState({ text: "Saved." }),
      (error: unknown) =>
        error instanceof SimulatedFailure && error.kind === "conflict"
          ? setSaveState({ text: "Someone changed this review while you were working. Reload to see their change; your unsaved decisions stay listed.", failed: true, conflict: true })
          : setSaveState({ text: error instanceof Error ? error.message : "Couldn't save. Try again.", failed: true }),
    );
  }

  const included = allRows.filter((row) => row.draft?.included).length;
  const unknownCites = lab.scenario === "rp-unreachable";

  return (
    <div className="wf-desk">
      <section className="wf-progress" aria-label="Review progress">
        <p role="status">
          Seen <strong>{seen.size}</strong> of {allRows.length} · {tally.flagged} flagged · {tally.blocking} {tally.blocking === 1 ? "blocks" : "block"} approval · {dirty} unsaved
        </p>
        <progress max={allRows.length} value={seen.size} aria-label="Passages seen" />
      </section>

      <div className="wf-filters" role="group" aria-label="Show passages">
        {(
          [
            ["all", `All ${allRows.length}`],
            ["unseen", `Not seen yet ${allRows.length - seen.size}`],
            ["flagged", `Flagged ${tally.flagged}`],
            ["changed", `Changed ${tally.edited + tally.new}`],
            ["excluded", `Excluded ${tally.excludedAll}`],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setActive(0); }}>{label}</button>
        ))}
        <label className="wf-inline">
          <span className="visually-hidden">Find in passages</span>
          <input data-wf-find dir="auto" placeholder="Find" value={find} onChange={(event) => { setFind(event.target.value); setActive(0); }} />
        </label>
      </div>
      <KeysLine keys={[["↑↓ j k", "move"], ["n", "next flagged or unseen"], ["x / i", "exclude / include"], ["e", "edit"], ["Space", "select"], ["Ctrl+Enter", "save"]]} />

      <div className="wf-desk__body">
        {visible.length === 0 ? (
          <Empty title="Nothing matches." why="Change the filter or the find text." />
        ) : (
          <div role="grid" aria-label={`Passages of '${doc.title}'`} aria-rowcount={rows.length} className="wf-grid" ref={grid} onKeyDown={onGridKey}>
            <div role="row" className="wf-grid__head">
              <span role="columnheader">Select</span>
              <span role="columnheader">Where</span>
              <span role="columnheader">Text</span>
              <span role="columnheader">State</span>
            </div>
            {visible.map((row, index) => (
              <div
                key={row.key}
                id={`passage-${row.block?.id ?? row.key}`}
                role="row"
                aria-rowindex={index + 2}
                aria-selected={selected.has(row.key)}
                data-row={index}
                data-active={index === active}
                className={`wf-grid__row${index === active ? " is-active" : ""}${row.draft && !row.draft.included ? " is-excluded" : ""}`}
                onClick={() => { setActive(index); markSeen(row); }}
              >
                <span role="gridcell">
                  <input
                    type="checkbox"
                    tabIndex={-1}
                    aria-label={`Select passage ${row.ordinal}`}
                    checked={selected.has(row.key)}
                    onChange={() => setSelected((all) => { const next = new Set(all); if (next.has(row.key)) next.delete(row.key); else next.add(row.key); return next; })}
                  />
                </span>
                <span role="gridcell" data-cell tabIndex={index === active ? 0 : -1} onFocus={() => { setActive(index); markSeen(row); }}>
                  {humanWhere(row.where)}
                </span>
                <span role="gridcell" dir="auto" className="wf-grid__text">{row.draft?.text ?? row.basis}</span>
                <span role="gridcell" className="wf-grid__state">
                  {row.blocking ? <Status state="attention">Blocks approval</Status> : row.warnings.length ? <Status state="held">Flagged</Status> : null}{" "}
                  {row.change === "excluded" ? "Excluded" : row.change === "edited" ? "Edited" : row.change === "new" ? "New" : "Kept"}
                  {!seen.has(row.key) && <span className="wf-quiet"> · not seen</span>}
                </span>
              </div>
            ))}
            {visible.length < rows.length && (
              <div role="row"><span role="gridcell">
                <button type="button" className="wf-link-button" onClick={() => setLimit((value) => value + 200)}>Show the next 200 of {rows.length - visible.length}</button>
              </span></div>
            )}
          </div>
        )}

        {current?.draft && (
          <aside className="wf-detail" aria-label={`Passage ${current.ordinal}`}>
            <h2>Passage {current.ordinal}</h2>
            <p className="wf-quiet">{humanWhere(current.where)}</p>
            {current.warnings.map((warning) => (
              <p key={warning.code} className="wf-warning"><Status state={warning.severity === "blocking" ? "attention" : "held"}>{warning.severity === "blocking" ? "Blocks approval" : "Flagged"}</Status> {warning.message}</p>
            ))}
            {editing ? (
              <div className="wf-field">
                <label htmlFor="wf-edit">Text to publish</label>
                <textarea id="wf-edit" dir="auto" rows={5} value={current.draft.text} onChange={(event) => update(current.key, { text: event.target.value })}
                  onKeyDown={(event) => { if (event.key === "Escape") { setEditing(false); grid.current?.querySelector<HTMLElement>(`[data-row="${active}"] [data-cell]`)?.focus(); } }} />
              </div>
            ) : (
              <p dir="auto" className="wf-passage">{current.draft.text}</p>
            )}
            {current.basis !== null && current.basis.trim() !== current.draft.text.trim() && (
              <div><p className="wf-quiet">As extracted</p><p dir="auto" className="wf-passage wf-passage--muted">{current.basis}</p></div>
            )}
            <div className="wf-actions">
              {current.draft.included ? (
                <button type="button" className="wf-button" onClick={() => { update(current.key, { included: false }); focusLater(() => window.document.getElementById("wf-reason")); }}>Exclude (x)</button>
              ) : (
                <button type="button" className="wf-button" onClick={() => update(current.key, { included: true, reason: "" })}>Include (i)</button>
              )}
              <button type="button" className="wf-button" onClick={() => setEditing((on) => !on)}>{editing ? "Done editing" : "Edit (e)"}</button>
              <button type="button" className="wf-button" onClick={() => lab.announce("The original preview opens beside the passage.")}>Show the original (o)</button>
            </div>
            {!current.draft.included && (
              <div className="wf-field">
                <label htmlFor="wf-reason">Why exclude it?</label>
                <input id="wf-reason" dir="auto" value={current.draft.reason} onChange={(event) => update(current.key, { reason: event.target.value })}
                  onKeyDown={(event) => { if (event.key === "Escape" || event.key === "Enter") { event.preventDefault(); grid.current?.querySelector<HTMLElement>(`[data-row="${active}"] [data-cell]`)?.focus(); } }} />
                <p className="wf-hint">The document's reviewers see this.</p>
              </div>
            )}
          </aside>
        )}
      </div>

      {bulk.open && (
        <BulkExclude rows={allRows.filter((row) => selected.has(row.key))} panelRef={bulk.panel} onDone={(reason) => {
          for (const key of selected) update(key, { included: false, reason });
          lab.announce(`Excluded ${selected.size} passages.`);
          setSelected(new Set());
          bulk.close();
        }} onKeep={bulk.close} />
      )}

      <div className="wf-savebar" ref={bar}>
        {selected.size > 0 && !bulk.open && (
          <p className="wf-bulkbar">
            {selected.size} selected ·{" "}
            <button type="button" className="wf-button" onClick={bulk.show}>Exclude {selected.size}…</button>{" "}
            <button type="button" className="wf-button" onClick={() => { for (const key of selected) update(key, { included: true, reason: "" }); setSelected(new Set()); }}>Include</button>{" "}
            <button type="button" className="wf-link-button" onClick={() => setSelected(new Set())}>Clear</button>
          </p>
        )}
        <div className="wf-savebar__row">
          <label className="wf-inline wf-grow">
            <span>Review summary</span>
            <input dir="auto" value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What you checked, and what you changed" />
          </label>
          <ReasonedButton className="wf-button" reason={dirty === 0 && !summary ? "Nothing to save yet." : null} onClick={save}>Save review</ReasonedButton>
          <ReasonedButton id="wf-approve" className="wf-button wf-button--primary" reason={approved ? "Approved." : dirty > 0 || !lab.writes[`review:${doc.id}`] ? "Save your review before approving." : tally.blocking > 0 ? `${tally.blocking} passages block approval. Exclude them and save.` : null} onClick={approve.show}>
            Approve and publish…
          </ReasonedButton>
        </div>
        {saveState && <Outcome text={saveState.text} failed={saveState.failed} />}
      </div>

      {approve.open && (
        <ConsequencePanel
          panelRef={approve.panel}
          title={`Publish version ${version.number}`}
          happens={<>Publishing makes <strong>{included} passages</strong> citable.</>}
          affects={
            <>
              {livePublication(doc) && <p>It replaces the version in service, which {unknownCites ? "an unknown number of" : deps.data?.items.length ?? 0} requirements cite.</p>}
              <p>You looked at {seen.size} of {allRows.length} passages ({tally.flagged} flagged, {allRows.filter((row) => row.warnings.length && seen.has(row.key)).length} of them opened).</p>
            </>
          }
          reversible="You can withdraw it later; withdrawing tells the requirements that cite it."
          confirm={`Publish version ${version.number}`}
          keep="Not yet"
          onConfirm={() => lab.simulate(`approve:${doc.id}`, true).then(() => { setApproved(true); approve.close(); lab.announce("Published. Requirement work can cite it once it is indexed."); setSaveState({ text: "Published. Indexing runs in Jobs." }); lab.startJob({ kind: "Indexing", subject: doc.title, to: wf(`/library/${doc.id}`) }); }, () => setSaveState({ text: "Couldn't publish. Try again.", failed: true }))}
          onKeep={approve.close}
        />
      )}
      <Note>Coverage ("seen") is kept for this reviewer only and shown at approval; storing it with the approval needs the backend (BG2).</Note>
    </div>
  );
}

function BulkExclude({ rows, onDone, onKeep, panelRef }: { rows: Row[]; onDone: (reason: string) => void; onKeep: () => void; panelRef: RefObject<HTMLElement | null> }) {
  return (
    <ConsequencePanel
      panelRef={panelRef}
      title={`Exclude ${rows.length} passages`}
      happens="These passages won't be published with this version."
      affects={
        <ul className="wf-lines">
          {rows.slice(0, 8).map((row) => <li key={row.key}>{humanWhere(row.where)}: <span dir="auto">{(row.draft?.text ?? "").slice(0, 60)}</span></li>)}
          {rows.length > 8 && <li>and {rows.length - 8} more</li>}
        </ul>
      }
      reversible="You can include them again before you save."
      reasonLabel="Why exclude them?"
      reasonHint="One reason applies to all of them."
      confirm={`Exclude ${rows.length}`}
      keep="Cancel"
      onConfirm={onDone}
      onKeep={onKeep}
    />
  );
}

/** Locations in words (content guide): "Worksheet 1 › 2:2" becomes "Sheet 1, row 2". */
function humanWhere(where: string): string {
  return where.replace(/Worksheet (\d+)!(\d+):\d+/g, "Sheet $1, row $2").replace(/Worksheet (\d+)/g, "Sheet $1");
}

function Overview({ doc }: { doc: LibraryDocument }) {
  const version = newestVersion(doc);
  return (
    <section className="wf-section" aria-labelledby="ov">
      <h2 id="ov">Overview</h2>
      <dl className="wf-facts">
        <div><dt>Newest version</dt><dd>{version ? `${version.number} · ${version.filename}` : "—"}</dd></div>
        <div><dt>Stage</dt><dd>{DOC_STATE_WORDS[docState(doc)]}</dd></div>
        {version?.error && <div><dt>Why it failed</dt><dd>{version.error}</dd></div>}
      </dl>
      {docState(doc) === "attention" && (
        <p className="wf-warning"><Status state="attention" /> Couldn't read the file. {version?.error} <strong>Upload a new version</strong> with the fix, or try reading it again.</p>
      )}
    </section>
  );
}

function Versions({ doc }: { doc: LibraryDocument }) {
  return (
    <table className="wf-table">
      <caption>Versions</caption>
      <thead><tr><th scope="col">Version</th><th scope="col">File</th><th scope="col">Uploaded</th><th scope="col">Stage</th></tr></thead>
      <tbody>
        {[...doc.versions].reverse().map((version) => (
          <tr key={version.id}><th scope="row">{version.number}</th><td>{version.filename}</td><td className="wf-num">{version.uploaded_at.slice(0, 10)} · {version.uploaded_by.display_name}</td><td>{version.stage}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function CitedBy({ doc }: { doc: LibraryDocument }) {
  const lab = useLab();
  const deps = useDependencies(doc.id);
  if (lab.scenario === "rp-unreachable") return <p className="wf-warning"><Status state="attention" /> Couldn't ask Requirement AI who cites it. The count is unknown, not zero. <button type="button" className="wf-link-button" onClick={() => void deps.refetch()}>Try again</button></p>;
  if (deps.isPending) return <Skeleton label="Asking who cites it" rows={3} />;
  const items = deps.data?.items ?? [];
  return items.length === 0 ? (
    <Empty title="No requirement you can see cites this document." why="Requirement work cites published passages; citations appear here as they are made." />
  ) : (
    <ul className="wf-lines">
      {items.map((item) => <li key={item.requirement_id}><bdi>{item.requirement_title}</bdi>{item.publication_current ? "" : " · cites an older version"}</li>)}
    </ul>
  );
}

function Ownership({ doc }: { doc: LibraryDocument }) {
  const history = useQuery({ queryKey: ["wf", "ownership", doc.id], queryFn: () => api.ownershipHistory(doc.id) });
  return (
    <section className="wf-section" aria-labelledby="own">
      <h2 id="own">Ownership</h2>
      <p>Owner: {doc.owner.display_name}. Transferring hands its reviews and re-confirmations to the new owner.</p>
      <p className="wf-quiet">{history.data ? `${history.data.length} earlier transfers` : "Reading the history…"}</p>
      <Note>Transfer uses a person combobox with search, then a consequence panel (Journey 3).</Note>
    </section>
  );
}

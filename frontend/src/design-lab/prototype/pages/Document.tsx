import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, type RefObject, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";

import { api, type LibraryDocument, type LibraryVersion } from "../../../api/client";
import {
  ActionGroup,
  BulkActionBar,
  Button,
  type Column,
  ConsequencePanel,
  DataTable,
  EmptyState,
  FilterStrip,
  PageHeader,
  Skeleton,
  SplitPane,
  Status,
  StickyFooter,
  SubNav,
  TextArea,
  TextField,
} from "../../../design/components";
import { useDisclosure, useFocusAfterRender } from "../../../design/hooks";
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
import { DOC_STATE_WORDS, docState, useDependencies, useDocument } from "../../wireframes/data";
import { SimulatedFailure, useLab } from "../../wireframes/lab-context";
import { DOC_TONE, humanWhere, proto } from "../paths";
import { Facts, KeysHint, Lines, Outcome, RouterLink } from "../ui";

type Tab = "main" | "versions" | "cited-by" | "ownership";

/** Record archetype; its main tab is the review desk while a version awaits review. */
export function DocumentRecord({ tab }: { tab: Tab }) {
  const { documentId = "" } = useParams();
  const document = useDocument(documentId);
  if (document.isPending) return <Skeleton label="Reading the document" rows={8} />;
  if (!document.data) {
    return (
      <>
        <PageHeader title="We couldn't open this document" />
        <EmptyState title="It may have been withdrawn, or the service didn't answer." action={<RouterLink href={proto("/library")}>Back to the library</RouterLink>} />
      </>
    );
  }
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
  const base = proto(`/library/${doc.id}`);
  const withdrawn = Boolean(withdrawnWrite) || (stand.kind === "withdrawn" && !returned);
  const inService = (stand.kind === "service" && !withdrawnWrite) || Boolean(returned);
  const panel = useDisclosure(() => window.document.getElementById("proto-standing"));
  const [outcome, setOutcome] = useState<string | null>(null);

  const provenance =
    withdrawnWrite ? (
      <>Withdrawn just now by you.</>
    ) : stand.kind === "service" && live ? (
      <>In service since {live.activated_at?.slice(0, 10) ?? live.approved_at.slice(0, 10)} · approved by <bdi>{live.approved_by.display_name}</bdi> · from version {stand.versionNumber}</>
    ) : stand.kind === "withdrawn" ? (
      <>Withdrawn on {stand.publication.withdrawn_at?.slice(0, 10)} by <bdi>{stand.publication.withdrawn_by?.display_name ?? "—"}</bdi>: <q dir="auto">{stand.publication.withdrawal_reason}</q></>
    ) : (
      <>Not in service. Requirement work can't cite it until a review is approved.</>
    );

  return (
    <>
      <PageHeader
        title={doc.title}
        meta={<><Status tone={DOC_TONE[shownState]}>{DOC_STATE_WORDS[shownState]}</Status><span>Owner <bdi>{doc.owner.display_name}</bdi></span></>}
        provenance={provenance}
        actions={
          (inService || withdrawn) && !panel.open ? (
            <Button id="proto-standing" aria-expanded={false} onClick={panel.show}>
              {inService ? "Withdraw…" : "Return to service…"}
            </Button>
          ) : undefined
        }
      >
        <SubNav
          label="Document"
          link={RouterLink}
          items={[
            { href: base, label: reviewing ? "Review" : "Overview", current: tab === "main" },
            { href: `${base}/versions`, label: "Versions", current: tab === "versions" },
            { href: `${base}/cited-by`, label: "Cited by", current: tab === "cited-by" },
            { href: `${base}/ownership`, label: "Ownership", current: tab === "ownership" },
          ]}
        />
      </PageHeader>
      {panel.open && (
        <StandingPanel
          doc={doc}
          inService={inService}
          panelRef={panel.panel}
          onDone={(text) => {
            panel.close();
            setOutcome(text);
            lab.announce(text);
          }}
          onKeep={panel.close}
        />
      )}
      <Outcome text={outcome} />
      {tab === "main" && (reviewing ? <ReviewDesk doc={doc} version={newestVersion(doc)!} /> : <Overview doc={doc} />)}
      {tab === "versions" && <Versions doc={doc} />}
      {tab === "cited-by" && <CitedBy doc={doc} />}
      {tab === "ownership" && <Ownership doc={doc} />}
    </>
  );
}

/** Withdraw, or return to service, through a consequence panel in place (§5), with who depends on it first (§11). */
function StandingPanel({ doc, inService, panelRef, onDone, onKeep }: { doc: LibraryDocument; inService: boolean; panelRef: RefObject<HTMLElement | null>; onDone: (text: string) => void; onKeep: () => void }) {
  const lab = useLab();
  const deps = useDependencies(doc.id);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const unknown = lab.scenario === "rp-unreachable";
  const citing = deps.data?.items.length ?? 0;
  const more = Boolean(deps.data?.next_offset);
  const stand = standing(doc);

  const run = (key: string, done: string) => (reason: string) => {
    setBusy(true);
    setFailure(null);
    lab.simulate(key, reason).then(
      () => {
        setBusy(false);
        onDone(done);
      },
      (error: unknown) => {
        setBusy(false);
        setFailure(error instanceof SimulatedFailure ? `${error.message}${error.kind === "conflict" ? " Reload to see their change; your reason stays." : ""}` : "Couldn't do that. Try again.");
      },
    );
  };

  if (!inService) {
    return (
      <ConsequencePanel
        panelRef={panelRef}
        title={`Return '${doc.title}' to service`}
        happens={<>It was withdrawn{stand.kind === "withdrawn" && stand.publication.withdrawal_reason ? <>: <q dir="auto">{stand.publication.withdrawal_reason}</q></> : null}. Returning it makes its reviewed version citable again.</>}
        reversibility="You can withdraw it again later."
        reason={{ label: "Why is it coming back?", hint: "Recorded with the return, beside the withdrawal." }}
        confirmLabel="Return to service"
        keepLabel="Keep it withdrawn"
        onConfirm={run(`return:${doc.id}`, "Back in service. Requirement work can cite it again.")}
        onKeep={onKeep}
        busy={busy}
        failure={failure}
      />
    );
  }
  return (
    <ConsequencePanel
      tone="danger"
      panelRef={panelRef}
      title={`Withdraw '${doc.title}'`}
      happens="Requirement work can no longer cite this document."
      affects={
        unknown ? (
          <Status tone="attention">Couldn't ask Requirement AI who cites it. The count is unknown, not zero.</Status>
        ) : deps.isPending ? (
          <Status tone="working">Asking Requirement AI who cites it…</Status>
        ) : (
          <>
            <p>
              <strong className="ds-num">{citing}{more ? "+" : ""}</strong> {citing === 1 && !more ? "requirement cites" : "requirements cite"} it now (only requirements you can see).
              {citing > 0 && " Their owners will be asked to keep or revise the citation in Requirement AI."}
            </p>
            {citing > 0 && <Lines label="Requirements that cite it">{deps.data!.items.slice(0, 5).map((item) => <li key={item.requirement_id}><bdi>{item.requirement_title}</bdi></li>)}</Lines>}
          </>
        )
      }
      reversibility="You can return it to service later from this page."
      reason={{ label: "Why are you withdrawing it?", hint: "The requirement owners see this." }}
      confirmLabel={`Withdraw '${doc.title}'`}
      keepLabel="Keep it in service"
      onConfirm={run(`withdraw:${doc.id}`, "Withdrawn. Requirement work can no longer cite it.")}
      onKeep={onKeep}
      busy={busy}
      failure={failure}
    />
  );
}

type Filter = "all" | "unseen" | "flagged" | "changed" | "excluded";

/**
 * The review desk: progress, the passage grid beside the passage pane, a
 * selection bar, and the save bar. Compact by default (density "automatic").
 */
function ReviewDesk({ doc, version }: { doc: LibraryDocument; version: LibraryVersion }) {
  const lab = useLab();
  const location = useLocation();
  const ordered = useMemo(() => [...version.blocks].sort((a, b) => a.ordinal - b.ordinal), [version.blocks]);
  const hashBlock = location.hash.replace("#passage-", "");
  const [drafts, setDrafts] = useState<Drafts>(() => initialDrafts(version));
  // A link "#passage-…" (from search) opens the desk at that passage, seen and focused.
  const [arrival] = useState(() => reviewRows(doc, version, initialDrafts(version)).find((row) => row.block?.id === hashBlock)?.key);
  const [seen, setSeen] = useState<Set<string>>(() => new Set(arrival ? [arrival] : []));
  const [currentId, setCurrentId] = useState<string | undefined>(arrival);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [find, setFind] = useState("");
  const [limit, setLimit] = useState(() => Math.max(200, ordered.findIndex((block) => block.id === hashBlock) + 50));
  const [summary, setSummary] = useState("");
  const [summaryTried, setSummaryTried] = useState(false);
  const [saveState, setSaveState] = useState<{ text: string; failed?: boolean } | null>(null);
  const [approved, setApproved] = useState(false);
  const focusLater = useFocusAfterRender();
  const focusCurrent = () => focusLater(() => window.document.querySelector<HTMLElement>(".proto-desk tr.is-current [data-cell-focus]"));
  const bulk = useDisclosure(() => window.document.querySelector<HTMLElement>(".proto-desk tr.is-current [data-cell-focus]"));
  const approve = useDisclosure(() => window.document.getElementById("proto-approve"));

  const allRows = useMemo(() => reviewRows(doc, version, drafts), [doc, version, drafts]);
  const tally = counts(allRows);
  // Unsaved means "changed since the last save" (or since the version was read, before any save).
  const [savedDrafts, setSavedDrafts] = useState<Drafts>(() => initialDrafts(version));
  const dirty = version.blocks.filter((block) => {
    const a = drafts[block.id];
    const b = savedDrafts[block.id];
    return a && b && (a.text !== b.text || a.included !== b.included || (!a.included && a.reason !== b.reason));
  }).length;
  const problems = saveProblems(version, drafts, summary);
  const needle = find.trim().toLocaleLowerCase();
  const rows = allRows.filter((row) => {
    const pass =
      filter === "all" ||
      (filter === "unseen" && !seen.has(row.key)) ||
      (filter === "flagged" && row.warnings.length > 0) ||
      (filter === "changed" && (row.change === "edited" || row.change === "new")) ||
      (filter === "excluded" && row.change === "excluded");
    return pass && (!needle || `${row.where} ${row.draft?.text ?? ""}`.toLocaleLowerCase().includes(needle));
  });
  const visible = rows.slice(0, limit);
  const current = visible.find((row) => row.key === currentId) ?? visible[0];
  const deps = useDependencies(doc.id);
  const saved = Boolean(lab.writes[`review:${doc.id}`]);

  useEffect(() => {
    if (!arrival) return;
    const cell = window.document.querySelector<HTMLElement>(`.proto-desk tr[data-row-id="${CSS.escape(arrival)}"] [data-cell-focus]`);
    cell?.scrollIntoView({ block: "center" });
    cell?.focus({ preventScroll: true });
  }, [arrival]);

  const move = (id: string) => {
    setCurrentId(id);
    if (!seen.has(id)) setSeen((all) => new Set(all).add(id));
  };
  const update = (key: string, change: Partial<{ text: string; included: boolean; reason: string }>) =>
    setDrafts((all) => ({ ...all, [key]: { ...all[key]!, ...change } }));
  const exclude = (row: Row) => {
    update(row.key, { included: false });
    focusLater(() => window.document.querySelector<HTMLElement>("[name='proto-reason']"));
  };
  const include = (row: Row) => {
    update(row.key, { included: true, reason: "" });
    lab.announce(`Passage ${row.ordinal} included.`);
  };

  const onRowKey = (row: Row, key: string) => {
    if (key === "n" || key === "N") {
      const index = rows.indexOf(row);
      const order = key === "n" ? rows.slice(index + 1) : rows.slice(0, index).reverse();
      const next = order.find((item) => item.warnings.length > 0 || !seen.has(item.key));
      if (next) {
        if (rows.indexOf(next) >= limit) setLimit((value) => value + 200);
        move(next.key);
        focusCurrent();
      } else lab.announce(key === "n" ? "No flagged or unseen passage after this one." : "None before this one.");
      return true;
    }
    if (!row.draft) return false;
    if (key === "x") exclude(row);
    else if (key === "i") include(row);
    else if (key === "e") {
      setEditing(true);
      focusLater(() => window.document.querySelector<HTMLElement>("[name='proto-edit']"));
    } else if (key === "o") lab.announce("The original preview opens beside the passage.");
    else return false;
    return true;
  };

  function save() {
    if (problems.length) {
      setSaveState({ text: problems.join(" "), failed: true });
      if (!summary.trim()) {
        setSummaryTried(true);
        focusLater(() => window.document.querySelector<HTMLElement>("[name='proto-summary']"));
      }
      return;
    }
    setSaveState({ text: "Saving…" });
    const sent = drafts;
    lab.simulate(`review:${doc.id}`, { drafts: sent, summary }).then(
      () => {
        setSavedDrafts(sent);
        setSaveState({ text: `Saved at ${new Date().toTimeString().slice(0, 5)}.` });
      },
      (error: unknown) =>
        setSaveState(
          error instanceof SimulatedFailure && error.kind === "conflict"
            ? { text: "Someone changed this review while you were working. Reload to see their change; your unsaved decisions stay listed.", failed: true }
            : { text: error instanceof Error ? error.message : "Couldn't save. Try again.", failed: true },
        ),
    );
  }

  const onDeskKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      save();
    }
  };

  const included = allRows.filter((row) => row.draft?.included).length;
  const flaggedOpened = allRows.filter((row) => row.warnings.length && seen.has(row.key)).length;
  const unknownCites = lab.scenario === "rp-unreachable";
  const approveReason = approved ? "Published." : dirty > 0 || !saved ? "Save your review before approving." : tally.blocking > 0 ? `${tally.blocking} ${tally.blocking === 1 ? "passage blocks" : "passages block"} approval. Exclude them and save.` : null;

  const columns: Column<Row>[] = [
    { id: "where", header: "Where", rowHeader: true, width: "9rem", cell: (row) => <>{humanWhere(row.where)}{!seen.has(row.key) && <span className="ds-visually-hidden">, not seen</span>}</> },
    { id: "text", header: "Text", bidi: true, cell: (row) => <span className={`proto-cell-text${row.draft && !row.draft.included ? " proto-excluded" : ""}`}>{row.draft?.text ?? row.basis}</span> },
    {
      id: "state",
      header: "State",
      width: "13rem",
      cell: (row) => (
        <>
          {row.blocking ? <Status tone="attention">Blocks approval</Status> : row.warnings.length ? <Status tone="held">Flagged</Status> : null}
          {" "}
          <span>{row.change === "excluded" ? "Excluded" : row.change === "edited" ? "Edited" : row.change === "new" ? "New" : "Kept"}</span>
        </>
      ),
    },
  ];

  const pane = current?.draft ? (
    <>
      <h2 className="ds-section__title">Passage {current.ordinal}</h2>
      <p className="proto-quiet">{humanWhere(current.where)}{seen.has(current.key) ? " · seen" : ""}</p>
      {current.warnings.map((warning) => (
        <p key={warning.code}>
          <Status tone={warning.severity === "blocking" ? "attention" : "held"}>{warning.severity === "blocking" ? "Blocks approval" : "Flagged"}</Status> {warning.message}
        </p>
      ))}
      {editing ? (
        <TextArea
          name="proto-edit"
          label="Text to publish"
          hint="Esc returns to the passage list."
          rows={6}
          value={current.draft.text}
          onChange={(event) => update(current.key, { text: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setEditing(false);
              focusCurrent();
            }
          }}
        />
      ) : (
        <p dir="auto" className="proto-passage">{current.draft.text}</p>
      )}
      {current.basis !== null && current.basis.trim() !== current.draft.text.trim() && (
        <div>
          <p className="proto-quiet">As read from the file</p>
          <p dir="auto" className="proto-passage proto-passage--muted">{current.basis}</p>
        </div>
      )}
      <ActionGroup label={`Decide passage ${current.ordinal}`}>
        {current.draft.included ? (
          <Button aria-keyshortcuts="x" onClick={() => exclude(current)}>Exclude (x)</Button>
        ) : (
          <Button aria-keyshortcuts="i" onClick={() => include(current)}>Include (i)</Button>
        )}
        <Button aria-keyshortcuts="e" onClick={() => setEditing((on) => !on)}>{editing ? "Done editing" : "Edit (e)"}</Button>
        <Button variant="quiet" aria-keyshortcuts="o" onClick={() => lab.announce("The original preview opens beside the passage.")}>Show the original (o)</Button>
      </ActionGroup>
      {!current.draft.included && (
        <TextField
          name="proto-reason"
          label="Why exclude it?"
          hint="The document's reviewers see this. Enter returns to the list."
          value={current.draft.reason}
          onChange={(event) => update(current.key, { reason: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Enter") {
              event.preventDefault();
              focusCurrent();
            }
          }}
        />
      )}
    </>
  ) : (
    <p className="proto-quiet">Choose a passage to see it in full.</p>
  );

  return (
    <div className="proto-desk" data-density={lab.density === "automatic" ? "compact" : lab.density} onKeyDownCapture={onDeskKey}>
      <section className="proto-progress" aria-label="Review progress">
        <p role="status">
          Seen <strong className="ds-num">{seen.size}</strong> of {allRows.length} · {tally.flagged} flagged · {tally.blocking} {tally.blocking === 1 ? "blocks" : "block"} approval · {dirty} unsaved {dirty === 1 ? "change" : "changes"}
        </p>
        <progress max={allRows.length} value={seen.size} aria-label="Passages seen" />
      </section>

      <FilterStrip
        label="Show passages"
        filters={[
          { id: "all", label: "All", count: allRows.length },
          { id: "unseen", label: "Not seen yet", count: allRows.length - seen.size },
          { id: "flagged", label: "Flagged", count: tally.flagged },
          { id: "changed", label: "Changed", count: tally.edited + tally.new },
          { id: "excluded", label: "Excluded", count: tally.excludedAll },
        ]}
        active={filter}
        onChange={(id) => setFilter(id as Filter)}
        find={{ label: "Find in passages", value: find, onChange: setFind }}
        onClear={filter !== "all" || find ? () => { setFilter("all"); setFind(""); } : undefined}
      />
      <KeysHint keys={[["↑↓ j k", "move"], ["n", "next flagged or unseen"], ["x / i", "exclude / include"], ["e", "edit"], ["Space", "select"], ["Ctrl+Enter", "save"]]} />

      <SplitPane
        paneLabel={current ? `Passage ${current.ordinal}` : "Passage"}
        list={
          <>
            <DataTable
              caption={`Passages of '${doc.title}'`}
              captionHidden
              columns={columns}
              rows={visible}
              rowId={(row) => row.key}
              rowLabel={(row) => `passage ${row.ordinal}`}
              selected={selected}
              onSelectedChange={setSelected}
              currentId={current?.key}
              onCurrentChange={move}
              onActivate={() => focusLater(() => window.document.querySelector<HTMLElement>(".ds-split__pane .ds-button"))}
              onRowKey={onRowKey}
              emptyText="Nothing matches. Change the filter or the find text."
            />
            {visible.length < rows.length && (
              <p className="proto-more">
                <Button variant="link" onClick={() => setLimit((value) => value + 200)}>Show the next 200 of {rows.length - visible.length}</Button>
              </p>
            )}
          </>
        }
        pane={pane}
      />

      {bulk.open && (
        <ConsequencePanel
          panelRef={bulk.panel}
          title={`Exclude ${selected.size} passages`}
          happens="These passages won't be published with this version."
          affects={
            <Lines label="Passages to exclude">
              {allRows.filter((row) => selected.has(row.key)).slice(0, 8).map((row) => <li key={row.key}>{humanWhere(row.where)}: <span dir="auto">{(row.draft?.text ?? "").slice(0, 70)}</span></li>)}
              {selected.size > 8 && <li>and {selected.size - 8} more</li>}
            </Lines>
          }
          reversibility="You can include them again before you save."
          reason={{ label: "Why exclude them?", hint: "One reason applies to all of them. The document's reviewers see it." }}
          confirmLabel={`Exclude ${selected.size}`}
          keepLabel="Cancel"
          onConfirm={(reason) => {
            for (const key of selected) update(key, { included: false, reason });
            lab.announce(`Excluded ${selected.size} passages.`);
            setSelected(new Set());
            bulk.close();
          }}
          onKeep={bulk.close}
        />
      )}

      {approve.open && (
        <ConsequencePanel
          panelRef={approve.panel}
          title={`Publish version ${version.number}`}
          happens={<>Publishing makes <strong>{included} passages</strong> citable by requirement work.</>}
          affects={
            <>
              {livePublication(doc) && <p>It replaces the version in service, which {unknownCites ? "an unknown number of" : deps.data?.items.length ?? 0} requirements cite.</p>}
              <p>You looked at {seen.size} of {allRows.length} passages; {flaggedOpened} of the {tally.flagged} flagged ones.</p>
            </>
          }
          reversibility="You can withdraw it later; withdrawing tells the requirements that cite it."
          confirmLabel={`Publish version ${version.number}`}
          keepLabel="Not yet"
          onConfirm={() =>
            lab.simulate(`approve:${doc.id}`, true).then(
              () => {
                setApproved(true);
                approve.close();
                lab.announce("Published. Requirement work can cite it once it is indexed.");
                setSaveState({ text: "Published. Indexing runs in Jobs." });
                lab.startJob({ kind: "Indexing", subject: doc.title, to: proto(`/library/${doc.id}`) });
              },
              () => setSaveState({ text: "Couldn't publish. Try again.", failed: true }),
            )
          }
          onKeep={approve.close}
        />
      )}

      <BulkActionBar count={bulk.open ? 0 : selected.size} noun={["passage", "passages"]} onClear={() => setSelected(new Set())}>
        <Button onClick={bulk.show}>Exclude {selected.size}…</Button>
        <Button onClick={() => { for (const key of selected) update(key, { included: true, reason: "" }); setSelected(new Set()); }}>Include {selected.size}</Button>
      </BulkActionBar>

      <StickyFooter label="Save the review">
        <div className="proto-savebar">
          <div className="proto-savebar__row">
            <TextField
              name="proto-summary"
              label="Review summary"
              required
              hint="What you checked, and what you changed. The document's reviewers see it."
              error={summaryTried && !summary.trim() ? "Write a review summary before saving." : null}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
            <ActionGroup>
              <Button unavailableReason={dirty === 0 && !summary ? "Nothing to save yet." : null} onClick={save}>Save review</Button>
              <Button id="proto-approve" variant={approve.open ? "secondary" : "primary"} unavailableReason={approveReason} aria-expanded={approve.open} onClick={approve.show}>Approve and publish…</Button>
            </ActionGroup>
          </div>
          <Outcome text={saveState?.text} failed={saveState?.failed} />
        </div>
      </StickyFooter>
    </div>
  );
}

function Overview({ doc }: { doc: LibraryDocument }) {
  const version = newestVersion(doc);
  const state = docState(doc);
  return (
    <section aria-label="Overview">
      {state === "attention" && (
        <p><Status tone="attention">Couldn't read the file.</Status> {version?.error} Upload a new version with the fix, or try reading it again.</p>
      )}
      {state === "held" && <p><Status tone="held">Held by the malware scan.</Status> It won't be read. Upload a clean copy.</p>}
      <Facts
        items={[
          ["Newest version", version ? <>{version.number} · <bdi>{version.filename}</bdi></> : "—"],
          ["State", DOC_STATE_WORDS[state]],
          ["Owner", <bdi>{doc.owner.display_name}</bdi>],
          ...(version?.error ? [["Why it failed", version.error] as [string, string]] : []),
        ]}
      />
    </section>
  );
}

function Versions({ doc }: { doc: LibraryDocument }) {
  type V = LibraryVersion;
  return (
    <DataTable<V>
      caption="Versions"
      captionHidden
      columns={[
        { id: "n", header: "Version", rowHeader: true, numeric: true, cell: (v) => v.number },
        { id: "file", header: "File", bidi: true, cell: (v) => v.filename },
        { id: "up", header: "Uploaded", cell: (v) => <><span className="ds-num">{v.uploaded_at.slice(0, 10)}</span> · <bdi>{v.uploaded_by.display_name}</bdi></> },
        { id: "stage", header: "Stage", cell: (v) => v.stage.replace(/_/g, " ") },
      ]}
      rows={[...doc.versions].reverse()}
      rowId={(v) => v.id}
    />
  );
}

function CitedBy({ doc }: { doc: LibraryDocument }) {
  const lab = useLab();
  const deps = useDependencies(doc.id);
  if (lab.scenario === "rp-unreachable") {
    return (
      <p>
        <Status tone="attention">Couldn't ask Requirement AI who cites it. The count is unknown, not zero.</Status>{" "}
        <Button variant="link" onClick={() => void deps.refetch()}>Try again</Button>
      </p>
    );
  }
  if (deps.isPending) return <Skeleton label="Asking who cites it" rows={3} />;
  const items = deps.data?.items ?? [];
  return items.length === 0 ? (
    <EmptyState title="No requirement you can see cites this document.">
      <p>Requirement work cites published passages; citations appear here as they are made.</p>
    </EmptyState>
  ) : (
    <Lines label="Requirements that cite it">
      {items.map((item) => <li key={item.requirement_id}><bdi>{item.requirement_title}</bdi>{item.publication_current ? "" : " · cites an older version"}</li>)}
    </Lines>
  );
}

function Ownership({ doc }: { doc: LibraryDocument }) {
  const history = useQuery({ queryKey: ["wf", "ownership", doc.id], queryFn: () => api.ownershipHistory(doc.id) });
  return (
    <section aria-label="Ownership">
      <p>Owner: <bdi>{doc.owner.display_name}</bdi>. Transferring hands its reviews and re-confirmations to the new owner.</p>
      <p className="proto-quiet">{history.data ? `${history.data.length} earlier ${history.data.length === 1 ? "transfer" : "transfers"}` : "Reading the history…"}</p>
    </section>
  );
}

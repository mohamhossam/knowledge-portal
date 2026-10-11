/**
 * The design-system gallery (redesign Phase 5): every component, its states,
 * both themes, both densities, bidi samples, and red used correctly vs not.
 * Development only (App.tsx guards it with import.meta.env.DEV).
 */
import "../../design";
import "./gallery.css";

import { CircleHelp, ListChecks, Trash2, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import {
  ActionGroup,
  AppShell,
  Badge,
  Breadcrumbs,
  BulkActionBar,
  Button,
  Checkbox,
  type Column,
  Combobox,
  ConsequencePanel,
  DataTable,
  DecisionButtons,
  Dialog,
  DiffView,
  Drawer,
  EmptyState,
  EvidenceQuote,
  FilterStrip,
  HelpContent,
  ImpactPanel,
  JobTray,
  MastheadButton,
  PageHeader,
  Pagination,
  ProvenanceTrail,
  RadioGroup,
  Section,
  Select,
  ShortcutHelp,
  Skeleton,
  type Sort,
  SplitPane,
  StateLine,
  Status,
  SubNav,
  Suggested,
  Tabs,
  TextArea,
  TextField,
  Toggletip,
  Toolbar,
  UndoToast,
  Upload,
} from "../../design/components";
import { useDisclosure } from "../../design/hooks";

type Row = { id: string; title: string; state: "review" | "service" | "attention"; passages: number; owner: string };

const ROWS: Row[] = [
  { id: "1", title: "Product eligibility matrix (sample)", state: "review", passages: 404, owner: "Amina Owner" },
  { id: "2", title: "سياسة التحقق من العنوان (sample)", state: "review", passages: 3, owner: "Amina Owner" },
  { id: "3", title: "Site survey checklist (sample)", state: "attention", passages: 0, owner: "Ravi Reviewer" },
  { id: "4", title: "XGPON coverage rules (sample)", state: "service", passages: 12, owner: "Amina Owner" },
  { id: "5", title: "إجراءات نقل الأرقام (sample)", state: "service", passages: 1, owner: "Ravi Reviewer" },
];

const SECTIONS = [
  ["foundations", "Foundations"],
  ["shell", "Shell and page"],
  ["actions", "Actions and status"],
  ["forms", "Forms"],
  ["data", "Data table and review"],
  ["compare", "Compare, impact, provenance"],
  ["overlays", "Overlays and help"],
  ["red", "Red: right and wrong"],
] as const;

export default function Gallery() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const help = useDisclosure(() => document.getElementById("gallery-help"));
  const nav = SECTIONS.map(([id, label]) => ({ href: `#${id}`, label }));

  return (
    <div data-theme={theme} data-density={density}>
      <AppShell
        homeHref="#top"
        product="Knowledge portal · Design system"
        outbound={{ href: "#", label: "Requirement AI" }}
        navigation={nav}
        banner={
          <span className="gallery-controls" role="group" aria-label="Gallery settings (not part of the design)">
            <label>Theme <select value={theme} onChange={(e) => setTheme(e.target.value as "light" | "dark")}><option value="light">Light</option><option value="dark">Dark (warm charcoal)</option></select></label>
            <label>Density <select value={density} onChange={(e) => setDensity(e.target.value as "comfortable" | "compact")}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
          </span>
        }
        utilities={
          <>
            <MastheadButton icon={<ListChecks size={16} />} label="Jobs" count={2} countLabel="active or needing attention" onClick={() => {}} />
            <MastheadButton id="gallery-help" icon={<CircleHelp size={16} />} label="Help" expanded={help.open} onClick={(e) => (help.open ? help.close() : help.show(e))} />
            <MastheadButton icon={<UserRound size={16} />} label="Amina Owner" onClick={() => {}} />
          </>
        }
      >
        <div className="gallery">
          <PageHeader title="Design system" lead="Direction A, “Timetable, evolved”, in e& calm. Every component, state, theme and density." />
          <Foundations />
          <ShellAndPage />
          <ActionsAndStatus />
          <Forms />
          <DataAndReview />
          <CompareAndProvenance />
          <OverlaysAndHelp />
          <RedUsage />
        </div>
        {help.open && (
          <Drawer title="Help" onClose={help.close} panelRef={help.panel}>
            <HelpContent
              page={{ title: "The design system", body: "Pick a theme and a density above; every component below follows them." }}
              terms={[{ term: "Ledger rule", meaning: "The 2px rule under every head: direction A's signature." }]}
              contact={<p>Contact to be configured.</p>}
            />
          </Drawer>
        )}
      </AppShell>
    </div>
  );
}

function Foundations() {
  const swatches = [
    ["--color-surface", "Surface"], ["--color-surface-1", "Surface 1"], ["--color-surface-2", "Surface 2"], ["--color-surface-3", "Surface 3 (beige)"],
    ["--color-ink", "Ink"], ["--color-ink-2", "Ink 2"], ["--color-ink-3", "Ink 3 (e& grey)"],
    ["--color-action-fill", "Action (maroon)"], ["--color-selected", "Selected"], ["--color-brand-accent", "Brand accent (red)"],
    ["--color-danger", "Danger"], ["--color-warning", "Warning"], ["--color-success", "Success"], ["--color-info", "Info / Suggested"],
  ];
  return (
    <Section title="Foundations">
      <div id="foundations" className="gallery-swatches">
        {swatches.map(([token, name]) => (
          <figure key={token} className="gallery-swatch">
            <span className="gallery-swatch__chip" style={{ background: `var(${token})` }} />
            <figcaption><strong>{name}</strong><br /><code>{token}</code></figcaption>
          </figure>
        ))}
      </div>
      <div className="gallery-type">
        <p style={{ fontSize: "var(--text-h1)", fontWeight: "var(--weight-heading)", fontStretch: "var(--stretch-title)" }}>Heading 1 · Archivo 26/680, 92% width</p>
        <p style={{ fontSize: "var(--text-h2)", fontWeight: "var(--weight-heading)" }}>Heading 2 · 20/680</p>
        <p>Body 15/400 for UI, 1.45 leading. The ledger rule sits under every head.</p>
        <p className="ds-num" style={{ fontStretch: "var(--stretch-numeral)" }}>Numerals 1,204 · 404 · 2026-10-08, condensed and tabular</p>
        <p dir="rtl" lang="ar" style={{ fontSize: "var(--text-reading)" }}>يجب التحقق من العنوان قبل تفعيل الخدمة. نص عربي بخط Noto Sans Arabic وبتباعد أسطر أوسع.</p>
        <p style={{ fontSize: "var(--text-meta)", color: "var(--color-ink-2)" }}>Meta 14/400: the floor. No text is smaller.</p>
      </div>
      <div className="gallery-chart" aria-label="Chart palette" role="img">
        {[1, 2, 3, 4, 5, 6].map((n) => <span key={n} style={{ background: `var(--color-chart-${n})` }} />)}
        {[1, 2, 3, 4, 5].map((n) => <span key={`s${n}`} style={{ background: `var(--color-seq-${n})` }} />)}
      </div>
    </Section>
  );
}

function ShellAndPage() {
  const [tab, setTab] = useState<"changes" | "check">("changes");
  return (
    <Section title="Shell and page">
      <div id="shell" className="gallery-stack">
        <Breadcrumbs items={[{ href: "#", label: "Library" }, { label: "سياسة التحقق من العنوان (sample)" }]} />
        <PageHeader
          title="Product eligibility matrix (sample)"
          documentTitle="Design system"
          meta={<><Status tone="neutral">Ready for review</Status><span>Owner Amina Owner</span></>}
          provenance="Not in service. Requirement work can't cite it until a review is approved."
          actions={<Button variant="quiet">Withdraw…</Button>}
        >
          <SubNav label="Document" items={[{ href: "#", label: "Review", current: true }, { href: "#", label: "Versions" }, { href: "#", label: "Cited by", count: 7 }, { href: "#", label: "Ownership" }]} />
        </PageHeader>
        <StateLine>Draft 'October integration update' · 18 to decide · Not built · Not checked</StateLine>
        <StateLine tone="proof">You're reading a replaced version, 'Initial catalogue'. · <a href="#">Read the version in service</a></StateLine>
        <Tabs label="Draft view" tabs={[{ id: "changes", label: "Changes" }, { id: "check", label: "Check" }]} selected={tab} onSelect={setTab}>
          <p>{tab === "changes" ? "Changes against the version in service." : "Build and sample checks."}</p>
        </Tabs>
        <Toolbar label="Draft actions"><Button>Rename…</Button><Button>Download as Excel</Button><Button variant="quiet" icon={<Trash2 size={14} />}>Delete the draft…</Button></Toolbar>
        <Pagination page={2} pages={9} onPage={() => {}} />
      </div>
    </Section>
  );
}

function ActionsAndStatus() {
  const [undo, setUndo] = useState(true);
  return (
    <Section title="Actions and status">
      <div id="actions" className="gallery-stack">
        <ActionGroup label="Buttons">
          <Button variant="primary">Publish and put in service</Button>
          <Button>Save review</Button>
          <Button variant="quiet">Cancel</Button>
          <Button variant="link">All shortcuts</Button>
          <Button variant="danger" icon={<Trash2 size={14} />}>Withdraw 'XGPON coverage rules'</Button>
          <Button variant="primary" busy>Working…</Button>
        </ActionGroup>
        <div><Button variant="primary" unavailableReason="Save your review before approving.">Approve and publish…</Button></div>
        <p className="gallery-row">
          <Status tone="neutral">Waiting</Status><Status tone="working">Working</Status><Status tone="done">Done</Status>
          <Status tone="attention">Needs attention</Status><Status tone="held">Held</Status><Status tone="stopped">Stopped</Status>
        </p>
        <p className="gallery-row"><a href="#">Your work<Badge count={6} label="need you" /></a> <Suggested basis="stated" /> <Suggested basis="inferred" detail="Model fake-catalogue-extractor" /></p>
        {undo && <UndoToast message="Rejected: Adds the system Dynamics CRM." onUndo={() => setUndo(false)} onDismiss={() => setUndo(false)} />}
        <EmptyState title="Nothing needs you." action={<Button>See everyone's work</Button>}>No re-confirmations are due until 3 Nov.</EmptyState>
        <Skeleton rows={3} label="Reading the library" />
        <JobTray jobs={[
          { id: "1", kind: "Reading", subject: "eligibility.xlsx", state: "working", timing: "1 min 20 s so far" },
          { id: "2", kind: "Reading", subject: "survey.csv", state: "attention", cause: "The columns aren't separated by commas.", fix: <Button>Upload a new version</Button>, onRetry: () => {} },
          { id: "3", kind: "Scan", subject: "deck.pptx", state: "held", cause: "The malware scan flagged the file." },
          { id: "4", kind: "Indexing", subject: "XGPON coverage rules", state: "done", timing: "Ended after 42 s" },
        ]} />
      </div>
    </Section>
  );
}

function Forms() {
  const [density, setDensity] = useState<"automatic" | "comfortable" | "compact">("automatic");
  return (
    <Section title="Forms">
      <div id="forms" className="gallery-grid">
        <TextField label="Review summary" hint="What you checked, and what you changed." placeholder="What you checked" />
        <TextField label="Why exclude it?" hint="The document's reviewers see this." error="Give a reason. The document's reviewers see this." required />
        <TextArea label="Why publish it?" hint="Recorded in the catalogue's history." />
        <Select label="Owner"><option>Everyone</option><option>Mine</option></Select>
        <Checkbox label="Page-wide keyboard shortcuts (g, ?, /)" hint="Off by default (WCAG 2.1.4)." />
        <RadioGroup legend="Density" name="g-density" value={density} onChange={setDensity} options={[{ value: "automatic", label: "Automatic", hint: "Compact on review desks" }, { value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} />
        <Combobox label="Squad" hint="Type to find; ↓ ↑ Enter." options={[{ id: "care", label: "Care squad (sample)" }, { id: "sales", label: "Sales squad (sample)" }, { id: "ful", label: "Fulfilment squad (sample)" }]} suggested={{ id: "sales", reason: "runs 2 other systems in 'Partner channel'" }} onSelect={() => {}} />
        <Upload hint="PDF, Word, Excel, PowerPoint, CSV, Markdown, text." items={[{ name: "eligibility.xlsx", state: "working", note: "Scanning" }, { name: "deck.pptx", state: "held", note: "Held by the malware scan" }, { name: "policy.pdf", state: "done", note: "Ready for review" }]} onFiles={() => {}} />
      </div>
    </Section>
  );
}

function DataAndReview() {
  const [sort, setSort] = useState<Sort>({ id: "title", direction: "ascending" });
  const [selected, setSelected] = useState(new Set<string>());
  const [current, setCurrent] = useState<string>("1");
  const [filter, setFilter] = useState("all");
  const [find, setFind] = useState("");
  const rows = useMemo(() => {
    const shown = ROWS.filter((r) => (filter === "all" || r.state === filter) && r.title.toLocaleLowerCase().includes(find.toLocaleLowerCase()));
    const key = (r: Row) => (sort.id === "passages" ? String(r.passages).padStart(6, "0") : r.title);
    return [...shown].sort((a, b) => key(a).localeCompare(key(b)) * (sort.direction === "ascending" ? 1 : -1));
  }, [filter, find, sort]);
  const columns: Column<Row>[] = [
    { id: "title", header: "Document", cell: (r) => <a href="#">{r.title}</a>, rowHeader: true, sortable: true, bidi: true },
    { id: "state", header: "State", cell: (r) => (r.state === "review" ? <Status tone="neutral">Ready for review</Status> : r.state === "service" ? <Status tone="done">In service</Status> : <Status tone="attention">Needs attention</Status>) },
    { id: "owner", header: "Owner", cell: (r) => r.owner },
    { id: "passages", header: "Passages", cell: (r) => r.passages, numeric: true, sortable: true },
  ];
  const active = ROWS.find((r) => r.id === current);
  return (
    <Section title="Data table and review">
      <div id="data" className="gallery-stack">
        <FilterStrip
          label="Filter documents"
          filters={[{ id: "all", label: "All", count: ROWS.length }, { id: "review", label: "Ready for review", count: 2 }, { id: "service", label: "In service", count: 2 }, { id: "attention", label: "Needs attention", count: 1 }]}
          active={filter}
          onChange={setFilter}
          find={{ label: "Find a document", value: find, onChange: setFind }}
          onClear={filter !== "all" || find ? () => { setFilter("all"); setFind(""); } : undefined}
        />
        <SplitPane
          paneLabel={active ? `Document ${active.title}` : "Detail"}
          list={
            <DataTable caption="Documents (keyboard grid: ↑ ↓ j k, Enter, Space, Shift+↑/↓)" columns={columns} rows={rows} rowId={(r) => r.id} rowLabel={(r) => r.title}
              sort={sort} onSort={setSort} selected={selected} onSelectedChange={setSelected} currentId={current} onCurrentChange={setCurrent} onActivate={(r) => setCurrent(r.id)} />
          }
          pane={
            active ? (
              <>
                <h3 dir="auto">{active.title}</h3>
                <ProvenanceTrail hops={[{ label: "Version", value: "2 · eligibility.xlsx" }, { label: "Uploaded by", value: active.owner }]} />
                <DecisionButtons kind="passage" subject={`passage 1 of ${active.title}`} onDecide={() => {}} />
              </>
            ) : null
          }
        />
        <BulkActionBar count={selected.size} noun={["document", "documents"]} onClear={() => setSelected(new Set())}>
          <Button>Transfer {selected.size}…</Button>
        </BulkActionBar>
        <DecisionButtons kind="suggestion" subject="Adds the system Dynamics CRM" onDecide={() => {}} />
        <DecisionButtons kind="suggestion" subject="Depends on CWOM" state="Accepted by Amina Owner · 8 Oct" onDecide={() => {}} />
      </div>
    </Section>
  );
}

function CompareAndProvenance() {
  const [open, setOpen] = useState(true);
  return (
    <Section title="Compare, impact, provenance">
      <div id="compare" className="gallery-stack">
        <DiffView
          fromLabel="Initial catalogue"
          toLabel="October integration update"
          changes={[
            { key: "oh", kind: "added", item: "System", label: "Order Hub", origin: "Suggestion, accepted by Amina Owner" },
            { key: "cw", kind: "changed", item: "System", label: "CWOM", fields: [{ name: "Owner", from: "Fulfilment squad", to: "Care squad" }, { name: "Landscape area", from: "Order orchestration", to: "Service assurance" }], origin: "Hand edit by Ravi Reviewer" },
            { key: "ad", kind: "removed", item: "System", label: "Legacy ADSL gateway", origin: "Catalogue file" },
          ]}
        />
        <ImpactPanel title="Mapping impact" state={{ kind: "checked", at: "14:02" }} counts={[{ label: "Requirements that would map differently", value: 3 }, { label: "Features", value: 1 }]} caveat="Only requirements you can see." />
        <ImpactPanel title="Cited by" state={{ kind: "unknown", why: "Couldn't ask Requirement AI." }} />
        <ImpactPanel title="Check" state={{ kind: "stale", at: "14:02" }} onCheck={() => {}} />
        <EvidenceQuote text={"System: Order Hub\nCaptures business orders from the web (sample)."} quote="System: Order Hub" source="Integration design (sample) · version 2 · lines 1–12" />
        <ProvenanceTrail hops={[{ label: "Fact", value: "Order Hub captures business orders" }, { label: "Evidence", value: "lines 1–12", href: "#" }, { label: "Document", value: "Integration design, version 2", href: "#" }, { label: "Catalogue version", value: "October integration update" }, { label: "Decided by", value: "Amina Owner, 8 Oct" }]} />
        {open ? (
          <ConsequencePanel
            tone="danger"
            title="Withdraw 'XGPON coverage rules (sample)'"
            happens="Requirement work can no longer cite this document."
            affects={<p>7 requirements cite it now (only requirements you can see). They'll be asked to keep or revise their citation in Requirement AI.</p>}
            reversibility="You can return it to service later from this page."
            reason={{ label: "Why are you withdrawing it?", hint: "The requirement owners see this." }}
            confirmLabel="Withdraw 'XGPON coverage rules (sample)'"
            keepLabel="Keep it in service"
            onConfirm={() => setOpen(false)}
            onKeep={() => setOpen(false)}
          />
        ) : (
          <Button onClick={() => setOpen(true)}>Show the consequence panel again</Button>
        )}
      </div>
    </Section>
  );
}

function OverlaysAndHelp() {
  const [dialog, setDialog] = useState(false);
  const [on, setOn] = useState(false);
  return (
    <Section title="Overlays and help">
      <div id="overlays" className="gallery-stack">
        <p>Search index for tables <Toggletip label="Search index for tables">A second index that keeps table rows together, so searches over tables find whole rows.</Toggletip></p>
        <div><Button onClick={() => setDialog(true)}>Open the 409 dialog</Button></div>
        <Dialog open={dialog} title="Someone changed this draft" onClose={() => setDialog(false)} actions={<><Button variant="primary" onClick={() => setDialog(false)}>Reload</Button><Button onClick={() => setDialog(false)}>Review their change</Button></>}>
          Reload to see their change; your unsaved decisions stay listed.
        </Dialog>
        <ShortcutHelp
          enabled={on}
          onToggle={setOn}
          widget={[{ title: "Review grid", shortcuts: [{ keys: "↑ ↓ / j k", does: "Previous or next passage" }, { keys: "x / i", does: "Exclude / include" }, { keys: "n", does: "Next flagged or unseen" }, { keys: "z", does: "Undo the last decision" }] }]}
          global={[{ keys: "?", does: "Open help" }, { keys: "g w", does: "Go to Your work" }, { keys: "/", does: "Find on this page" }]}
        />
      </div>
    </Section>
  );
}

function RedUsage() {
  return (
    <Section title="Red: right and wrong">
      <div id="red" className="gallery-red">
        <figure>
          <figcaption><Status tone="done">Do</Status> Red marks the brand and where you are: the logo, the active-area marker, and at most one focal accent per view.</figcaption>
          <div className="gallery-red__sample">
            <span className="ds-logo" role="img" aria-label="e&">e&</span>
            <span className="gallery-red__nav">Library</span>
          </div>
        </figure>
        <figure>
          <figcaption><Status tone="attention">Don't</Status> Red never means a state: not failure, not overdue, not "removed", not a count, not a destructive button. Use the danger token with an icon and words.</figcaption>
          <div className="gallery-red__sample gallery-red__sample--wrong" aria-hidden="true">
            <span className="gallery-red__wrong-status">Failed</span>
            <span className="gallery-red__wrong-badge">24</span>
            <span className="gallery-red__wrong-button">Delete</span>
          </div>
          <p className="gallery-note">Shown crossed out on purpose; hidden from assistive tech.</p>
        </figure>
      </div>
    </Section>
  );
}

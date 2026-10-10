import { CircleCheck, CircleDashed, Lightbulb } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";

import { errorMessage } from "../api/errors";
import { Button, Drawer, EmptyState, PageHeader, Skeleton, StateLine, SubNav } from "../design/components";
import { RouterLink } from "../shell/links";
import type { Release } from "../api/client";
import type { CatalogueData } from "./adapter";
import { CatalogueProvider, useCatalogue, useCatalogueQuery } from "./catalogueData";
import { EVIDENCE_WORDS, type Evidence } from "./model";
import { useScope, withScope } from "./scope";

export const BASE = "/architecture";

/** A fact's evidence, in words and an icon: never colour alone. */
export function EvidenceMark({ evidence, compact = false }: { evidence: Evidence; compact?: boolean }) {
  const data = useCatalogue();
  const source = data.sources.find((item) => item.id === evidence.source);
  const Icon = evidence.status === "confirmed" ? CircleCheck : evidence.status === "inferred" ? Lightbulb : CircleDashed;
  const where = [source?.short, evidence.where].filter(Boolean).join(" ");
  return (
    <span className={`arch-evidence arch-evidence--${evidence.status}`}>
      <Icon size={14} aria-hidden="true" />
      <span>{EVIDENCE_WORDS[evidence.status]}</span>
      {!compact && where && <span className="arch-evidence__where">{where}</span>}
      {!compact && evidence.note && <span className="arch-evidence__note">{evidence.note}</span>}
    </span>
  );
}

/** A system's name, linking to its record on the landscape (the lens kept). */
export function SystemLink({ id, label }: { id: string; label?: string }) {
  const data = useCatalogue();
  const [scope] = useScope();
  const system = data.systems.find((item) => item.id === id);
  if (!system) return <span>{label ?? (id.startsWith("team:") ? id.slice(5) : id === "channel" ? "Ordering channel" : id)}</span>;
  return (
    <Link className="arch-system-link" to={withScope(BASE, scope, { system: system.id })}>
      {label ?? system.name}
    </Link>
  );
}

/**
 * The selected item's record, in a non-modal drawer at the side of the view,
 * so maps and diagrams keep their full width. Focus moves to its title when it
 * opens or shows another item, Esc or Close shuts it, and focus goes back to
 * what was focused before it opened.
 *
 * Opened by the address alone (a page arriving with an item chosen, nothing
 * focused yet), it leaves focus where the page puts it, so the skip link stays
 * first and the shell's focus on arrival holds.
 */
export function RecordDrawer({ title, openKey, onClose, children }: { title: string; openKey: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const before = document.activeElement;
    if (before === null || before === document.body) return;
    if (!panel.current?.contains(before)) opener.current = before as HTMLElement;
    panel.current?.querySelector<HTMLElement>("h2")?.focus();
  }, [openKey]);
  const close = () => {
    const back = opener.current;
    onClose();
    // The drawer is gone after this, so focus goes back once the view has re-rendered.
    window.setTimeout(() => {
      if (back?.isConnected) back.focus();
    }, 0);
  };
  return (
    <div className="arch-drawer">
      <Drawer title={title} onClose={close} panelRef={panel}>
        {children}
      </Drawer>
    </div>
  );
}

/** A label around a control, or a plain group when there is no control yet. */
function ContextField({ label, control, children }: { label: string; control: boolean; children: ReactNode }) {
  const Tag = control ? "label" : "div";
  return (
    <Tag className="arch-context__field">
      <span className="arch-context__label">{label}</span>
      {children}
    </Tag>
  );
}

function ContextBar({ data, releases }: { data: CatalogueData; releases: Release[] }) {
  const [scope, setScope] = useScope(data);
  const offering = data.offerings.find((item) => item.id === scope.product);
  const supported = offering?.orderTypes.find((item) => item.code === scope.order);
  const channels = offering
    ? data.channels.filter((channel) => (supported ? supported.channels : offering.orderTypes.flatMap((item) => item.channels)).includes(channel.id))
    : [];
  return (
    <div className="arch-context" role="group" aria-label="View the catalogue for">
      <label className="arch-context__field">
        <span className="arch-context__label">Version</span>
        <select className="ds-input ds-input--select" value={data.releaseId} onChange={(event) => setScope({ version: event.target.value })}>
          {releases.map((release) => (
            <option key={release.id} value={release.id}>
              {release.name ?? release.id} · {release.status === "draft" ? "draft" : "published"}
            </option>
          ))}
        </select>
      </label>
      <label className="arch-context__field">
        <span className="arch-context__label">Product</span>
        <select className="ds-input ds-input--select" value={scope.product ?? ""} onChange={(event) => setScope({ product: event.target.value || null })}>
          <option value="">All products</option>
          {data.offerings.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </label>
      <ContextField label="Order type" control={Boolean(offering)}>
        {offering ? (
          <select className="ds-input ds-input--select" value={scope.order ?? ""} onChange={(event) => setScope({ order: event.target.value || null })}>
            <option value="">Any order type</option>
            {offering.orderTypes.map((type) => (
              <option key={type.code} value={type.code}>{type.name} ({type.code})</option>
            ))}
          </select>
        ) : (
          <span className="arch-context__hint">Choose a product first</span>
        )}
      </ContextField>
      <ContextField label="Channel" control={Boolean(offering)}>
        {offering ? (
          <select className="ds-input ds-input--select" value={scope.channel ?? ""} onChange={(event) => setScope({ channel: event.target.value || null })}>
            <option value="">Any channel</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>{channel.name}</option>
            ))}
          </select>
        ) : (
          <span className="arch-context__hint">Choose a product first</span>
        )}
      </ContextField>
    </div>
  );
}

const SECTIONS = [
  { path: "", label: "Landscape" },
  { path: "/portfolio", label: "Portfolio" },
  { path: "/journeys", label: "Journeys" },
  { path: "/systems", label: "Systems" },
  { path: "/governance", label: "Governance" },
  { path: "/versions", label: "Versions" },
];

function Head({ data, releases, title, documentTitle, lead, actions }: { data: CatalogueData | null; releases: Release[]; title: string; documentTitle?: string; lead?: ReactNode; actions?: ReactNode }) {
  const { pathname } = useLocation();
  const [scope] = useScope(data ?? undefined);
  const open = data ? data.findings.length + data.systems.filter((system) => system.proposedMove).length : undefined;
  const items = SECTIONS.map((section) => {
    const href = `${BASE}${section.path}`;
    const current = section.path === "" ? pathname === BASE || pathname === `${BASE}/` : pathname.startsWith(href) || (section.path === "/portfolio" && pathname.startsWith(`${BASE}/offerings`));
    return { href: withScope(href, scope), label: section.label, current, ...(section.path === "/governance" && open !== undefined ? { count: open, countLabel: "open findings" } : {}) };
  });
  return (
    <PageHeader title={title} documentTitle={documentTitle ?? `${title} · Catalogue`} lead={lead} actions={actions}>
      {data && <ContextBar data={data} releases={releases} />}
      <SubNav label="Catalogue" items={items} link={RouterLink} />
    </PageHeader>
  );
}

/** What the version in view is, in one line: never mistaken for the version in service. */
function VersionLine({ data }: { data: CatalogueData }) {
  const sources = data.sources.map((source) => source.short).join(" and ");
  return (
    <StateLine tone={data.status === "draft" ? "plain" : "proof"}>
      {data.status === "draft"
        ? `${data.name}: a draft, not published, so requirement mapping doesn't read it.`
        : `${data.name}: published.`}{" "}
      {sources ? `Built only from ${sources}; anything they don't state is shown as a gap.` : "This version names no sources."}
    </StateLine>
  );
}

/**
 * Every catalogue page: its h1, the context bar (version · product · order
 * type · channel) and the catalogue's sections, then the page once its version
 * has loaded. The lens follows every link.
 */
export function ArchitectureFrame({
  title,
  documentTitle,
  lead,
  actions,
  children,
}: {
  title: string | ((data: CatalogueData) => string);
  documentTitle?: string | ((data: CatalogueData) => string);
  lead?: ReactNode | ((data: CatalogueData) => ReactNode);
  actions?: (data: CatalogueData) => ReactNode;
  children: (data: CatalogueData) => ReactNode;
}) {
  const query = useCatalogueQuery();
  const data = query.data;
  const resolve = <T,>(value: T | ((data: CatalogueData) => T)) => (typeof value === "function" ? (data ? (value as (data: CatalogueData) => T)(data) : undefined) : value);
  const heading = resolve(title) ?? "Catalogue";
  return (
    <div className="arch">
      <Head data={data} releases={query.releases} title={heading} documentTitle={resolve(documentTitle)} lead={resolve(lead)} actions={data && actions ? actions(data) : undefined} />
      {query.pending ? (
        <Skeleton label="Reading the catalogue" rows={6} />
      ) : query.error ? (
        <EmptyState title="The catalogue couldn't be read" action={<Button onClick={query.retry}>Try again</Button>}>
          {errorMessage(query.error)}
        </EmptyState>
      ) : query.empty || !data ? (
        <EmptyState title="There is no catalogue version yet">Create a draft from a catalogue file to start.</EmptyState>
      ) : (
        <CatalogueProvider value={{ data, releases: query.releases }}>
          <VersionLine data={data} />
          {children(data)}
        </CatalogueProvider>
      )}
    </div>
  );
}

import { CircleCheck, CircleDashed, Lightbulb } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";

import { Drawer, PageHeader, StateLine, SubNav } from "../design/components";
import { useFocusAfterRender } from "../design/hooks";
import { RouterLink } from "../shell/links";
import { CHANNELS, OFFERINGS, ORDER_TYPES, offeringById } from "./data/portfolio";
import { SOURCES, systemById } from "./data/landscape";
import { FINDINGS } from "./data/journeys";
import { SYSTEMS } from "./data/landscape";
import { EVIDENCE_WORDS, type Evidence } from "./model";
import { scopeQuery, useScope } from "./scope";

export const BASE = "/architecture";

/** A fact's evidence, in words and an icon: never colour alone. */
export function EvidenceMark({ evidence, compact = false }: { evidence: Evidence; compact?: boolean }) {
  const source = SOURCES.find((item) => item.id === evidence.source);
  const Icon = evidence.status === "confirmed" ? CircleCheck : evidence.status === "inferred" ? Lightbulb : CircleDashed;
  const where = [source ? (source.id === "sdd" ? "SDD" : "SMB reference") : null, evidence.where].filter(Boolean).join(" ");
  return (
    <span className={`arch-evidence arch-evidence--${evidence.status}`}>
      <Icon size={14} aria-hidden="true" />
      <span>{EVIDENCE_WORDS[evidence.status]}</span>
      {!compact && where && <span className="arch-evidence__where">{where}</span>}
      {!compact && evidence.note && <span className="arch-evidence__note">{evidence.note}</span>}
    </span>
  );
}

/**
 * The selected item's record, in a non-modal drawer at the side of the view,
 * so maps and diagrams keep their full width. Focus moves to its title when it
 * opens or shows another item, Esc or Close shuts it, and focus goes back to
 * what was focused before it opened.
 */
export function RecordDrawer({ title, openKey, onClose, children }: { title: string; openKey: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const focusLater = useFocusAfterRender();
  useEffect(() => {
    if (!panel.current?.contains(document.activeElement)) opener.current = document.activeElement as HTMLElement | null;
    focusLater(() => panel.current?.querySelector<HTMLElement>("h2"));
  }, [openKey, focusLater]);
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

/** A system's name, linking to its record on the landscape (the lens kept). */
export function SystemLink({ id, label }: { id: string; label?: string }) {
  const [scope] = useScope();
  const system = systemById(id);
  if (!system) return <span>{label ?? id}</span>;
  const query = scopeQuery(scope);
  return (
    <Link className="arch-system-link" to={`${BASE}${query}${query ? "&" : "?"}system=${system.id}`}>
      {label ?? system.name}
    </Link>
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

function ContextBar() {
  const [scope, setScope] = useScope();
  const offering = offeringById(scope.product);
  const orderTypes = offering ? ORDER_TYPES.filter((type) => offering.orderTypes.some((item) => item.code === type.code)) : [];
  const supported = offering?.orderTypes.find((item) => item.code === scope.order);
  const channels = offering
    ? CHANNELS.filter((channel) => (supported ? supported.channels : offering.orderTypes.flatMap((item) => item.channels)).includes(channel.id))
    : [];
  return (
    <div className="arch-context" role="group" aria-label="View the catalogue for">
      <div className="arch-context__version">
        <span className="arch-context__label">Version</span>
        <span className="arch-context__value">Working draft</span>
      </div>
      <label className="arch-context__field">
        <span className="arch-context__label">Product</span>
        <select className="ds-input ds-input--select" value={scope.product ?? ""} onChange={(event) => setScope({ product: event.target.value || null })}>
          <option value="">All products</option>
          {OFFERINGS.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </label>
      <ContextField label="Order type" control={Boolean(offering)}>
        {offering ? (
          <select className="ds-input ds-input--select" value={scope.order ?? ""} onChange={(event) => setScope({ order: event.target.value || null })}>
            <option value="">Any order type</option>
            {orderTypes.map((type) => (
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

/**
 * Every catalogue page: its h1, the context bar (version · product · order
 * type · channel) and the catalogue's sections. The lens follows every link.
 */
export function ArchitectureFrame({ title, documentTitle, lead, actions, children }: { title: string; documentTitle?: string; lead?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const { pathname } = useLocation();
  const [scope] = useScope();
  const query = scopeQuery(scope);
  const open = FINDINGS.length + SYSTEMS.filter((system) => system.proposedMove).length;
  const items = SECTIONS.map((section) => {
    const href = `${BASE}${section.path}`;
    const current = section.path === "" ? pathname === BASE || pathname === `${BASE}/` : pathname.startsWith(href) || (section.path === "/portfolio" && pathname.startsWith(`${BASE}/offerings`));
    return { href: `${href}${query}`, label: section.label, current, ...(section.path === "/governance" ? { count: open, countLabel: "open findings" } : {}) };
  });
  return (
    <div className="arch">
      <PageHeader title={title} documentTitle={documentTitle ?? `${title} · Catalogue`} lead={lead} actions={actions}>
        <ContextBar />
        <SubNav label="Catalogue" items={items} link={RouterLink} />
      </PageHeader>
      <StateLine>
        Working draft, not published. Built only from the Business Pro Plus SDD v{SOURCES[0]?.version} and the SMB architecture reference v{SOURCES[1]?.version}; anything they don't state is shown as a gap.
      </StateLine>
      {children}
    </div>
  );
}

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { ExplorerRelease } from "../../../api/client";
import { useExplorerRelease } from "../data";
import { useLab } from "../lab-context";
import { Empty, Note, Page, Skeleton, StateLine } from "../ui";

/** Explorer: reader-first. Answer first, details folded, stale links said out loud. */
export function ExplorerWireframe() {
  const release = useExplorerRelease();
  if (release.isPending) return <Skeleton label="Reading the catalogue in service" rows={6} />;
  if (!release.data) return <Empty title="No catalogue is in service yet." why="The architecture team publishes it." />;
  return <ExplorerLoaded release={release.data} />;
}

function ExplorerLoaded({ release: data }: { release: ExplorerRelease }) {
  const release = { data };
  const lab = useLab();
  const [params, setParams] = useSearchParams();
  const products = release.data.products ?? [];
  const asked = lab.scenario === "stale-link" ? "nope" : params.get("product");
  const product = products.find((item) => item.id === asked) ?? products[0];
  const stale = asked !== null && product?.id !== asked;
  const orders = (product?.order_types ?? []).filter((order) => order.enabled);
  const order = orders.find((item) => item.code === params.get("order")) ?? orders[0];
  const journeys = (release.data.journeys ?? []).filter((journey) => journey.product_id === product?.id);
  const journey = journeys.find((item) => !order || item.order_type_code === order.code) ?? journeys[0];
  const systemIds = [...new Set((journey?.activities ?? []).flatMap((step) => [step.performing_system_id, ...step.supporting_system_ids]).filter(Boolean))] as string[];
  const systems = release.data.systems.filter((system) => systemIds.includes(system.id));
  const set = (key: string, value: string) => { params.set(key, value); setParams(params, { replace: true }); };
  // §7 stale link: say so (above), and rewrite the address to what is shown, without a history entry.
  const shownId = product?.id;
  useEffect(() => {
    if (!stale || !shownId) return;
    const next = new URLSearchParams(params);
    next.set("product", shownId);
    setParams(next, { replace: true });
  }, [stale, shownId, params, setParams]);

  return (
    <Page title="Product architecture explorer" archetype="Explorer (reader-first)" lead="Which systems take part when a customer orders an offering. It shows the catalogue in service.">
      {stale && (
        <StateLine>
          This link asks for '<bdi>{asked}</bdi>', which isn't in the catalogue in service. Showing '<bdi>{product?.name}</bdi>'.
        </StateLine>
      )}
      <div className="wf-choices" role="group" aria-label="What to show">
        <label>Offering <select value={product?.id ?? ""} onChange={(event) => set("product", event.target.value)}>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Order type <select value={order?.code ?? ""} onChange={(event) => set("order", event.target.value)}>{orders.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
      </div>
      <section className="wf-section" aria-labelledby="ex-answer">
        <h2 id="ex-answer">
          {systems.length} {systems.length === 1 ? "system takes" : "systems take"} part when a business customer orders '{product?.name}' ({order?.name ?? "any order type"})
        </h2>
        <ul className="wf-answer">
          {systems.map((system) => <SystemLine key={system.id} name={system.name} description={system.description} capability={system.capabilities[0]?.name} />)}
        </ul>
      </section>
      {journey && (
        <section className="wf-section" aria-labelledby="ex-steps">
          <h2 id="ex-steps">The journey: <bdi>{journey.name}</bdi></h2>
          <ol className="wf-lines">
            {(journey.activities ?? []).map((step) => (
              <li key={step.number}><bdi>{release.data.systems.find((system) => system.id === step.performing_system_id)?.name ?? step.performing_system_id ?? "—"}</bdi>: <span dir="auto">{step.name}</span></li>
            ))}
          </ol>
        </section>
      )}
      <details className="wf-section">
        <summary>More about this offering</summary>
        <p dir="auto">{product?.proposition ?? "Not recorded yet."}</p>
        <p className="wf-quiet">Not recorded yet: plans and prices, non-functional requirements.</p>
      </details>
      <p><button type="button" className="wf-link-button">Download as a document</button></p>
      <Note>Readers see this view with the reduced shell (add ?as=reader to the address). Version in service only; no drafts, no writes (ADR-0101).</Note>
    </Page>
  );
}

function SystemLine({ name, description, capability }: { name: string; description?: string | null; capability?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button type="button" className="wf-disclosure" aria-expanded={open} onClick={() => setOpen((on) => !on)}>
        <ChevronDown size={14} aria-hidden="true" className={open ? "wf-turned" : undefined} /> <bdi>{name}</bdi>
      </button>
      {open && <p className="wf-quiet" dir="auto">{description || "No description recorded yet."}{capability ? ` Does: ${capability}.` : ""}</p>}
    </li>
  );
}

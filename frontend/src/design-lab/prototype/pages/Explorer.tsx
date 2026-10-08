import { ChevronDown, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { ExplorerRelease } from "../../../api/client";
import { Button, EmptyState, PageHeader, ProvenanceLine, Section, Select, Skeleton, StateLine } from "../../../design/components";
import { useExplorerRelease } from "../../wireframes/data";
import { useLab } from "../../wireframes/lab-context";

/** Explorer: reader-first. The answer first, details folded, a stale link said out loud. */
export function Explorer() {
  const release = useExplorerRelease();
  if (release.isPending) return <Skeleton label="Reading the catalogue in service" rows={6} />;
  if (!release.data) {
    return (
      <>
        <PageHeader title="Product architecture explorer" />
        <EmptyState title="No catalogue is in service yet."><p>The architecture team publishes it.</p></EmptyState>
      </>
    );
  }
  return <ExplorerLoaded data={release.data} />;
}

function ExplorerLoaded({ data }: { data: ExplorerRelease }) {
  const lab = useLab();
  const [params, setParams] = useSearchParams();
  const products = data.products ?? [];
  const asked = lab.scenario === "stale-link" ? "nope" : params.get("product");
  const product = products.find((item) => item.id === asked) ?? products[0];
  const stale = asked !== null && product?.id !== asked;
  const orders = (product?.order_types ?? []).filter((order) => order.enabled);
  const order = orders.find((item) => item.code === params.get("order")) ?? orders[0];
  const journeys = (data.journeys ?? []).filter((journey) => journey.product_id === product?.id);
  const journey = journeys.find((item) => !order || item.order_type_code === order.code) ?? journeys[0];
  const systemIds = [...new Set((journey?.activities ?? []).flatMap((step) => [step.performing_system_id, ...step.supporting_system_ids]).filter(Boolean))] as string[];
  const systems = data.systems.filter((system) => systemIds.includes(system.id));
  const set = (key: string, value: string) => {
    params.set(key, value);
    setParams(params, { replace: true });
  };
  // §7 stale link: say so, and rewrite the address to what is shown, without a history entry.
  const shownId = product?.id;
  useEffect(() => {
    if (!stale || !shownId) return;
    const next = new URLSearchParams(params);
    next.set("product", shownId);
    setParams(next, { replace: true });
  }, [stale, shownId, params, setParams]);

  return (
    <>
      <PageHeader
        title="Product architecture explorer"
        lead="Which systems take part when a customer orders an offering."
        provenance={<>From the catalogue in service, '<bdi>{data.name}</bdi>'. Drafts are never shown here.</>}
      >
        {stale && (
          <StateLine>
            This link asks for '<bdi>{asked}</bdi>', which isn't in the catalogue in service. Showing '<bdi>{product?.name}</bdi>' instead.
          </StateLine>
        )}
      </PageHeader>
      <div className="proto-choices" role="group" aria-label="What to show">
        <Select label="Offering" value={product?.id ?? ""} onChange={(event) => set("product", event.target.value)}>
          {products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
        <Select label="Order type" value={order?.code ?? ""} onChange={(event) => set("order", event.target.value)}>
          {orders.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </Select>
      </div>
      <Section title={<>{systems.length} {systems.length === 1 ? "system takes" : "systems take"} part when a business customer orders '<bdi>{product?.name}</bdi>' ({order?.name ?? "any order type"})</>}>
        {systems.length === 0 ? (
          <p className="proto-quiet">No journey is recorded for this offering and order type yet.</p>
        ) : (
          <ul className="proto-answer" aria-label="Systems that take part">
            {systems.map((system) => <SystemLine key={system.id} name={system.name} description={system.description} capability={system.capabilities[0]?.name} />)}
          </ul>
        )}
      </Section>
      {journey && (
        <Section title={<>The journey: <bdi>{journey.name}</bdi></>}>
          <ol className="proto-lines">
            {(journey.activities ?? []).map((step) => (
              <li key={step.number}>
                <strong><bdi>{data.systems.find((system) => system.id === step.performing_system_id)?.name ?? step.performing_system_id ?? "—"}</bdi></strong>: <span dir="auto">{step.name}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}
      <Section title="More about this offering">
        <details className="proto-more-about">
          <summary>Proposition, plans and requirements</summary>
          <p dir="auto">{product?.proposition ?? "Not recorded yet."}</p>
          <ProvenanceLine>Not recorded yet: plans and prices, non-functional requirements.</ProvenanceLine>
        </details>
      </Section>
      <Button variant="link" icon={<Download size={14} />}>Download as a document</Button>
    </>
  );
}

function SystemLine({ name, description, capability }: { name: string; description?: string | null; capability?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button type="button" className="proto-disclosure" aria-expanded={open} onClick={() => setOpen((on) => !on)}>
        <ChevronDown size={14} aria-hidden="true" /> <bdi>{name}</bdi>
      </button>
      {open && <p dir="auto" className="proto-quiet">{description || "No description recorded yet."}{capability ? ` Does: ${capability}.` : ""}</p>}
    </li>
  );
}

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { api, type Offering } from "../api/client";
import { errorMessage } from "../api/errors";
import { Button, type Column, DataTable, Section, Skeleton, Status } from "../design/components";
import { formatMoment } from "../home/format";
import { falling, formatAmount } from "./plans";

/**
 * An offering's plans and prices, read live from the product catalog by the
 * offering's code (requirement-portal ADR-0101). The knowledge catalogue keeps
 * no copy, so the section says which catalog it read and when.
 */
export function PlansAndPrices({ offering, level = 3 }: { offering: Offering; headingId?: string; level?: 2 | 3 }) {
  const query = useQuery({
    queryKey: ["explorer", "plans", offering.id],
    queryFn: () => api.explorerPlans(offering.id),
  });
  const section = (children: ReactNode) => <Section title="Plans and prices" headingLevel={level}>{children}</Section>;

  if (query.isPending) return section(<Skeleton label="Reading the product catalog" rows={3} />);
  if (query.isError) {
    return section(
      <p role="alert" className="cat-inline">
        <Status tone="attention">{errorMessage(query.error)}</Status>
        <Button onClick={() => void query.refetch()}>Try again</Button>
      </p>,
    );
  }

  const found = query.data;
  if (found.status === "not_configured") {
    return section(<p className="cat-quiet">This portal reads no product catalog, so plans and prices are not shown.</p>);
  }
  if (found.status === "no_code") {
    return section(
      <p className="explorer-gap">
        <bdi>{offering.name}</bdi> has no code in the catalogue, so its plans cannot be looked up in {found.catalog}.
      </p>,
    );
  }
  if (found.status === "not_in_catalog") {
    return section(
      <p className="explorer-gap">
        {sentence(found.catalog)} has no offering with the code <code dir="ltr" className="cat-code">{found.code}</code>.
      </p>,
    );
  }

  type Row = { key: string; plan: (typeof found.plans)[number]; price: (typeof found.plans)[number]["prices"][number] | null };
  const rows: Row[] = found.plans.flatMap((plan): Row[] =>
    plan.prices.length
      ? plan.prices.map((price, index) => ({ key: `${plan.id}:${price.name}:${index}`, plan, price }))
      : [{ key: `${plan.id}:none`, plan, price: null }],
  );
  const columns: Column<Row>[] = [
    {
      id: "plan",
      header: "Plan",
      rowHeader: true,
      bidi: true,
      cell: ({ plan }) => (
        <>
          {plan.name}
          {[plan.description, plan.lifecycle, plan.terms.length ? `Sold with: ${plan.terms.join(" · ")}` : null]
            .filter(Boolean)
            .map((line) => <span key={line} className="cat-detail" dir="auto">{line}</span>)}
        </>
      ),
    },
    { id: "price", header: "Price", bidi: true, cell: ({ price }) => price?.name ?? <span className="cat-quiet">The catalog states no price for this plan.</span> },
    { id: "due", header: "Falls due", cell: ({ price }) => (price ? falling(price) : "—") },
    { id: "amount", header: "Amount", numeric: true, cell: ({ price }) => (price ? <span className="explorer-amount">{formatAmount(price.amount, price.currency)}</span> : "—") },
  ];
  const prices = found.plans.reduce((total, plan) => total + plan.prices.length, 0);
  return section(
    <>
      <p className="cat-lead">
        From {found.catalog}, by the code <code dir="ltr" className="cat-code">{found.code}</code>, read at{" "}
        {found.read_at ? formatMoment(new Date(found.read_at)) : "an unknown time"}. The catalog holds the prices; the
        knowledge catalogue keeps no copy.
        {found.terms.length > 0 && <> Sold with: {found.terms.join(" · ")}.</>}
      </p>
      {prices ? (
        <DataTable caption={`Plans of ${offering.name} and their prices, from ${found.catalog}`} captionHidden columns={columns} rows={rows} rowId={(row) => row.key} />
      ) : (
        <p className="cat-quiet">{sentence(found.catalog)} states no plan or price for it.</p>
      )}
    </>,
  );
}

/** "The product catalog", at the start of a sentence. */
function sentence(catalog: string | null | undefined): string {
  const name = catalog ?? "the product catalog";
  return `${name.charAt(0).toLocaleUpperCase()}${name.slice(1)}`;
}

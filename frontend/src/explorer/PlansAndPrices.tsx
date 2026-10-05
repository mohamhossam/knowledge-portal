import { useQuery } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";

import { api, type Offering } from "../api/client";
import { errorMessage } from "../api/errors";
import { formatMoment } from "../home/format";
import { falling, formatAmount } from "./plans";

/**
 * An offering's plans and prices, read live from the product catalog by the
 * offering's code (requirement-portal ADR-0101). The knowledge catalogue keeps
 * no copy, so the section says which catalog it read and when.
 */
export function PlansAndPrices({ offering, headingId }: { offering: Offering; headingId: string }) {
  const query = useQuery({
    queryKey: ["explorer", "plans", offering.id],
    queryFn: () => api.explorerPlans(offering.id),
  });

  const title = <h3 id={headingId} className="govsection__title">Plans and prices</h3>;
  if (query.isPending) {
    return (
      <section className="govsection" aria-labelledby={headingId} aria-busy="true">
        {title}
        <p className="timetable__quiet">Reading the product catalog…</p>
      </section>
    );
  }
  if (query.isError) {
    return (
      <section className="govsection" aria-labelledby={headingId}>
        {title}
        <p className="timetable__quiet timetable__quiet--failed" role="alert">
          {errorMessage(query.error)}
          <button type="button" className="text-button" onClick={() => void query.refetch()}>
            <RotateCw size={14} aria-hidden="true" />
            Try again
          </button>
        </p>
      </section>
    );
  }

  const found = query.data;
  if (found.status === "not_configured") {
    return (
      <section className="govsection" aria-labelledby={headingId}>
        {title}
        <p className="timetable__quiet">This portal reads no product catalog, so plans and prices are not shown.</p>
      </section>
    );
  }
  if (found.status === "no_code") {
    return (
      <section className="govsection" aria-labelledby={headingId}>
        {title}
        <p className="timetable__quiet explorer__gap" dir="auto">
          {offering.name} has no code in the catalogue, so its plans cannot be looked up in {found.catalog}.
        </p>
      </section>
    );
  }
  if (found.status === "not_in_catalog") {
    return (
      <section className="govsection" aria-labelledby={headingId}>
        {title}
        <p className="timetable__quiet explorer__gap">
          {sentence(found.catalog)} has no offering with the code <code dir="ltr">{found.code}</code>.
        </p>
      </section>
    );
  }

  const prices = found.plans.reduce((total, plan) => total + plan.prices.length, 0);
  return (
    <section className="govsection" aria-labelledby={headingId}>
      {title}
      <p className="govsection__lead">
        From {found.catalog}, by the code <code dir="ltr">{found.code}</code>, read at{" "}
        {found.read_at ? formatMoment(new Date(found.read_at)) : "an unknown time"}. The catalog holds the prices; the
        knowledge catalogue keeps no copy.
        {found.terms.length > 0 && <> Sold with: {found.terms.join(" · ")}.</>}
      </p>
      {prices ? (
        <table className="govtable plans">
          <caption className="visually-hidden">Plans of {offering.name} and their prices, from {found.catalog}</caption>
          <thead>
            <tr>
              <th scope="col">Price</th>
              <th scope="col">Falls due</th>
              <th scope="col" className="cell--end">Amount</th>
            </tr>
          </thead>
          {found.plans.map((plan) => (
            <tbody key={plan.id}>
              <tr className="steps__phase">
                <th scope="colgroup" colSpan={3} dir="auto">
                  {plan.name}
                  {[plan.description, plan.lifecycle, plan.terms.length ? `Sold with: ${plan.terms.join(" · ")}` : null]
                    .filter(Boolean)
                    .map((line) => (
                      <span key={line} className="secondary govtable__by" dir="auto">{line}</span>
                    ))}
                </th>
              </tr>
              {plan.prices.length ? (
                plan.prices.map((price, index) => (
                  <tr key={`${price.name}:${index}`} className="row">
                    <th scope="row" dir="auto">{price.name}</th>
                    <td>{falling(price)}</td>
                    <td className="cell--end plans__amount">{formatAmount(price.amount, price.currency)}</td>
                  </tr>
                ))
              ) : (
                <tr className="row">
                  <td colSpan={3} className="secondary">The catalog states no price for this plan.</td>
                </tr>
              )}
            </tbody>
          ))}
        </table>
      ) : (
        <p className="timetable__quiet">{sentence(found.catalog)} states no plan or price for it.</p>
      )}
    </section>
  );
}

/** "The product catalog", at the start of a sentence. */
function sentence(catalog: string | null | undefined): string {
  const name = catalog ?? "the product catalog";
  return `${name.charAt(0).toLocaleUpperCase()}${name.slice(1)}`;
}

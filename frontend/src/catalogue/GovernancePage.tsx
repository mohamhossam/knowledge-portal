import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { SourceConflict } from "../api/client";
import { EditButton } from "./DraftEdits";
import { ConflictList, SourceRegister } from "./GovernanceSections";
import { ConflictsEdit, SourcesEdit } from "./GovernanceEditor";
import { useCatalogueContext } from "./useCatalogue";

/**
 * Where the catalogue's knowledge comes from, and where its sources disagree
 * (requirement-portal ADR-0101, step 5): the source register by level, and the
 * conflicts between sources with the decision each needs. On a draft, each
 * register is edited whole, one at a time, in place of its table.
 */
export function GovernancePage() {
  const { book, base, editable } = useCatalogueContext();
  const release = book.release;
  const [editing, setEditing] = useState<"sources" | "conflicts" | null>(null);
  const returnTo = useRef<string | null>(null);
  useEffect(() => {
    if (editing === null && returnTo.current) {
      document.getElementById(returnTo.current)?.focus();
      returnTo.current = null;
    }
  }, [editing]);
  const close = (key: "sources" | "conflicts") => () => {
    returnTo.current = `governance-edit-${key}`;
    setEditing(null);
  };
  const offer = (key: "sources" | "conflicts", label: string) =>
    editable && editing === null ? (
      <EditButton id={`governance-edit-${key}`} onClick={() => setEditing(key)}>
        {label}
      </EditButton>
    ) : null;
  const offerings = new Map((release.products ?? []).map((item) => [item.id, item]));
  const affects = (conflict: SourceConflict) =>
    conflict.scope.length ? (
      <>
        Affects{" "}
        {conflict.scope.map((scope, index) => {
          const offering = offerings.get(scope.product_id);
          const orders = (scope.order_types ?? []).map((code) => offering?.order_types.find((type) => type.code === code)?.name ?? code);
          return (
            <Fragment key={scope.product_id}>
              {index > 0 && "; "}
              <Link to={`${base}/offerings/${encodeURIComponent(scope.product_id)}`} dir="auto">{offering?.name ?? scope.product_id}</Link>
              {orders.length ? `: ${orders.join(", ")}` : ", every order type"}
              {scope.question_id && ` (raises ${scope.question_id})`}
            </Fragment>
          );
        })}
      </>
    ) : (
      "Affects no offering yet"
    );
  return (
    <div className="catalogue__first">
      {editing === "sources" ? (
        <SourcesEdit onDone={close("sources")} />
      ) : (
        <SourceRegister sources={release.sources ?? []} headingId="governance-sources" action={offer("sources", "Edit the sources")} />
      )}
      {editing === "conflicts" ? (
        <ConflictsEdit onDone={close("conflicts")} />
      ) : (
        <ConflictList
          conflicts={release.conflicts ?? []}
          sources={release.sources ?? []}
          headingId="governance-conflicts"
          title="Conflicts between sources"
          lead="Where two sources contradict each other. The catalogue never picks one; each needs a decision."
          action={offer("conflicts", "Edit the conflicts")}
          affects={affects}
        />
      )}
    </div>
  );
}

import "./offering/offering.css";

import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { SourceConflict } from "../api/client";
import { Button } from "../design/components";
import { ChangeHistory, ConflictList, SourceRegister } from "./GovernanceSections";
import { ConflictsEdit, SourcesEdit } from "./GovernanceEditor";
import { useCatalogueContext } from "./useCatalogue";

type Register = "sources" | "conflicts";

/**
 * Where the catalogue's knowledge comes from, and where its sources disagree
 * (requirement-portal ADR-0101, step 5): the source register by level, the
 * conflicts between sources with the decision each needs, and the change
 * requests applied to this version. The catalogue's frame gives the page its
 * header; this is its content, from h2. On a draft, each register is edited
 * whole, one at a time, in place of its table.
 */
export function GovernancePage() {
  const { book, base, editable } = useCatalogueContext();
  const release = book.release;
  const [editing, setEditing] = useState<Register | null>(null);
  const returnTo = useRef<string | null>(null);
  useEffect(() => {
    if (editing === null && returnTo.current) {
      document.getElementById(returnTo.current)?.focus();
      returnTo.current = null;
    }
  }, [editing]);
  const close = (key: Register) => () => {
    returnTo.current = `governance-edit-${key}`;
    setEditing(null);
  };
  const offer = (key: Register, label: string) =>
    editable && editing === null ? (
      <Button id={`governance-edit-${key}`} icon={<Pencil size={16} />} onClick={() => setEditing(key)}>
        {label}
      </Button>
    ) : null;
  const offerings = new Map((release.products ?? []).map((item) => [item.id, item]));
  const offeringLink = (id: string) => (
    <Link to={`${base}/offerings/${encodeURIComponent(id)}`}><bdi>{offerings.get(id)?.name ?? id}</bdi></Link>
  );
  // One line per offering it affects: its order types, and the question it raises there.
  const affects = (conflict: SourceConflict) =>
    conflict.scope.length ? (
      conflict.scope.map((scope) => {
        const offering = offerings.get(scope.product_id);
        const orders = (scope.order_types ?? []).map((code) => offering?.order_types.find((type) => type.code === code)?.name ?? code);
        return (
          <span key={scope.product_id} className="offering-by">
            <span>
              Affects {offeringLink(scope.product_id)}
              {orders.length ? `: ${orders.join(", ")}` : ", every order type"}
              {scope.question_id && (
                <>
                  {", raises "}
                  <span className="offering-id">{scope.question_id}</span>
                </>
              )}
            </span>
          </span>
        );
      })
    ) : (
      <span className="offering-by">Affects no offering yet</span>
    );
  return (
    <div className="offering-stack">
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
      <ChangeHistory history={release.change_history ?? []} offering={offeringLink} headingId="governance-history" />
    </div>
  );
}

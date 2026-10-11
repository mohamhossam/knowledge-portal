import "./squads.css";

import type { ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { errorMessage } from "../api/errors";
import { useActorNames } from "../catalogue/useCatalogue";
import { Button, EmptyState, Facts, PageHeader, Skeleton, SubNav } from "../design/components";
import { formatDay } from "../home/format";
import { plural } from "../library/where";
import { RouterLink } from "../shell/links";
import { gaps, historyLine } from "./organisation";
import { type OrgContext, useHistory, useOrganisation } from "./useOrganisation";

/**
 * The Ownership area (redesign area 4): who runs each system in service. The
 * head counts the gaps, each count a way into the grid; the pages under it
 * are the systems grid, then products, squads, people and history.
 */
export function SquadsPage() {
  const hook = useOrganisation();
  const { organisation, active } = hook;
  const head = (meta?: ReactNode, nav = true) => (
    <PageHeader
      title="Ownership"
      lead="Who runs each system in service: value streams, their products and squads, and the people on each system."
      meta={meta}
    >
      {nav && <SubIndex />}
    </PageHeader>
  );

  let body;
  if (organisation.isPending || active.isPending) {
    body = <>{head(undefined, false)}<Skeleton label="Reading who runs what" rows={8} /></>;
  } else if (organisation.isError) {
    body = (
      <>
        {head(undefined, false)}
        <EmptyState title="Couldn't read who runs what." action={<Button onClick={() => void organisation.refetch()}>Try again</Button>}>
          <p>The knowledge service didn't answer: {errorMessage(organisation.error)}</p>
        </EmptyState>
      </>
    );
  } else {
    const org = organisation.data;
    const release = active.data ?? null;
    const context: OrgContext = { org, release, flags: hook.references.data ?? [], hook };
    body = (
      <>
        {head(<><Counts context={context} /><LastChange /></>)}
        <Outlet context={context} />
      </>
    );
  }
  return <div className="own">{body}</div>;
}

function LastChange() {
  const history = useHistory();
  const actorName = useActorNames();
  const { organisation } = useOrganisation();
  const last = history.data?.[0];
  if (!last || !organisation.data) return null;
  return (
    <p className="own-quiet">
      Last change: {historyLine(last, organisation.data)}, by <bdi>{actorName(last.actor_id)}</bdi> on {formatDay(last.created_at)}.
    </p>
  );
}

/** Ownership across the version in service, counted first; each gap count opens the grid on it. */
function Counts({ context }: { context: OrgContext }) {
  const { org, release, flags } = context;
  if (!release) {
    return <p className="own-quiet">No architecture version is in service, so ownership can't be counted and systems can't be linked yet.</p>;
  }
  const counted = gaps(org, release);
  const productsToCheck = flags.filter((flag) => flag.subject === "product").length;
  const squadsToCheck = flags.filter((flag) => flag.subject === "squad").length;
  const items: [string, ReactNode][] = [
    ["Systems in service", counted.inService.toLocaleString("en")],
    ["Run by a squad", counted.run.toLocaleString("en")],
    ["No squad", counted.noSquad ? <RouterLink href="/squads?show=none">{plural(counted.noSquad, "system")}</RouterLink> : "None"],
    ...(counted.lapsed > 0 ? [["No longer in service", <RouterLink key="lapsed" href="/squads?show=lapsed">{plural(counted.lapsed, "link")}</RouterLink>] as [string, ReactNode]] : []),
    ...(productsToCheck > 0 ? [["Products to check", <RouterLink key="products" href="/squads/products">{productsToCheck.toLocaleString("en")}</RouterLink>] as [string, ReactNode]] : []),
    ...(squadsToCheck > 0 ? [["Squads to check", <RouterLink key="squads" href="/squads/squads">{squadsToCheck.toLocaleString("en")}</RouterLink>] as [string, ReactNode]] : []),
  ];
  return (
    <div className="own-counts" role="group" aria-label="Who runs the systems in service">
      <Facts items={items} />
    </div>
  );
}

function SubIndex() {
  const { pathname } = useLocation();
  const at = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  return (
    <SubNav
      label="Ownership"
      link={RouterLink}
      items={[
        { label: "Systems", href: "/squads", current: pathname === "/squads" || pathname === "/squads/" },
        { label: "Tree", href: "/squads/tree", current: at("/squads/tree") },
        { label: "Products", href: "/squads/products", current: at("/squads/products") },
        { label: "Squads", href: "/squads/squads", current: at("/squads/squads") },
        { label: "People", href: "/squads/people", current: at("/squads/people") },
        { label: "History", href: "/squads/history", current: at("/squads/history") },
      ]}
    />
  );
}

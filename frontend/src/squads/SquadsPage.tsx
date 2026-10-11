import "./squads.css";

import { UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { errorMessage } from "../api/errors";
import { useActorNames } from "../catalogue/useCatalogue";
import { Button, EmptyState, PageHeader, Skeleton, SubNav } from "../design/components";
import { formatDay } from "../home/format";
import { plural } from "../library/where";
import { ButtonLink, RouterLink } from "../shell/links";
import { gaps, historyLine } from "./organisation";
import { type OrgContext, useHistory, useOrganisation } from "./useOrganisation";

const LEAD = "Who runs each system in service: value streams, their products and squads, and the people on each system.";

/**
 * The Ownership area (redesign area 4; workbench, UX rebuild phase 3): who
 * runs each system in service. The head counts the gaps on the title's line,
 * each count a way into the list; the pages under it are systems, products,
 * squads and people (each a list beside the chosen record), then history.
 */
export function SquadsPage() {
  const hook = useOrganisation();
  const { organisation, active } = hook;
  const { pathname, search } = useLocation();
  // On the systems list, giving several systems to a squad at once is a step away.
  const systems = pathname === "/squads" || pathname === "/squads/" || pathname.startsWith("/squads/systems/");
  const head = (meta?: ReactNode, nav = true) => (
    <PageHeader
      title="Ownership"
      lead={LEAD}
      meta={meta}
      provenance={nav ? <LastChange /> : undefined}
      actions={nav && systems ? <ButtonLink to={`/squads/assign${search}`}><UsersRound size={16} aria-hidden="true" /> Assign several</ButtonLink> : undefined}
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
        {head(<Counts context={context} />)}
        <Outlet context={context} />
      </>
    );
  }
  return <div className="own">{body}</div>;
}

/** The last change, behind "About this page", so the head keeps to one line. */
function LastChange() {
  const history = useHistory();
  const actorName = useActorNames();
  const { organisation } = useOrganisation();
  const last = history.data?.[0];
  if (!last || !organisation.data) return null;
  return (
    <>
      Last change: {historyLine(last, organisation.data)}, by <bdi>{actorName(last.actor_id)}</bdi> on {formatDay(last.created_at)}.{" "}
      <RouterLink href="/squads/history">See the history</RouterLink>
    </>
  );
}

/** Ownership across the version in service, on the title's line; each gap count opens the list on it. */
function Counts({ context }: { context: OrgContext }) {
  const { org, release, flags } = context;
  if (!release) return <span>No version in service</span>;
  const counted = gaps(org, release);
  const productsToCheck = flags.filter((flag) => flag.subject === "product").length;
  const squadsToCheck = flags.filter((flag) => flag.subject === "squad").length;
  return (
    <>
      <span>{plural(counted.inService, "system")} in service</span>
      <span>{counted.run.toLocaleString("en")} run by a squad</span>
      {counted.noSquad > 0 && <RouterLink href="/squads?show=none">{counted.noSquad.toLocaleString("en")} with no squad</RouterLink>}
      {counted.lapsed > 0 && <RouterLink href="/squads?show=lapsed">{plural(counted.lapsed, "link")} to check</RouterLink>}
      {productsToCheck > 0 && <RouterLink href="/squads/products">{plural(productsToCheck, "product")} to check</RouterLink>}
      {squadsToCheck > 0 && <RouterLink href="/squads/squads">{plural(squadsToCheck, "squad")} to check</RouterLink>}
    </>
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
        { label: "Systems", href: "/squads", current: pathname === "/squads" || pathname === "/squads/" || at("/squads/systems") || at("/squads/assign") },
        { label: "Products", href: "/squads/products", current: at("/squads/products") },
        { label: "Squads", href: "/squads/squads", current: at("/squads/squads") },
        { label: "People", href: "/squads/people", current: at("/squads/people") },
        { label: "History", href: "/squads/history", current: at("/squads/history") },
      ]}
    />
  );
}

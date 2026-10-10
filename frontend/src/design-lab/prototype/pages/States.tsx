import { useLocation } from "react-router-dom";

import { REQUIREMENT_APP_URL } from "../../../auth/paths";
import { ActionGroup, Button, EmptyState, PageHeader, Section, SubNav } from "../../../design/components";
import { proto } from "../paths";
import { ButtonLink, Lines, RouterLink } from "../ui";

/** System state archetype: what happened, why, what you can do, who you are, and Help. */
export function SystemState({ kind }: { kind: "no-access" | "not-found" | "session" | "offline" }) {
  const location = useLocation();
  if (kind === "no-access") {
    return (
      <>
        <PageHeader title="This portal is for knowledge admins" lead={<>You're signed in as <strong>Omar Observer</strong>. Curating the library and the catalogue needs the Knowledge admin role.</>} />
        <ActionGroup>
          <ButtonLink to={proto("/explorer?as=reader")} variant="primary">Read the product architecture explorer</ButtonLink>
          <a className="ds-button ds-button--secondary" href={REQUIREMENT_APP_URL ?? undefined}><span>Go to Requirement AI</span></a>
        </ActionGroup>
        <p className="proto-quiet">To curate, ask your platform administrator to add you to the knowledge admins.</p>
      </>
    );
  }
  if (kind === "session") {
    return (
      <>
        <PageHeader title="Your session has ended" lead="For your security you were signed out after a period without activity. Unsaved review decisions on this device are kept." />
        <ActionGroup><Button variant="primary">Sign in again</Button></ActionGroup>
      </>
    );
  }
  if (kind === "offline") {
    return (
      <>
        <PageHeader title="The portal can't reach its service" lead="Your unsaved work stays on this page. The portal keeps trying, and carries on where you were once it answers." />
        <ActionGroup><Button>Try now</Button></ActionGroup>
      </>
    );
  }
  return (
    <>
      <PageHeader title="We couldn't find that page" lead={<>Nothing is at <code>{location.pathname}</code>. It may have moved; older addresses redirect to their new place.</>} />
      <Section title="Where to go">
        <Lines>
          <li><RouterLink href={proto()}>Your work</RouterLink></li>
          <li><RouterLink href={proto("/library")}>Library</RouterLink></li>
          <li><RouterLink href={proto("/architecture")}>Catalogue</RouterLink></li>
          <li><RouterLink href={proto("/ownership")}>Ownership</RouterLink></li>
          <li><RouterLink href={proto("/requirement-knowledge")}>Requirements</RouterLink></li>
          <li><RouterLink href={proto("/explorer")}>Explorer</RouterLink></li>
        </Lines>
      </Section>
    </>
  );
}

/** Requirements: empty states only, offline (the corpus lives in requirement-portal). */
export function RequirementsEmpty({ what }: { what: "overview" | "requirements" | "findings" | "historic" }) {
  const items = [
    { href: proto("/requirement-knowledge"), label: "Overview", current: what === "overview" },
    { href: proto("/requirement-knowledge/requirements"), label: "Requirements", current: what === "requirements" },
    { href: proto("/requirement-knowledge/findings"), label: "Findings", current: what === "findings" },
    { href: proto("/requirement-knowledge/historic"), label: "Historic requirements", current: what === "historic" },
  ];
  const copy = {
    overview: { title: "Requirements", empty: "No requirements yet.", why: "Requirement work keeps them; they appear here once Requirement AI holds some." },
    requirements: { title: "Requirements", empty: "No requirements yet.", why: "They come from Requirement AI. Filters appear once there is something to filter." },
    findings: { title: "Findings", empty: "No findings.", why: "Possible duplicates and contradictions between requirements appear here." },
    historic: { title: "Historic requirements", empty: "No historic requirements yet.", why: "Import the first BRDs to build them." },
  }[what];
  return (
    <>
      <PageHeader title={copy.title}>
        <SubNav label="Requirements" link={RouterLink} items={items} />
      </PageHeader>
      <EmptyState
        title={copy.empty}
        action={what === "historic" ? <Button variant="primary">Import BRDs…</Button> : <a className="ds-button ds-button--secondary" href={REQUIREMENT_APP_URL ?? undefined}><span>Open Requirement AI</span></a>}
      >
        <p>{copy.why}</p>
      </EmptyState>
    </>
  );
}

/** The prototype's own index: the five journeys and the failure paths, as the round-2 script reaches them. */
export function PrototypeIndex() {
  const journeys: [string, string, string][] = [
    ["1 Library publication", "/library", "Open 'Product eligibility matrix (sample)': review desk, bulk-exclude the hidden sheet, save, publish. Withdraw and return to service on 'Legacy ADSL ordering (sample)'."],
    ["2 Catalogue release", "/architecture/versions", "Open the draft 'October integration update (sample)': Sources → Decide (a, r, z) → Changes → Check → Publish."],
    ["3 Ownership change", "/ownership", "Give a system with no squad to the suggested squad; focus moves to the next gap."],
    ["4 Quick check-in", "/", "Your work: open the top item, come back, see the count fall. Try the scenario 'Re-confirmations due'."],
    ["5 Explorer reading", "/explorer?as=reader", "Reader view: the answer first. Try the scenario 'Stale Explorer link'. Resize to 390 px."],
  ];
  return (
    <>
      <PageHeader title="Prototype index" lead="The hi-fi prototype for round 2: the design system over real seeded reads, with simulated writes. Nothing is saved." />
      <Section title="The five journeys">
        <Lines>{journeys.map(([name, to, how]) => <li key={name}><RouterLink href={proto(to)}>{name}</RouterLink>: {how}</li>)}</Lines>
      </Section>
      <Section title="System states">
        <Lines>
          <li><RouterLink href={proto("/states/no-access")}>No access (reader)</RouterLink></li>
          <li><RouterLink href={proto("/states/not-found")}>Not found</RouterLink></li>
          <li><RouterLink href={proto("/states/session")}>Session ended</RouterLink></li>
          <li><RouterLink href={proto("/states/offline")}>Service unreachable</RouterLink></li>
        </Lines>
      </Section>
      <EmptyState title="Failure paths">
        <p>Use the Scenario control in the lab bar to force a failure (a job fails, held by the scan, a conflict, too many checks, Requirement AI unreachable, offline, a stale link), then repeat the step.</p>
      </EmptyState>
    </>
  );
}

export function Settings() {
  return <PageHeader title="Settings" lead="Density and keyboard shortcuts live in the Account panel, saved as you change them." />;
}

import { Link, useLocation } from "react-router-dom";

import { REQUIREMENT_APP_URL } from "../../../auth/paths";
import { wf } from "../lab-context";
import { Empty, Note, Page, SubNav } from "../ui";

/** System state archetype: what happened, why, what you can do, who you are, and Help. */
export function SystemState({ kind }: { kind: "no-access" | "not-found" | "session" | "offline" }) {
  const location = useLocation();
  if (kind === "no-access") {
    return (
      <Page title="This portal is for knowledge admins" archetype="System state">
        <p>You're signed in as <strong>Omar Observer</strong>. Curating the library and the catalogue needs the Knowledge admin role.</p>
        <div className="wf-actions">
          <Link to={wf("/explorer?as=reader")} className="wf-button wf-button--primary">Read the product architecture explorer</Link>
          <a href={REQUIREMENT_APP_URL} className="wf-button">Requirement AI</a>
        </div>
        <p className="wf-quiet">To curate, ask your platform administrator to add you to the knowledge admins.</p>
      </Page>
    );
  }
  if (kind === "session") {
    return (
      <Page title="Your session has ended" archetype="System state">
        <p>For your security you were signed out after a period without activity. Unsaved review decisions on this device are kept.</p>
        <button type="button" className="wf-button wf-button--primary">Sign in again</button>
      </Page>
    );
  }
  if (kind === "offline") {
    return (
      <Page title="The portal can't reach its service" archetype="System state">
        <p>Your unsaved work stays on this page. The portal keeps trying and continues where you were once it answers.</p>
        <button type="button" className="wf-button">Try now</button>
      </Page>
    );
  }
  return (
    <Page title="We couldn't find that page" archetype="System state">
      <p>Nothing is at <code>{location.pathname}</code>. It may have moved; older addresses redirect to their new place.</p>
      <ul className="wf-lines">
        <li><Link to={wf()}>Your work</Link></li>
        <li><Link to={wf("/library")}>Library</Link></li>
        <li><Link to={wf("/architecture")}>Catalogue</Link></li>
        <li><Link to={wf("/ownership")}>Ownership</Link></li>
        <li><Link to={wf("/requirement-knowledge")}>Requirements</Link></li>
        <li><Link to={wf("/explorer")}>Explorer</Link></li>
      </ul>
    </Page>
  );
}

/** Requirements: empty states only offline (the corpus lives in requirement-portal). */
export function RequirementsEmpty({ what }: { what: "overview" | "requirements" | "findings" | "historic" }) {
  const sub = [
    { to: wf("/requirement-knowledge"), label: "Overview", end: true },
    { to: wf("/requirement-knowledge/requirements"), label: "Requirements" },
    { to: wf("/requirement-knowledge/findings"), label: "Findings" },
    { to: wf("/requirement-knowledge/historic"), label: "Historic requirements" },
  ];
  const copy = {
    overview: { title: "Requirements", empty: "No requirements yet.", why: "Requirement work keeps them; they appear here once Requirement AI holds some." },
    requirements: { title: "Requirements", empty: "No requirements yet.", why: "They come from Requirement AI. Filters appear once there is something to filter." },
    findings: { title: "Findings", empty: "No findings.", why: "Possible duplicates and contradictions between requirements appear here." },
    historic: { title: "Historic requirements", empty: "No historic requirements yet.", why: "Import the first BRDs to build them." },
  }[what];
  return (
    <Page title={copy.title} archetype={what === "findings" ? "Queue" : "Browse"} head={<SubNav label="Requirements" items={sub} />}>
      <Empty
        title={copy.empty}
        why={copy.why}
        action={what === "historic" ? <button type="button" className="wf-button wf-button--primary">Import BRDs…</button> : <a className="wf-button" href={REQUIREMENT_APP_URL}>Open Requirement AI</a>}
      />
      <Note>Health claims ("all indexed") appear only when the count is above 0. Filter strips hide at zero.</Note>
    </Page>
  );
}

/** The lab's own index: every archetype and every journey, as a test script would reach them. */
export function LabIndex() {
  const journeys: [string, string, string][] = [
    ["1 Library publication", "/library", "Open 'Product eligibility matrix (sample)': review desk, bulk-exclude the hidden sheet, save, publish. Withdraw and Return to service on 'Legacy ADSL ordering (sample)'."],
    ["2 Catalogue release", "/architecture/versions", "Open the draft 'October integration update (sample)': Sources → Decide (a, r, z) → Changes → Check → Publish."],
    ["3 Ownership change", "/ownership", "Give a system with no squad to the suggested squad; focus moves to the next gap."],
    ["4 Quick check-in", "/", "Your work: open the top item, come back, see the count fall. Try scenario 'Re-confirmations due'."],
    ["5 Explorer reading", "/explorer?as=reader", "Reader view: answer first. Try scenario 'Stale Explorer link'. Resize to 390 px."],
  ];
  const archetypes: [string, string][] = [
    ["Queue", "/"],
    ["Record", "/architecture/systems/cwom"],
    ["Review desk", "/library"],
    ["Compare", "/architecture/versions"],
    ["Browse", "/library"],
    ["Flow", "/architecture/versions"],
    ["Settings", "/settings"],
    ["System state", "/states/not-found"],
  ];
  return (
    <Page title="Wireframe lab" archetype="Index" lead="Low-fidelity wireframes for round 1. Greyscale, system font, real seeded reads, simulated writes.">
      <section className="wf-section" aria-labelledby="lab-j">
        <h2 id="lab-j">The five journeys</h2>
        <ol className="wf-lines">{journeys.map(([name, to, how]) => <li key={name}><Link to={wf(to)}>{name}</Link>: {how}</li>)}</ol>
      </section>
      <section className="wf-section" aria-labelledby="lab-a">
        <h2 id="lab-a">Page archetypes</h2>
        <ul className="wf-lines">{archetypes.map(([name, to]) => <li key={name}><Link to={wf(to)}>{name}</Link></li>)}</ul>
      </section>
      <section className="wf-section" aria-labelledby="lab-s">
        <h2 id="lab-s">System states</h2>
        <ul className="wf-lines">
          <li><Link to={wf("/states/no-access")}>No access (reader)</Link></li>
          <li><Link to={wf("/states/not-found")}>Not found</Link></li>
          <li><Link to={wf("/states/session")}>Session ended</Link></li>
          <li><Link to={wf("/states/offline")}>Service unreachable</Link></li>
        </ul>
      </section>
      <Empty title="Failure paths" why="Use the Scenario control at the top of every page to force a failure, then repeat the step." />
    </Page>
  );
}

export function Settings() {
  return (
    <Page title="Settings" archetype="Settings" lead="Density and keyboard shortcuts live in the Account panel, saved as you change them.">
      <p>Open <strong>Account</strong> in the top bar.</p>
    </Page>
  );
}

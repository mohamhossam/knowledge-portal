import "./shell.css";

import { type RefObject, useEffect, useState } from "react";

import type { Actor } from "../api/client";
import { useAuth } from "../auth/authContext";
import {
  ActionGroup,
  Button,
  Checkbox,
  Drawer,
  HelpContent,
  JobTray,
  RadioGroup,
  Select,
  ShortcutHelp,
  Skeleton,
} from "../design/components";
import { helpFor, PAGE_KEYS } from "./help";
import { ButtonLink, RouterLink } from "./links";
import { type Density, usePreferences } from "./preferences";
import type { ShellJob } from "./useJobs";

type PanelProps = { onClose: () => void; panelRef: RefObject<HTMLElement | null> };

/** §6: background work, by need, each with its cause and its fix. */
export function JobsPanel({ jobs, state, onRetry, onClose, panelRef }: PanelProps & { jobs: ShellJob[]; state: "loading" | "failed" | "ready"; onRetry: () => void }) {
  return (
    <Drawer title="Jobs" onClose={onClose} panelRef={panelRef}>
      <p className="shell-panel__lead">Documents being read, and reading that needs you.</p>
      {state === "loading" ? (
        <Skeleton label="Reading the jobs" rows={3} />
      ) : state === "failed" ? (
        <p>Couldn't read the jobs. <Button variant="link" onClick={onRetry}>Try again</Button></p>
      ) : (
      <JobTray
        link={RouterLink}
        empty="No jobs are running. Reading appears here while it runs, and stays when it needs you."
        jobs={jobs.map(({ fixLabel, ...job }) => ({
          ...job,
          fix: fixLabel && job.subjectHref ? <ButtonLink to={job.subjectHref}>{fixLabel}<span className="ds-visually-hidden">: {job.subject}</span></ButtonLink> : undefined,
        }))}
      />
      )}
    </Drawer>
  );
}

/** §14: the same four parts, in the same order, on every page (WCAG 3.2.6). */
export function HelpPanel({ path, section, onClose, panelRef }: PanelProps & { path: string; section: string | null }) {
  const { shortcuts, setShortcuts } = usePreferences();
  const entry = helpFor(path);
  // "?help=shortcuts" (the keys line under a grid, or "?") opens Help at its shortcuts.
  useEffect(() => {
    if (section !== "shortcuts") return;
    const heading = document.getElementById("ds-help-keys");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus();
  }, [section]);
  return (
    <Drawer title="Help" onClose={onClose} panelRef={panelRef}>
      <HelpContent
        page={{ title: entry.title, body: entry.body.map((line) => <p key={line}>{line}</p>) }}
        shortcuts={
          <ShortcutHelp
            widget={entry.keys.length ? [{ title: "On this page", shortcuts: entry.keys.map(([keys, does]) => ({ keys, does })) }] : []}
            global={PAGE_KEYS.map(([keys, does]) => ({ keys, does }))}
            enabled={shortcuts}
            onToggle={setShortcuts}
          />
        }
        terms={entry.terms.map(([term, meaning]) => ({ term, meaning }))}
        contact={<p>Ask the knowledge team in your usual support channel.</p>}
      />
    </Drawer>
  );
}

/** Who is signed in, and their display preferences, saved as they change. */
export function AccountPanel({ actor, onClose, panelRef }: PanelProps & { actor: Actor }) {
  const auth = useAuth();
  const { density, setDensity, shortcuts, setShortcuts } = usePreferences();
  const [saved, setSaved] = useState("");
  const offline = auth?.config?.mode === "fake";
  return (
    <Drawer title="Account" onClose={onClose} panelRef={panelRef}>
      <p>
        Signed in as <strong><bdi>{actor.display_name}</bdi></strong>, Knowledge admin.
      </p>
      {offline && auth?.config ? (
        <Select
          label="Persona"
          hint="Offline sign-in: switch who you act as."
          value={actor.id}
          onChange={(event) => void auth.switchFakeActor(event.target.value)}
        >
          {auth.config.fake_actors.map((item) => (
            <option key={item.id} value={item.id} dir="auto">{item.display_name}</option>
          ))}
        </Select>
      ) : (
        <ActionGroup>
          <Button onClick={() => void auth?.signOut()}>Sign out</Button>
        </ActionGroup>
      )}
      <RadioGroup<Density>
        legend="Density"
        name="shell-density"
        value={density}
        options={[
          { value: "automatic", label: "Automatic", hint: "Compact on review desks, comfortable elsewhere" },
          { value: "comfortable", label: "Comfortable" },
          { value: "compact", label: "Compact" },
        ]}
        onChange={(value) => {
          setDensity(value);
          setSaved(`Density: ${value}. Saved.`);
        }}
      />
      <Checkbox
        label="Page-wide keyboard shortcuts (g, ?, /)"
        hint="Off by default. Keys inside a table work either way."
        checked={shortcuts}
        onChange={(event) => {
          setShortcuts(event.target.checked);
          setSaved(`Keyboard shortcuts ${event.target.checked ? "on" : "off"}. Saved.`);
        }}
      />
      <p className="shell-panel__saved" role="status">{saved}</p>
    </Drawer>
  );
}

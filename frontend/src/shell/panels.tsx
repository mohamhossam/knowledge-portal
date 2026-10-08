import "./shell.css";

import { type RefObject, useEffect, useState } from "react";

import type { Actor, LibraryDocument } from "../api/client";
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
  Status,
} from "../design/components";
import type { JobAction } from "../library/actions";
import { helpFor, PAGE_KEYS } from "./help";
import { ButtonLink, RouterLink } from "./links";
import { type Density, usePreferences } from "./preferences";
import type { ShellJob } from "./useJobs";

type PanelProps = { onClose: () => void; panelRef: RefObject<HTMLElement | null> };

/** §6: background work, by need, each with its cause, its attempts, and its fix: Try again, Stop, or the specific fix. */
export function JobsPanel({ jobs, state, onRetry, onAct, said, onClose, panelRef }: PanelProps & {
  jobs: ShellJob[];
  state: "loading" | "failed" | "ready";
  onRetry: () => void;
  onAct: (document: LibraryDocument, action: JobAction) => void;
  said: { text: string; failed: boolean } | null;
}) {
  return (
    <Drawer title="Jobs" onClose={onClose} panelRef={panelRef}>
      <p className="shell-panel__lead">Documents being read or indexed, what needs you, and what finished in the last 30 minutes.</p>
      <p className="shell-panel__said" role="status">{said ? said.failed ? <Status tone="attention">{said.text}</Status> : said.text : null}</p>
      {state === "loading" ? (
        <Skeleton label="Reading the jobs" rows={3} />
      ) : state === "failed" ? (
        <p>Couldn't read the jobs. <Button variant="link" onClick={onRetry}>Try again</Button></p>
      ) : (
      <JobTray
        link={RouterLink}
        empty="No jobs are running. Reading and indexing appear here while they run, and stay when they need you."
        jobs={jobs.map(({ fixLabel, retry, stop, document, ...job }) => ({
          ...job,
          fix: fixLabel && job.subjectHref ? <ButtonLink to={job.subjectHref}>{fixLabel}<span className="ds-visually-hidden">: {job.subject}</span></ButtonLink> : undefined,
          onRetry: retry && document ? () => onAct(document, retry) : undefined,
          onCancel: stop && document ? () => onAct(document, "cancel") : undefined,
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

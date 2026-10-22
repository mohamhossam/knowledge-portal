import { useQuery } from "@tanstack/react-query";
import { Download, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import { api, type CatalogueFileFormat, type Release, type ReleaseAuditEvent } from "../api/client";
import { errorMessage } from "../api/errors";
import {
  ActionGroup, Button, ConsequencePanel, DataTable, EmptyState, Facts, ListTools, RecordList, RecordPlaceholder, RecordView, Section, Skeleton,
  Status, type StatusTone, Workbench,
} from "../design/components";
import { useFocusAfterRender } from "../design/hooks";
import { count, formatDay } from "../home/format";
import { ButtonLink, RouterLink } from "../shell/links";
import { auditLabel, changeSentence, contents } from "./catalogue";
import { ChangeRequestInbox } from "./ChangeRequests";
import { VersionsTimeline } from "./diagrams/CatalogueDiagrams";
import { StartDraft } from "./DraftActions";
import { CatalogueHeader } from "./frame/CatalogueHeader";
import { useActivate, useCatalogueContext, useReleases } from "./useCatalogue";

type State = "in-service" | "draft" | "replaced";

const STATE_LABEL: Record<State, string> = {
  "in-service": "In service",
  draft: "In preparation",
  replaced: "Replaced",
};

const STATE_TONE: Record<State, StatusTone> = { "in-service": "done", draft: "working", replaced: "stopped" };

const nameOf = (release: Release) => release.name || "Untitled version";
/** A version's record on Versions: the address names it, as ?version=. */
const recordHref = (release: Release) => `/architecture/versions?${new URLSearchParams({ version: release.id })}`;

/**
 * Every catalogue version on the workbench (UX rebuild, phase 3): the draft,
 * the one in service and those it replaced, newest first, beside the record of
 * the one chosen (its state, who published it when, what it changed, its
 * history and files, and the way to open it, compare it or put it back). With
 * none chosen, the change requests from connected apps waiting to be read.
 */
export function VersionsPage() {
  const { book, actorName } = useCatalogueContext();
  const releases = useReleases();
  const [params] = useSearchParams();
  const location = useLocation();
  const focusLater = useFocusAfterRender();
  const [notice, setNotice] = useState<string | null>((location.state as { notice?: string } | null)?.notice ?? null);
  const [starting, setStarting] = useState(false);
  const activeId = book.release.id;
  const state = (release: Release): State => (release.status === "draft" ? "draft" : release.id === activeId ? "in-service" : "replaced");
  // The draft first, then by when each was published, newest first.
  const rows = [...(releases.data ?? [])].sort((a, b) => {
    if (a.status !== b.status) return a.status === "draft" ? -1 : 1;
    return (b.published_at ?? "").localeCompare(a.published_at ?? "");
  });
  const draft = rows.find((release) => release.status === "draft");
  const chosenId = params.get("version");
  const chosen = chosenId ? rows.find((release) => release.id === chosenId) : undefined;
  // The version published before the chosen one: what it changed is read against it.
  const published = rows.filter((release) => release.status !== "draft");
  const previous = chosen && chosen.status !== "draft" ? published[published.indexOf(chosen) + 1] : undefined;

  const record = starting ? (
    <StartDraft
      onCancel={() => {
        setStarting(false);
        focusLater(() => document.getElementById("version-start"));
      }}
    />
  ) : releases.isPending ? (
    <Skeleton label="Reading the versions" rows={6} />
  ) : releases.isError ? (
    <EmptyState title={`The knowledge service didn't answer: ${errorMessage(releases.error)}`} action={<Button onClick={() => void releases.refetch()}>Try again</Button>} />
  ) : chosen ? (
    <VersionRecord
      key={chosen.id}
      release={chosen}
      releases={rows}
      state={state(chosen)}
      previous={previous}
      activeId={activeId}
      onPutBack={() => setNotice(`‘${nameOf(chosen)}’ is in service again.`)}
    />
  ) : chosenId ? (
    <EmptyState title={`There is no version “${chosenId}”.`} action={<RouterLink href="/architecture/versions">See every version</RouterLink>} />
  ) : (
    <RecordPlaceholder title={`${count(rows.length, "version")}. Choose one to read what it changed, its history and its files.`}>
      <p className="cat-lead">
        Requirements are mapped against the version in service. Publishing a draft puts it in service; an earlier version can be put
        back, with a reason.
      </p>
      <VersionsTimeline />
      <div className="cat-actions ds-actions">
        {draft && <ButtonLink to={`/architecture/versions/${encodeURIComponent(draft.id)}/sources`} variant="primary">Carry on with ‘<bdi>{nameOf(draft)}</bdi>’</ButtonLink>}
        {rows.length > 1 && <ButtonLink to="/architecture/compare">Compare any two versions</ButtonLink>}
      </div>
      <ChangeRequestInbox releases={rows} actorName={actorName} />
    </RecordPlaceholder>
  );

  return (
    <>
      <CatalogueHeader page="versions" chosen={chosen ? nameOf(chosen) : undefined} />
      <Workbench
        listLabel="Versions"
        chosen={Boolean(chosen) || starting}
        list={
          <>
            <ListTools count={releases.data ? count(rows.length, "version") : undefined}>
              {releases.data && !draft && !starting && (
                <Button id="version-start" variant="tertiary" icon={<Plus size={16} />} onClick={() => setStarting(true)}>Start a new version</Button>
              )}
            </ListTools>
            <RecordList
              label="Catalogue versions, newest first"
              currentId={chosen?.id}
              link={RouterLink}
              items={rows.map((release) => ({
                id: release.id,
                href: recordHref(release),
                name: nameOf(release),
                bidi: true,
                detail:
                  release.status === "draft"
                    ? `Started by ${actorName(release.created_by)}`
                    : `Published ${formatDay(release.published_at)} by ${actorName(release.published_by)}`,
                meta: <Status tone={STATE_TONE[state(release)]}>{STATE_LABEL[state(release)]}</Status>,
              }))}
              empty={releases.isPending ? "Reading the versions…" : "No version yet."}
            />
          </>
        }
        record={
          <>
            {notice && <p role="status" className="cat-notice"><Status tone="done">{notice}</Status></p>}
            {record}
          </>
        }
      />
    </>
  );
}

const FORMATS: { format: CatalogueFileFormat; label: string }[] = [
  { format: "xlsx", label: "Excel" },
  { format: "yaml", label: "YAML" },
  { format: "json", label: "JSON" },
];

function VersionRecord({ release, releases, state, previous, activeId, onPutBack }: {
  release: Release;
  /** Every version: the change requests name the draft they were read into. */
  releases: Release[];
  state: State;
  /** The version published before it, if any. */
  previous?: Release;
  activeId: string;
  onPutBack: () => void;
}) {
  const { actorName } = useCatalogueContext();
  const location = useLocation();
  const [puttingBack, setPuttingBack] = useState(false);
  const focusLater = useFocusAfterRender();
  const name = nameOf(release);
  const holds = contents(release);
  const open = state === "in-service" ? "/architecture" : `/architecture/versions/${encodeURIComponent(release.id)}`;
  const published = <>published by <bdi>{actorName(release.published_by)}</bdi> on {formatDay(release.published_at)}</>;
  const lead: Record<State, ReactNode> = {
    draft: <>A draft started by <bdi>{actorName(release.created_by)}</bdi>. Nothing in it is in service until it is published.</>,
    "in-service": <>The version in service, {published}.</>,
    replaced: <>Replaced: {published}, and no longer in service.</>,
  };
  const keep = () => {
    setPuttingBack(false);
    focusLater(() => document.getElementById("version-put-back"));
  };

  return (
    <RecordView
      title={name}
      takeFocus={location.key !== "default"}
      meta={
        <>
          <Status tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Status>
          <span>Revision {release.revision}</span>
        </>
      }
      lead={lead[state]}
      actions={
        <ActionGroup label={`This version: ${name}`}>
          {state === "draft" && <ButtonLink to={`/architecture/versions/${encodeURIComponent(release.id)}/sources`} variant="primary">Carry on with its steps</ButtonLink>}
          <ButtonLink to={open}>Read its contents</ButtonLink>
          {state === "replaced" && (
            <Button id="version-put-back" variant="tertiary" aria-expanded={puttingBack} onClick={() => (puttingBack ? keep() : setPuttingBack(true))}>
              Put it back in service…
            </Button>
          )}
        </ActionGroup>
      }
    >
      {puttingBack && <PutBack release={release} onDone={() => { setPuttingBack(false); onPutBack(); }} onKeep={keep} />}
      <Section title="What it holds" headingLevel={3}>
        <Facts
          items={[
            ["Systems", holds.systems.toLocaleString("en")],
            ["Connections", holds.connections.toLocaleString("en")],
            ["Offerings", holds.offerings.toLocaleString("en")],
            ["Journeys", holds.journeys.toLocaleString("en")],
          ]}
        />
      </Section>
      <Changes release={release} state={state} previous={previous} activeId={activeId} />
      <Files release={release} />
      <History release={release} />
      {/* Change requests are read into the draft, so the draft's record carries them. */}
      {state === "draft" && <ChangeRequestInbox releases={releases} actorName={actorName} headingLevel={3} />}
    </RecordView>
  );
}

const PAST: Record<string, string> = { add: "added", change: "changed", remove: "removed" };
/** A change sentence ("add 1 offering, and change 2 systems") told as done: "added 1 offering, and changed 2 systems". */
const pastTense = (sentence: string) => sentence.replace(/(^|, (?:and )?)(add|change|remove) (?=\d)/g, (_, before: string, verb: string) => `${before}${PAST[verb]} `);

/** What a version changed: a draft against the version in service, a published one against the one before it. */
function Changes({ release, state, previous, activeId }: { release: Release; state: State; previous?: Release; activeId: string }) {
  const base = state === "draft" ? undefined : previous?.id;
  const changes = useQuery({
    queryKey: ["architecture", "releases", release.id, "changes", release.revision, ...(base ? [base] : [])],
    queryFn: () => api.releaseChanges(release.id, base),
    enabled: state === "draft" || previous !== undefined,
  });
  const sentence = changes.data ? changeSentence(changes.data) : null;
  const against = state === "draft" ? activeId : previous?.id;
  const every = against && <RouterLink href={`/architecture/compare?${new URLSearchParams({ from: against, to: release.id })}`}>See every difference</RouterLink>;
  // A published version compares with the one in service too (the one in service, with the newest other one, which Compare picks).
  const compare = state !== "draft" && (
    <RouterLink href={`/architecture/compare?${new URLSearchParams(release.id === activeId ? { from: activeId } : { from: activeId, to: release.id })}`}>
      {release.id === activeId ? "Compare it with another version" : "Compare it with the version in service"}
    </RouterLink>
  );
  return (
    <Section title="What it changed" headingLevel={3}>
      {state !== "draft" && !previous ? (
        <p className="cat-quiet">Nothing was published before it: it is the first version.</p>
      ) : changes.isPending ? (
        <Skeleton label="Comparing it" rows={1} />
      ) : changes.isError ? (
        <p role="alert"><Status tone="attention">{errorMessage(changes.error)}</Status></p>
      ) : (
        <p>
          {state === "draft"
            ? sentence ? `Publishing it would ${sentence}.` : "Its contents match the version in service."
            : sentence ? <>Against ‘<bdi>{nameOf(previous!)}</bdi>’, the version before it, it {pastTense(sentence)}.</> : <>Its contents match ‘<bdi>{nameOf(previous!)}</bdi>’, the version before it.</>}
          {sentence && every && <>{" "}{every}</>}
        </p>
      )}
      {compare && <p>{compare}</p>}
    </Section>
  );
}

function Files({ release }: { release: Release }) {
  const [failure, setFailure] = useState<string | null>(null);
  const download = async (format: CatalogueFileFormat) => {
    setFailure(null);
    try {
      const blob = await api.catalogueFile(release.id, format);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `${(release.name || release.id).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };
  return (
    <Section title="Its catalogue file" headingLevel={3}>
      <ActionGroup label="Download its catalogue file">
        {FORMATS.map(({ format, label }) => (
          <Button key={format} icon={<Download size={16} />} onClick={() => void download(format)}>
            {label}
            <span className="ds-visually-hidden"> file of {nameOf(release)}</span>
          </Button>
        ))}
      </ActionGroup>
      {failure && <p role="alert"><Status tone="attention">{failure}</Status></p>}
    </Section>
  );
}

/** What happened to a version, newest first: a log, so a table. */
function History({ release }: { release: Release }) {
  const { actorName } = useCatalogueContext();
  const audit = useQuery({
    queryKey: ["architecture", "releases", release.id, "audit"],
    queryFn: () => api.releaseAudit(release.id),
  });
  const events = [...(audit.data ?? [])].reverse();
  return (
    <Section title="What happened to it" count={audit.data ? events.length : undefined} headingLevel={3}>
      {audit.isPending ? (
        <Skeleton label="Reading its history" rows={3} />
      ) : audit.isError ? (
        <p role="alert"><Status tone="attention">{errorMessage(audit.error)}</Status></p>
      ) : (
        <DataTable<ReleaseAuditEvent>
          caption={`What happened to ${nameOf(release)}`}
          captionHidden
          rows={events}
          rowId={(event) => `${event.created_at}:${event.action}:${event.revision}`}
          emptyText="Nothing is recorded; it was loaded as the initial catalogue."
          columns={[
            { id: "when", header: "When", rowHeader: true, width: "9rem", cell: (event) => formatDay(event.created_at) },
            {
              id: "what",
              header: "What",
              cell: (event) => (
                <>
                  {auditLabel(event)}, by <bdi>{actorName(event.actor_id)}</bdi>
                  <span className="cat-quiet"> · revision {event.revision}</span>
                  {event.rationale && <span className="cat-detail" dir="auto">“{event.rationale}”</span>}
                </>
              ),
            },
          ]}
        />
      )}
    </Section>
  );
}

/** Putting a replaced version back in service: the consequence first, then a reason. */
function PutBack({ release, onDone, onKeep }: { release: Release; onDone: () => void; onKeep: () => void }) {
  const activate = useActivate();
  const changes = useQuery({
    queryKey: ["architecture", "releases", release.id, "changes", release.revision],
    queryFn: () => api.releaseChanges(release.id),
  });
  const sentence = changes.data ? changeSentence(changes.data) : null;
  const name = nameOf(release);
  return (
    <ConsequencePanel
      title={<>Put ‘<bdi>{name}</bdi>’ back in service</>}
      happens={
        <>
          Requirements would be mapped against ‘<bdi>{name}</bdi>’ from then on.
          {sentence && <> Against the version in service, it would {sentence}.</>}
        </>
      }
      reversibility="The version in service now can be put back the same way, with a reason."
      reason={{ label: "Why it goes back", hint: "It is kept in the version's history.", maxLength: 2000 }}
      confirmLabel="Put it back in service"
      keepLabel="Keep the version in service"
      busy={activate.isPending}
      busyLabel="Putting it back…"
      failure={activate.isError ? errorMessage(activate.error) : null}
      onConfirm={(rationale) => activate.mutate({ releaseId: release.id, rationale }, { onSuccess: onDone })}
      onKeep={onKeep}
    />
  );
}

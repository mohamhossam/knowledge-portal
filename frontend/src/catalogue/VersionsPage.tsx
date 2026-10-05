import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, RotateCw } from "lucide-react";
import { Fragment, useEffect, useId, useState, useSyncExternalStore } from "react";
import { Link, useLocation } from "react-router-dom";

import { api, type CatalogueFileFormat, type Release } from "../api/client";
import { errorMessage } from "../api/errors";
import { count, formatDay } from "../home/format";
import { auditLabel, changeSentence, contents } from "./catalogue";
import { ChangeRequestInbox } from "./ChangeRequests";
import { StartDraft } from "./DraftActions";
import { useActivate, useCatalogueContext, useMappingImpact, useReleases } from "./useCatalogue";

type State = "in-service" | "draft" | "replaced";

const STATE_LABEL: Record<State, string> = {
  "in-service": "In service",
  draft: "In preparation",
  replaced: "Replaced",
};

const RANK: Record<State, string> = { "in-service": "row", draft: "row row--due", replaced: "row row--past" };

/** Every catalogue version, newest first: the draft, the one in service, and those it replaced. */
export function VersionsPage() {
  const { book, actorName } = useCatalogueContext();
  const releases = useReleases();
  const [open, setOpen] = useState<string | null>(null);
  // On a phone the state and the disclosure ride in the version cell, so its title keeps the width.
  const phone = useNarrow();
  const location = useLocation();
  const [notice, setNotice] = useState<string | null>((location.state as { notice?: string } | null)?.notice ?? null);
  const activeId = book.release.id;
  const state = (release: Release): State =>
    release.status === "draft" ? "draft" : release.id === activeId ? "in-service" : "replaced";
  const rows = [...(releases.data ?? [])].sort((a, b) => {
    if (a.status !== b.status) return a.status === "draft" ? -1 : 1;
    return (b.published_at ?? "").localeCompare(a.published_at ?? "");
  });

  return (
    <>
    <section className="govsection catalogue__first" aria-labelledby="versions-title">
      <h2 id="versions-title" className="govsection__title">Versions</h2>
      <p className="govsection__lead">
        Requirement work maps against the version in service. Publishing a draft puts it in service; an earlier version can
        be put back, with a reason.
      </p>
      {notice && <p className="toolbar__notice" role="status">{notice}</p>}
      {releases.isPending ? (
        <p className="timetable__quiet">Reading the versions…</p>
      ) : releases.isError ? (
        <p className="docpage__failure" role="alert">
          {errorMessage(releases.error)}
          <button type="button" className="text-button" onClick={() => void releases.refetch()}>
            <RotateCw size={14} aria-hidden="true" />
            Try again
          </button>
        </p>
      ) : (
        <table className="govtable versions">
          <caption className="visually-hidden">Catalogue versions, newest first</caption>
          <thead>
            <tr>
              <th scope="col">Version</th>
              {!phone && <th scope="col">State</th>}
              {!phone && <th scope="col" className="cell--end"><span className="visually-hidden">Details</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((release) => {
              const current = state(release);
              const holds = contents(release);
              const isOpen = open === release.id;
              const detailId = `version-${release.id}`;
              const to = current === "in-service" ? "/architecture" : `/architecture/versions/${encodeURIComponent(release.id)}`;
              const toggle = (
                <button
                  type="button"
                  className="text-button"
                  aria-expanded={isOpen}
                  aria-controls={detailId}
                  onClick={() => setOpen(isOpen ? null : release.id)}
                >
                  {isOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                  {current === "replaced" ? "History, files, put back" : "History and files"}
                  <span className="visually-hidden"> of {release.name}</span>
                </button>
              );
              const stated = (
                <>
                  <span className="status">{STATE_LABEL[current]}</span>
                  <span className="secondary govtable__by">
                    {release.status === "draft"
                      ? `Started by ${actorName(release.created_by)}`
                      : `Published ${formatDay(release.published_at)} by ${actorName(release.published_by)}`}
                    {` · revision ${release.revision}`}
                  </span>
                </>
              );
              return (
                <Fragment key={release.id}>
                  <tr className={`${RANK[current]}${isOpen ? " is-open" : ""}`}>
                    <th scope="row">
                      <Link to={to} dir="auto">{release.name || "Untitled version"}</Link>
                      <span className="secondary govtable__by">
                        {count(holds.systems, "system")} · {count(holds.connections, "connection")} ·{" "}
                        {count(holds.offerings, "offering")} · {count(holds.journeys, "journey")}
                      </span>
                      {phone && (
                        <span className="versions__phone">
                          {stated}
                          <span className="govtable__by">{toggle}</span>
                        </span>
                      )}
                    </th>
                    {!phone && <td>{stated}</td>}
                    {!phone && <td className="cell--end">{toggle}</td>}
                  </tr>
                  {isOpen && (
                    <tr id={detailId} className="versions__detail">
                      <td colSpan={phone ? 1 : 3}>
                        <VersionDetail
                          release={release}
                          canPutBack={current === "replaced"}
                          onPutBack={() => {
                            setOpen(null);
                            setNotice(`‘${release.name || "Untitled version"}’ is in service again.`);
                          }}
                          onKeep={() => setOpen(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      {releases.data && <StartDraft draft={releases.data.find((release) => release.status === "draft")} />}
    </section>
    {releases.data && <ChangeRequestInbox releases={releases.data} actorName={actorName} />}
    </>
  );
}

const NARROW = "(max-width: 45rem)";

function useNarrow(): boolean {
  return useSyncExternalStore(
    (changed) => {
      const query = window.matchMedia?.(NARROW);
      query?.addEventListener("change", changed);
      return () => query?.removeEventListener("change", changed);
    },
    () => window.matchMedia?.(NARROW).matches ?? false,
  );
}

const FORMATS: { format: CatalogueFileFormat; label: string }[] = [
  { format: "xlsx", label: "Excel" },
  { format: "yaml", label: "YAML" },
  { format: "json", label: "JSON" },
];

function VersionDetail({ release, canPutBack, onPutBack, onKeep }: {
  release: Release;
  canPutBack: boolean;
  onPutBack: () => void;
  onKeep: () => void;
}) {
  const { actorName } = useCatalogueContext();
  const id = useId();
  const audit = useQuery({
    queryKey: ["architecture", "releases", release.id, "audit"],
    queryFn: () => api.releaseAudit(release.id),
  });
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
  const events = [...(audit.data ?? [])].reverse();

  return (
    <div className="versions__body">
      <p className="govsection__actions">
        <span className="versions__label">Its catalogue file:</span>
        {FORMATS.map(({ format, label }) => (
          <button key={format} type="button" className="text-button" onClick={() => void download(format)}>
            <Download size={14} aria-hidden="true" />
            {label}
            <span className="visually-hidden"> file of {release.name}</span>
          </button>
        ))}
      </p>
      {failure && <p className="docpage__failure" role="alert">{failure}</p>}

      <h3 id={`${id}-history`} className="govsection__title versions__title">What happened to it</h3>
      {audit.isPending ? (
        <p className="timetable__quiet">Reading its history…</p>
      ) : audit.isError ? (
        <p className="docpage__failure" role="alert">{errorMessage(audit.error)}</p>
      ) : events.length ? (
        <table className="govtable" aria-labelledby={`${id}-history`}>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">What</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event, index) => (
              <tr key={`${event.created_at}:${index}`} className="row">
                <th scope="row" className="nowrap">{formatDay(event.created_at)}</th>
                <td>
                  {auditLabel(event)}, by {actorName(event.actor_id)}
                  <span className="secondary"> · revision {event.revision}</span>
                  {event.rationale && <span className="secondary govtable__by" dir="auto">“{event.rationale}”</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="timetable__quiet">Nothing is recorded; it was loaded as the initial catalogue.</p>
      )}

      {canPutBack && <PutBack release={release} onDone={onPutBack} onKeep={onKeep} />}
    </div>
  );
}

/** Putting a replaced version back in service: a reason, and the consequence first. */
function PutBack({ release, onDone, onKeep }: { release: Release; onDone: () => void; onKeep: () => void }) {
  const id = useId();
  const [reason, setReason] = useState("");
  const activate = useActivate();
  const impact = useMappingImpact();
  const changes = useQuery({
    queryKey: ["architecture", "releases", release.id, "changes", release.revision],
    queryFn: () => api.releaseChanges(release.id),
  });
  useEffect(() => {
    if (activate.isSuccess) onDone();
  }, [activate.isSuccess, onDone]);
  const sentence = changes.data ? changeSentence(changes.data) : null;
  const mapped = impact.data ? impact.data.requirements - impact.data.outdated_requirements : null;
  const name = release.name || "Untitled version";
  const waits = !reason.trim() ? "Give a reason first; it is kept in the version's history." : null;

  return (
    <section className="withdraw versions__putback" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="withdraw__title">Put it back in service</h3>
      <p>
        Requirement work would map against ‘<span dir="auto">{name}</span>’ from its next look at the catalogue.
        {sentence && <> Against the version in service, it would {sentence}.</>}
        {mapped !== null && (
          <>
            {" "}
            {mapped
              ? `${count(mapped, "requirement")} mapped with the version in service would then show as mapped with an earlier version.`
              : "No requirement has been mapped with the version in service yet."}
          </>
        )}
      </p>
      <label className="field" htmlFor={`${id}-reason`}>
        <span className="field__label">Why it goes back</span>
        <textarea
          id={`${id}-reason`}
          className="field__input field__input--text"
          rows={2}
          maxLength={2000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {activate.isError && <p className="docpage__failure" role="alert">{errorMessage(activate.error)}</p>}
      <p className="withdraw__actions">
        <button
          type="button"
          className="action-button"
          disabled={!!waits || activate.isPending}
          aria-describedby={waits ? `${id}-waits` : undefined}
          onClick={() => activate.mutate({ releaseId: release.id, rationale: reason.trim() })}
        >
          {activate.isPending ? "Putting it back…" : "Put it back in service"}
        </button>
        <button type="button" className="text-button" onClick={onKeep}>
          Keep the version in service
        </button>
      </p>
      {waits && <p id={`${id}-waits`} className="versions__waits">{waits}</p>}
    </section>
  );
}

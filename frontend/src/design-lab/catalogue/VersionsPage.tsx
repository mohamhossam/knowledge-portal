/**
 * Versions: every version of the catalogue, the one in service marked, the
 * draft in preparation first, then the published ones newest first. Read
 * only: starting a draft, carrying it on, putting an earlier version back and
 * downloading a version's files stay in the portal's catalogue, which this
 * page links to by name. With the bundled sample there is one version, the
 * sample itself.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { api, type Release } from "../../api/client";
import { errorMessage } from "../../api/errors";
import { Button, Skeleton, Status, type StatusTone } from "../../design/components";
import { formatDay } from "../../home/format";
import { useLabSource } from "./catalogueSource";
import { AreaTabs } from "./labChrome";
import { useLabData } from "./labData";
import { plural, useTitle } from "./labUtil";

type State = "in-service" | "draft" | "replaced";

const STATE: Record<State, { label: string; tone: StatusTone }> = {
  "in-service": { label: "In service", tone: "done" },
  draft: { label: "In preparation", tone: "working" },
  replaced: { label: "Replaced", tone: "stopped" },
};

type Row = { id: string; name: string; state: State; revision: number; publishedAt?: string | null };

export function VersionsPage() {
  const data = useLabData();
  useTitle("Versions");
  const sample = useLabSource()?.source === "sample";
  const releases = useQuery({ queryKey: ["architecture", "releases"], queryFn: api.releases, enabled: !sample });

  const stateOf = (release: Release): State => (release.status === "draft" ? "draft" : release.id === data.releaseId ? "in-service" : "replaced");
  // The draft first, then by when each was published, newest first.
  const rows: Row[] = sample
    ? [{ id: data.releaseId, name: data.name, state: "in-service", revision: data.revision, publishedAt: data.publishedAt }]
    : [...(releases.data ?? [])]
        .sort((a, b) => (a.status !== b.status ? (a.status === "draft" ? -1 : 1) : (b.published_at ?? "").localeCompare(a.published_at ?? "")))
        .map((release) => ({ id: release.id, name: release.name || "Untitled version", state: stateOf(release), revision: release.revision, publishedAt: release.published_at }));
  const draft = rows.find((row) => row.state === "draft");
  const published = rows.filter((row) => row.state !== "draft").length;

  return (
    <>
      <AreaTabs current="versions" />
      <header className="lx-head lx-band">
        <div className="lx-band-row">
          <span className="lx-mark" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="18" height="18">
              <circle cx="8" cy="8" r="6" />
              <path d="M8 4.5V8l2.5 1.5" />
            </svg>
          </span>
          <div className="lx-title">
            <h1>Versions</h1>
            <p className="lx-lede">Every version of the catalogue; requirement work maps against the one in service</p>
          </div>
          {!sample && (
            <div className="lx-tools">
              {draft && (
                <Link className="cl-btn" to={`/architecture/versions/${encodeURIComponent(draft.id)}/sources`}>
                  Carry on with the draft
                </Link>
              )}
              <Link className="cl-btn" to="/architecture/versions">
                Manage versions
              </Link>
            </div>
          )}
        </div>
        <div className="sy-row">
          <dl className="sy-figures">
            <div>
              <dt>In service</dt>
              <dd translate="no">
                {data.name} <small>revision {data.revision}</small>
              </dd>
            </div>
            {!sample && releases.data && (
              <>
                <div>
                  <dt>Published</dt>
                  <dd>{published}</dd>
                </div>
                <div>
                  <dt>In preparation</dt>
                  <dd>{draft ? 1 : 0}</dd>
                </div>
              </>
            )}
          </dl>
          <p className="sy-source">
            {sample
              ? "The bundled sample is one version. Switch to the live API to read every version."
              : "Read only here. Starting a draft, putting a version back and downloading a version’s files are in Manage versions."}
          </p>
        </div>
      </header>

      <div className="lx-board">
        {!sample && releases.isPending ? (
          <Skeleton label="Reading the versions" rows={4} />
        ) : !sample && releases.isError ? (
          <div className="cl-empty">
            <p>The versions couldn&rsquo;t be read: {errorMessage(releases.error)}</p>
            <div>
              <Button onClick={() => void releases.refetch()}>Try again</Button>
            </div>
          </div>
        ) : (
          <div className="cl-tablewrap">
            <table className="cl-table gv-table">
              <caption className="ds-visually-hidden">Catalogue versions, {plural(rows.length, "version")}, the draft first, then newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Version</th>
                  <th scope="col">State</th>
                  <th scope="col" className="num">Revision</th>
                  <th scope="col">Published</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} aria-current={row.state === "in-service" ? "true" : undefined}>
                    <th scope="row">
                      <bdi>{row.name}</bdi>
                    </th>
                    <td>
                      <Status tone={STATE[row.state].tone}>{STATE[row.state].label}</Status>
                    </td>
                    <td className="num">{row.revision}</td>
                    <td>{row.publishedAt ? formatDay(row.publishedAt) : <span className="gap">Not yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

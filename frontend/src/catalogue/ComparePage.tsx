import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, RotateCw } from "lucide-react";
import { useEffect, useId } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, type Release } from "../api/client";
import { errorMessage } from "../api/errors";
import { formatDay } from "../home/format";
import { DiffTable } from "./DiffTable";
import { useCatalogueContext, useReleases } from "./useCatalogue";

/** Newest first: the draft, then published versions by when they were published. */
function newestFirst(releases: Release[]): Release[] {
  return [...releases].sort((a, b) => {
    if (a.status !== b.status) return a.status === "draft" ? -1 : 1;
    return (b.published_at ?? "").localeCompare(a.published_at ?? "");
  });
}

/**
 * Any two catalogue versions, side by side (Knowledge Center C): what the later one adds,
 * changes and removes against the earlier. Both are named in the address, so a comparison
 * can be shared.
 */
export function ComparePage() {
  const { book } = useCatalogueContext();
  const releases = useReleases();
  const [params, setParams] = useSearchParams();
  const id = useId();
  const activeId = book.release.id;
  const ordered = newestFirst(releases.data ?? []);
  const from = params.get("from") ?? activeId;
  const to = params.get("to") ?? ordered.find((release) => release.id !== from)?.id ?? "";
  const toRelease = ordered.find((release) => release.id === to);
  const fromRelease = ordered.find((release) => release.id === from);
  const diff = useQuery({
    queryKey: ["architecture", "compare", from, to, toRelease?.revision, fromRelease?.revision],
    queryFn: () => api.releaseChanges(to, from),
    enabled: Boolean(from && to && from !== to),
  });

  useEffect(() => {
    window.document.title = "Compare versions · Catalogue · Knowledge portal";
  }, []);

  const name = (release: Release | undefined) => release?.name || "Untitled version";
  const describe = (release: Release) =>
    release.status === "draft"
      ? `${name(release)} (in preparation)`
      : `${name(release)} (${release.id === activeId ? "in service" : "replaced"}, ${formatDay(release.published_at)})`;
  const choose = (key: "from" | "to", value: string) => setParams({ from, to, [key]: value }, { replace: true });

  return (
    <section className="govsection catalogue__first" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="govsection__title">Compare two versions</h2>
      <p className="govsection__lead">
        What the second version adds, changes and removes against the first: systems, connections, domains, offerings,
        journeys, channels, sources and documents.
      </p>
      {releases.isError ? (
        <p className="docpage__failure" role="alert">
          {errorMessage(releases.error)}
          <button type="button" className="text-button" onClick={() => void releases.refetch()}>
            <RotateCw size={14} aria-hidden="true" />
            Try again
          </button>
        </p>
      ) : releases.isPending ? (
        <p className="timetable__quiet">Reading the versions…</p>
      ) : (
        <>
          <div className="compare__pick">
            <label className="field" htmlFor={`${id}-from`}>
              <span className="field__label">From</span>
              <select id={`${id}-from`} className="field__input form__select" value={from}
                onChange={(event) => choose("from", event.target.value)}>
                {ordered.map((release) => <option key={release.id} value={release.id}>{describe(release)}</option>)}
              </select>
            </label>
            <button
              type="button"
              className="text-button compare__swap"
              onClick={() => setParams({ from: to, to: from }, { replace: true })}
            >
              <ArrowLeftRight size={14} aria-hidden="true" />
              Swap
            </button>
            <label className="field" htmlFor={`${id}-to`}>
              <span className="field__label">To</span>
              <select id={`${id}-to`} className="field__input form__select" value={to}
                onChange={(event) => choose("to", event.target.value)}>
                {ordered.map((release) => <option key={release.id} value={release.id}>{describe(release)}</option>)}
              </select>
            </label>
          </div>
          {from === to ? (
            <p className="timetable__quiet">Choose two different versions.</p>
          ) : !toRelease || !fromRelease ? (
            <p className="timetable__quiet">One of these versions no longer exists. Choose another.</p>
          ) : diff.isPending ? (
            <p className="timetable__quiet" role="status">Comparing…</p>
          ) : diff.isError ? (
            <p className="docpage__failure" role="alert">
              {errorMessage(diff.error)}
              <button type="button" className="text-button" onClick={() => void diff.refetch()}>
                <RotateCw size={14} aria-hidden="true" />
                Try again
              </button>
            </p>
          ) : (
            <DiffTable
              diff={diff.data}
              caption={`What ‘${name(toRelease)}’ changes against ‘${name(fromRelease)}’`}
              release={toRelease}
              systemLink={(key) =>
                toRelease.systems.some((system) => system.id === key)
                  ? `${to === activeId ? "/architecture" : `/architecture/versions/${encodeURIComponent(to)}`}/systems/${encodeURIComponent(key)}`
                  : null}
            />
          )}
        </>
      )}
      <p className="compare__back">
        <Link to="/architecture/versions">Back to every version</Link>
      </p>
    </section>
  );
}

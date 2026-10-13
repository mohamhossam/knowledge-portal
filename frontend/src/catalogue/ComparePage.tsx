import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, RotateCw } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { api, type Release } from "../api/client";
import { errorMessage } from "../api/errors";
import { Button, Section, Select, Skeleton, Status } from "../design/components";
import { formatDay } from "../home/format";
import { RouterLink } from "../shell/links";
import { ChangeTable } from "./draft/ChangeTable";
import { useCatalogueContext, useReleases } from "./useCatalogue";

/** Newest first: the draft, then published versions by when they were published. */
function newestFirst(releases: Release[]): Release[] {
  return [...releases].sort((a, b) => {
    if (a.status !== b.status) return a.status === "draft" ? -1 : 1;
    return (b.published_at ?? "").localeCompare(a.published_at ?? "");
  });
}

/** A failure said with the way to try again beside it. */
function Failure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <p className="cat-inline" role="alert">
      <Status tone="attention">{errorMessage(error)}</Status>
      <Button variant="tertiary" icon={<RotateCw size={14} />} onClick={onRetry}>Try again</Button>
    </p>
  );
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
  const options = ordered.map((release) => <option key={release.id} value={release.id}>{describe(release)}</option>);

  return (
    <Section title="Compare two versions">
      <p className="cat-lead">
        What the second version adds, changes and removes against the first: systems, connections, domains, offerings,
        journeys, channels, sources and documents.
      </p>
      {releases.isError ? (
        <Failure error={releases.error} onRetry={() => void releases.refetch()} />
      ) : releases.isPending ? (
        <Skeleton label="Reading the versions" rows={3} />
      ) : (
        <>
          <div className="cat-compare">
            <Select label="From" value={from} onChange={(event) => choose("from", event.target.value)}>{options}</Select>
            <Button variant="tertiary" icon={<ArrowLeftRight size={14} />} onClick={() => setParams({ from: to, to: from }, { replace: true })}>
              Swap
            </Button>
            <Select label="To" value={to} onChange={(event) => choose("to", event.target.value)}>{options}</Select>
          </div>
          {from === to ? (
            <p className="cat-quiet">Choose two different versions.</p>
          ) : !toRelease || !fromRelease ? (
            <p className="cat-quiet">One of these versions no longer exists. Choose another.</p>
          ) : diff.isPending ? (
            <Skeleton label="Comparing" rows={4} />
          ) : diff.isError ? (
            <Failure error={diff.error} onRetry={() => void diff.refetch()} />
          ) : (
            <ChangeTable
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
      <p className="cat-lead">
        <RouterLink href="/architecture/versions">Back to every version</RouterLink>
      </p>
    </Section>
  );
}

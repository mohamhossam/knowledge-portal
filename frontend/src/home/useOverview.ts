import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { api, type CatalogueSuggestions } from "../api/client";
import { architectureOverview, libraryOverview, nameDirectory, squadOverview, type Overview } from "./derive";

export type TableState =
  | { status: "loading" }
  | { status: "error"; error: unknown; retry: () => void }
  | { status: "ready"; overview: Overview };

export type OverviewState = {
  library: TableState;
  architecture: TableState;
  squads: TableState;
  /** When the oldest answer on the page was fetched: the page is valid as of then. */
  validAt: Date | null;
  refreshing: boolean;
  refresh: () => void;
};

/** Everything the home's three tables read, fetched together and derived. */
export function useOverview(): OverviewState {
  const documents = useQuery({ queryKey: ["library", "documents"], queryFn: api.libraryDocuments });
  const releases = useQuery({ queryKey: ["architecture", "releases"], queryFn: api.releases });
  const active = useQuery({ queryKey: ["architecture", "active"], queryFn: api.activeRelease });
  const organisation = useQuery({ queryKey: ["organisation"], queryFn: api.organisation });
  const audit = useQuery({ queryKey: ["organisation", "audit"], queryFn: api.organisationAudit });
  const actors = useQuery({ queryKey: ["identity", "actors"], queryFn: api.knownActors });
  const drafts = (releases.data ?? []).filter((release) => release.status === "draft");
  const suggestions = useQueries({
    queries: drafts.map((draft) => ({
      queryKey: ["architecture", "releases", draft.id, "suggestions"],
      queryFn: () => api.suggestions(draft.id),
    })),
  });

  const all = [documents, releases, active, organisation, audit, actors, ...suggestions];
  const fetchedAt = all.map((query) => query.dataUpdatedAt).filter((at) => at > 0);
  const nameOf = useMemo(() => nameDirectory(actors.data), [actors.data]);

  const library: TableState = documents.isError
    ? { status: "error", error: documents.error, retry: () => void documents.refetch() }
    : documents.data
      ? { status: "ready", overview: libraryOverview(documents.data) }
      : { status: "loading" };

  const architectureQueries = [releases, active, ...suggestions];
  const architectureFailure = architectureQueries.find((query) => query.isError);
  const architecture: TableState = architectureFailure
    ? { status: "error", error: architectureFailure.error, retry: () => architectureQueries.forEach((query) => void query.refetch()) }
    : releases.data && active.isSuccess && suggestions.every((query) => query.isSuccess) && !actors.isPending
      ? {
          status: "ready",
          overview: architectureOverview(
            releases.data,
            active.data ?? null,
            new Map(drafts.map((draft, index) => [draft.id, suggestions[index]?.data as CatalogueSuggestions])),
            nameOf,
          ),
        }
      : { status: "loading" };

  const squadQueries = [organisation, audit, active];
  const squadFailure = squadQueries.find((query) => query.isError);
  const squads: TableState = squadFailure
    ? { status: "error", error: squadFailure.error, retry: () => squadQueries.forEach((query) => void query.refetch()) }
    : organisation.data && audit.data && active.isSuccess && !actors.isPending
      ? { status: "ready", overview: squadOverview(organisation.data, active.data ?? null, audit.data, nameOf) }
      : { status: "loading" };

  return {
    library,
    architecture,
    squads,
    validAt: fetchedAt.length > 0 ? new Date(Math.min(...fetchedAt)) : null,
    refreshing: all.some((query) => query.isFetching),
    refresh: () => all.forEach((query) => void query.refetch()),
  };
}

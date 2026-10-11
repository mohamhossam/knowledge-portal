import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { api, type CatalogueSuggestions } from "../api/client";
import { useAuth } from "../auth/authContext";
import { REQUIREMENT_APP_URL } from "../auth/paths";
import { SYSTEM_REVIEWS_KEY } from "../reviews/review";
import {
  architectureOverview,
  libraryOverview,
  nameDirectory,
  requirementOverview,
  squadOverview,
  type DraftJobs,
  type Overview,
} from "./derive";

export type TableState =
  | { status: "loading" }
  | { status: "error"; error: unknown; retry: () => void }
  | { status: "ready"; overview: Overview };

export type OverviewState = {
  library: TableState;
  architecture: TableState;
  squads: TableState;
  requirements: TableState;
  /** When the oldest answer on the page was fetched: the page is valid as of then. */
  validAt: Date | null;
  refreshing: boolean;
  refresh: () => void;
};

/** Everything the home's four tables read, fetched together and derived. */
export function useOverview(): OverviewState {
  // Builds and readings are a maintainer's to see; for anyone else Table 2 shows no failures.
  const maintainer = useAuth()?.actor?.roles?.includes("knowledge_maintainer") ?? false;
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

  const builds = useQueries({
    queries: (maintainer ? drafts : []).map((draft) => ({
      queryKey: ["architecture", "releases", draft.id, "build"],
      queryFn: () => api.buildJob(draft.id),
    })),
  });
  const readings = useQueries({
    queries: (maintainer ? drafts : []).map((draft) => ({
      queryKey: ["architecture", "releases", draft.id, "extractions"],
      queryFn: () => api.extractions(draft.id),
    })),
  });
  const corpus = useQuery({ queryKey: ["knowledge-center", "requirement-corpus"], queryFn: api.requirementCorpus });
  // Historic Requirements are this portal's own; their counts sit beside the corpus on Table 4.
  const historic = useQuery({
    queryKey: ["historic", "list", "counts"],
    queryFn: async () => (await api.historicList({})).counts,
  });
  // Where each system in service stands for review; nothing to read until a version is in service.
  const standings = useQuery({ queryKey: SYSTEM_REVIEWS_KEY, queryFn: api.systemReviews, enabled: Boolean(active.data) });
  // How reviewers decided suggested verdicts (ontology plan Phase 5): a maintainer's to see.
  const precedents = useQuery({
    queryKey: ["architecture", "precedents", "summary"],
    queryFn: api.precedentSummary,
    enabled: maintainer && Boolean(active.data),
  });
  // Left out for anyone else, so a refresh never asks for what they may not read. It never
  // holds Table 2 back: until it answers, or if it fails, the table shows no decision counts.
  const precedentQueries = maintainer ? [precedents] : [];

  const all = [documents, releases, active, organisation, audit, actors, corpus, historic, standings, ...precedentQueries, ...suggestions, ...builds, ...readings];
  const fetchedAt = all.map((query) => query.dataUpdatedAt).filter((at) => at > 0);
  const nameOf = useMemo(() => nameDirectory(actors.data), [actors.data]);

  const library: TableState = documents.isError
    ? { status: "error", error: documents.error, retry: () => void documents.refetch() }
    : documents.data
      ? { status: "ready", overview: libraryOverview(documents.data) }
      : { status: "loading" };

  const architectureQueries = [releases, active, standings, ...suggestions, ...builds, ...readings];
  const jobs: Map<string, DraftJobs> | null = maintainer
    ? new Map(drafts.map((draft, index) => [
        draft.id,
        { build: builds[index]?.data ?? null, extractions: readings[index]?.data ?? [] },
      ]))
    : null;
  const architectureFailure = architectureQueries.find((query) => query.isError);
  const architecture: TableState = architectureFailure
    ? { status: "error", error: architectureFailure.error, retry: () => architectureQueries.forEach((query) => void query.refetch()) }
    : releases.data && active.isSuccess && [...suggestions, ...builds, ...readings].every((query) => query.isSuccess) && !actors.isPending
        && (!active.data || standings.isSuccess)
      ? {
          status: "ready",
          overview: architectureOverview(
            releases.data,
            active.data ?? null,
            new Map(drafts.map((draft, index) => [draft.id, suggestions[index]?.data as CatalogueSuggestions])),
            nameOf,
            jobs,
            standings.data ?? null,
            precedents.data?.releases.find((item) => item.release_id === active.data?.id) ?? null,
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

  const requirements: TableState = corpus.isError
    ? { status: "error", error: corpus.error, retry: () => void corpus.refetch() }
    : corpus.data
      ? { status: "ready", overview: requirementOverview(corpus.data, REQUIREMENT_APP_URL, historic.data ?? null) }
      : { status: "loading" };

  return {
    library,
    architecture,
    squads,
    requirements,
    validAt: fetchedAt.length > 0 ? new Date(Math.min(...fetchedAt)) : null,
    refreshing: all.some((query) => query.isFetching),
    refresh: () => all.forEach((query) => void query.refetch()),
  };
}

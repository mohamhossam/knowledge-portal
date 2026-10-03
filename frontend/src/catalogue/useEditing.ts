import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { api, type CatalogueSystem, type DraftUpdate, type Release, type SampleRequirement } from "../api/client";
import { withoutSystem } from "./drafting";

const releaseKey = (releaseId: string) => ["architecture", "releases", releaseId] as const;

/**
 * Every hand change to a draft. Each save carries the draft's revision and
 * returns the next one; a conflict (409) leaves the page to offer a reload.
 */
export function useEditing(release: Release) {
  const queryClient = useQueryClient();
  const settle = useCallback(
    (next: Release) => {
      queryClient.setQueryData(releaseKey(release.id), next);
      void queryClient.invalidateQueries({ queryKey: ["architecture"] });
    },
    [queryClient, release.id],
  );

  const saveSystem = useMutation({
    mutationFn: (system: CatalogueSystem) =>
      api.saveSystem(release.id, system.id, { expected_revision: release.revision, system }),
    onSuccess: settle,
  });
  const removeSystem = useMutation({
    mutationFn: (systemId: string) => api.saveDraft(release.id, withoutSystem(release, systemId)),
    onSuccess: settle,
  });
  const saveDraft = useMutation({
    mutationFn: (body: DraftUpdate) => api.saveDraft(release.id, body),
    onSuccess: settle,
  });
  return { saveSystem, removeSystem, saveDraft };
}

export type Editing = ReturnType<typeof useEditing>;

/** The draft's build for matching, checked every few seconds while it runs. */
export function useBuild(release: Release) {
  const queryClient = useQueryClient();
  const job = useQuery({
    queryKey: ["architecture", "releases", release.id, "build"],
    queryFn: () => api.buildJob(release.id),
    refetchInterval: (query) => (query.state.data?.status === "queued" || query.state.data?.status === "running" ? 2000 : false),
  });
  const start = useMutation({
    mutationFn: () => api.buildRelease(release.id, release.revision),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["architecture"] }),
  });
  const retry = useMutation({
    mutationFn: (jobId: string) => api.retryJob(jobId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["architecture"] }),
  });
  return { job, start, retry };
}

/** The team's sample requirements, one list for every draft. */
export function useSamples() {
  const queryClient = useQueryClient();
  const samples = useQuery({ queryKey: ["architecture", "samples"], queryFn: api.samples });
  const save = useMutation({
    mutationFn: (items: SampleRequirement[]) => api.saveSamples({ expected_revision: samples.data?.revision ?? 0, items }),
    onSuccess: (next) => queryClient.setQueryData(["architecture", "samples"], next),
  });
  return { samples, save };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Publishing; building first and waiting for it when the draft is not built at its revision. */
export function usePublish(release: Release) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rationale, buildFirst }: { rationale: string; buildFirst: boolean }) => {
      if (buildFirst) {
        let job = await api.buildRelease(release.id, release.revision);
        for (let tries = 0; job.status === "queued" || job.status === "running"; tries += 1) {
          if (tries > 300) throw new Error("The build is taking longer than ten minutes; publish from here once it is built.");
          await wait(2000);
          job = (await api.buildJob(release.id)) ?? job;
        }
        if (job.status !== "succeeded") throw new Error("The build failed, so the draft was not published. Try the build again on Check.");
      }
      return api.publish(release.id, { expected_revision: release.revision, rationale });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["architecture"] }),
  });
}

/** The catalogue file: what it would change, then replacing the draft's content with it. */
export function useCatalogueFile(release: Release) {
  const queryClient = useQueryClient();
  const preview = useMutation({ mutationFn: (file: File) => api.previewCatalogueFile(release.id, file) });
  const replace = useMutation({
    mutationFn: (file: File) => api.importCatalogueFile(release.id, file, release.revision),
    onSuccess: (next) => {
      queryClient.setQueryData(releaseKey(release.id), next);
      void queryClient.invalidateQueries({ queryKey: ["architecture"] });
    },
  });
  return { preview, replace };
}

/** Saves a blob under a name, the way a link would. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

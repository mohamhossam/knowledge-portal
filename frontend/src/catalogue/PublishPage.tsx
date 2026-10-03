import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, type Release } from "../api/client";
import { errorMessage } from "../api/errors";
import { count } from "../home/format";
import { changeSentence } from "./catalogue";
import { BUILD_STATE, buildState } from "./drafting";
import { useCatalogueContext, useMappingImpact } from "./useCatalogue";
import { useBuild, usePublish } from "./useEditing";

/**
 * Putting a draft in service: the consequence first, whether it is built, then
 * a reason and the one action. Publishing builds first when it must.
 */
export function PublishPage() {
  const { book } = useCatalogueContext();
  if (book.release.status !== "draft") {
    return <p className="timetable__quiet catalogue__first">This version is already published.</p>;
  }
  return <Publish release={book.release} />;
}

function Publish({ release }: { release: Release }) {
  const id = useId();
  const { base } = useCatalogueContext();
  const navigate = useNavigate();
  const build = useBuild(release);
  const publish = usePublish(release);
  const impact = useMappingImpact();
  const changes = useQuery({
    queryKey: ["architecture", "releases", release.id, "changes", release.revision],
    queryFn: () => api.releaseChanges(release.id),
  });
  const pending = useQuery({ queryKey: ["architecture", "releases", release.id, "suggestions"], queryFn: () => api.suggestions(release.id) });
  const [reason, setReason] = useState("");
  const state = buildState(release, build.job.data);
  const name = release.name || "Untitled version";
  const sentence = changes.data ? changeSentence(changes.data) : null;
  const mapped = impact.data ? impact.data.requirements - impact.data.outdated_requirements : null;
  const waiting = (pending.data?.suggestions ?? []).filter((item) => item.status === "proposed").length;
  const buildFirst = state !== "built";
  const waits = state === "building"
    ? "The draft is being built; publish once it is done."
    : !reason.trim() ? "Say what you checked; it is kept in the version's history." : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (waits) return;
    // The page becomes "already published" as soon as the draft is; the promise still lands.
    publish
      .mutateAsync({ rationale: reason.trim(), buildFirst })
      .then(() => navigate("/architecture", { state: { notice: `‘${name}’ is in service.` } }))
      .catch(() => undefined);
  };

  return (
    <form className="govsection catalogue__first publish" aria-labelledby={`${id}-title`} onSubmit={submit}>
      <h2 id={`${id}-title`} className="govsection__title">Publish ‘<span dir="auto">{name}</span>’</h2>
      <div className="publish__consequence">
        <p>
          Publishing puts it in service at once: requirement work maps against it from its next look at the catalogue.
          {sentence ? <> Against the version in service, it would {sentence}.</> : changes.data ? " Its contents match the version in service." : null}{" "}
          <Link to={`${base}/changes`}>See every change</Link>
        </p>
        {mapped !== null && (
          <p>
            {mapped
              ? <><strong>{count(mapped, "requirement")}</strong> mapped with the version in service will then show as mapped with an earlier version, for their owners to map again.</>
              : "No requirement has been mapped with the version in service yet."}
          </p>
        )}
        {waiting > 0 && (
          <p>
            <strong>{count(waiting, "suggestion")}</strong> from its documents {waiting === 1 ? "waits" : "wait"} undecided; publishing leaves{" "}
            {waiting === 1 ? "it" : "them"} out. <Link to={`${base}/sources`}>Decide them first</Link>
          </p>
        )}
      </div>

      <p className="build-state">
        <span className="status">{BUILD_STATE[state]}</span>
        <span className="secondary">
          {state === "built"
            ? ` at revision ${release.revision}.`
            : state === "building"
              ? "; publish once the build is done."
              : " at this revision; publishing builds it first, which can take a few minutes."}{" "}
          <Link to={`${base}/check`}>Check the samples</Link>
        </span>
      </p>

      <label className="field publish__reason" htmlFor={`${id}-reason`}>
        <span className="field__label">What did you check?</span>
        <textarea
          id={`${id}-reason`}
          className="field__input field__input--text"
          rows={3}
          maxLength={2000}
          dir="auto"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {publish.isError && <p className="docpage__failure" role="alert">{errorMessage(publish.error)}</p>}
      <p className="govsection__actions">
        <button type="submit" className="action-button" disabled={!!waits || publish.isPending} aria-describedby={waits ? `${id}-waits` : undefined}>
          {publish.isPending ? (buildFirst ? "Building, then publishing…" : "Publishing…") : buildFirst ? "Build it, then publish" : "Publish it"}
        </button>
      </p>
      {waits && <p id={`${id}-waits`} className="versions__waits">{waits}</p>}
    </form>
  );
}

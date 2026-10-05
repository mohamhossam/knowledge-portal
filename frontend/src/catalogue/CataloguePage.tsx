import { useQuery } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { Link, Outlet, useLocation, useParams } from "react-router-dom";

import { api, type Release } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { count, formatDay } from "../home/format";
import { changeSentence, contents } from "./catalogue";
import { DraftActions } from "./DraftActions";
import { type CatalogueContext, useActorNames, useMappingImpact, useRelease } from "./useCatalogue";

/**
 * Table 2, the architecture catalogue: the version in service, or any other
 * version read the same way, with its pages under one head.
 */
export function CataloguePage() {
  const { releaseId } = useParams();
  const { query, book, activeId } = useRelease(releaseId);
  const actorName = useActorNames();
  const base = releaseId === undefined ? "/architecture" : `/architecture/versions/${encodeURIComponent(releaseId)}`;
  const inService = releaseId === undefined || (activeId !== undefined && releaseId === activeId);

  useEffect(() => {
    const name = releaseId !== undefined && query.data?.name ? `${query.data.name} · ` : "";
    document.title = `${name}Architecture catalogue · Knowledge portal`;
  }, [releaseId, query.data?.name]);

  const head = (edition: ReactNode, pages = false) => (
    <header className="docpage__head">
      <p className="docpage__number" aria-hidden="true">2</p>
      <div className="docpage__heading">
        <h1 id="catalogue-title" className="docpage__title">
          <span className="visually-hidden">Table 2:</span> Architecture catalogue
        </h1>
        {edition}
        {pages && book && <SubIndex base={base} inService={inService} draft={book.release.status === "draft"} />}
      </div>
    </header>
  );

  if (query.isPending) {
    return (
      <section className="docpage" aria-labelledby="catalogue-title" aria-busy="true">
        {head(<p className="docpage__edition">Opening the catalogue…</p>)}
      </section>
    );
  }
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <section className="docpage" aria-labelledby="catalogue-title">
        {head(null)}
        <p className="docpage__failure" role="alert">
          {missing ? "There is no catalogue version at this address." : errorMessage(query.error)}
          {missing ? (
            <Link to="/architecture/versions">See every version</Link>
          ) : (
            <button type="button" className="text-button" onClick={() => void query.refetch()}>
              <RotateCw size={14} aria-hidden="true" />
              Try again
            </button>
          )}
        </p>
      </section>
    );
  }
  if (!book) {
    return (
      <section className="docpage" aria-labelledby="catalogue-title">
        {head(<p className="docpage__edition">No catalogue version is in service yet.</p>)}
      </section>
    );
  }

  const context: CatalogueContext = { book, base, inService, actorName, editable: book.release.status === "draft" };
  return (
    <section className="docpage catalogue" aria-labelledby="catalogue-title">
      {head(
        <>
          <p className="docpage__edition">
            <Edition release={book.release} inService={inService} actorName={actorName} />
          </p>
          {inService ? <MappedEarlier /> : <Consequence release={book.release} />}
          {book.release.status === "draft" && <DraftActions key={book.release.id} release={book.release} />}
        </>,
        true,
      )}
      <Outlet context={context} />
    </section>
  );
}

function Edition({ release, inService, actorName }: {
  release: Release;
  inService: boolean;
  actorName: CatalogueContext["actorName"];
}) {
  const name = release.name || "Untitled version";
  const holds = contents(release);
  const tally = `${count(holds.systems, "system")}, ${count(holds.connections, "connection")}.`;
  if (release.status === "draft") {
    return (
      <>
        In preparation: <strong dir="auto">‘{name}’</strong>, started by {actorName(release.created_by)}; not yet published.
        {" "}{tally} <Link to="/architecture">Read the version in service</Link>
      </>
    );
  }
  const published = `published by ${actorName(release.published_by)} on ${formatDay(release.published_at)}`;
  if (inService) {
    return <>In service: <strong dir="auto">‘{name}’</strong>, {published}. {tally}</>;
  }
  return (
    <>
      Replaced: <strong dir="auto">‘{name}’</strong>, {published}; no longer in service. {tally}{" "}
      <Link to="/architecture">Read the version in service</Link>
    </>
  );
}

/** Requirement work still mapped with an earlier version, when there is any. */
function MappedEarlier() {
  const impact = useMappingImpact();
  const outdated = impact.data?.outdated_requirements ?? 0;
  if (!outdated) return null;
  return (
    <p className="docpage__version">
      <strong className="catalogue__due">{count(outdated, "requirement")} still mapped with an earlier version.</strong>
    </p>
  );
}

/** Shown on any other version: what putting it in service would change. */
function Consequence({ release }: { release: Release }) {
  const changes = useQuery({
    queryKey: ["architecture", "releases", release.id, "changes", release.revision],
    queryFn: () => api.releaseChanges(release.id),
  });
  if (!changes.data) return null;
  const sentence = changeSentence(changes.data);
  const verb = release.status === "draft" ? "Publishing it" : "Putting it back in service";
  return (
    <p className="docpage__version">
      {sentence ? `${verb} would ${sentence}.` : "Its contents match the version in service."}
    </p>
  );
}

function SubIndex({ base, inService, draft }: { base: string; inService: boolean; draft: boolean }) {
  const { pathname } = useLocation();
  const pages = [
    { label: "Systems", to: base, current: pathname === base || pathname.startsWith(`${base}/systems`) },
    { label: "Domains", to: `${base}/domains`, current: pathname.startsWith(`${base}/domains`) },
    { label: "Channels", to: `${base}/channels`, current: pathname.startsWith(`${base}/channels`) },
    { label: "Offerings", to: `${base}/offerings`, current: pathname.startsWith(`${base}/offerings`) },
    { label: "Journeys", to: `${base}/journeys`, current: pathname.startsWith(`${base}/journeys`) },
    // The explorer reads the version in service only.
    ...(inService ? [{ label: "Explorer", to: "/explorer", current: false }] : []),
    ...(draft
      ? [
          { label: "Sources", to: `${base}/sources`, current: pathname.startsWith(`${base}/sources`) },
          { label: "Changes", to: `${base}/changes`, current: pathname.startsWith(`${base}/changes`) },
          { label: "Check", to: `${base}/check`, current: pathname.startsWith(`${base}/check`) || pathname.startsWith(`${base}/evidence`) },
          { label: "Publish", to: `${base}/publish`, current: pathname.startsWith(`${base}/publish`) },
        ]
      : []),
    {
      label: inService ? "Versions" : "All versions",
      to: "/architecture/versions",
      current: pathname === "/architecture/versions",
    },
  ];
  return (
    <nav className="subindex" aria-label="This catalogue">
      <ul className="subindex__list">
        {pages.map((page) => (
          <li key={page.label}>
            <Link to={page.to} className="subindex__link" aria-current={page.current ? "page" : undefined}>
              {page.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

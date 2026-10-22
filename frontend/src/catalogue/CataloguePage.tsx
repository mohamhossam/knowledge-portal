import "./frame/catalogue.css";

import { Outlet, useLocation, useParams } from "react-router-dom";

import { ApiError, errorMessage } from "../api/errors";
import { ActionGroup, Button, EmptyState, PageHeader, Skeleton } from "../design/components";
import { ButtonLink } from "../shell/links";
import { DraftFrame } from "./draft/DraftFrame";
import { draftStepOf } from "./draft/progress";
import { sourceRegister, SourcesContext } from "./governance";
import { type CatalogueContext, useActorNames, useRelease } from "./useCatalogue";

/**
 * Table 2, the architecture catalogue: the version in service, or any other
 * version read the same way. This frame opens the version; each page draws its
 * own head (CatalogueHeader), so a record page can be titled by its record.
 */
export function CataloguePage() {
  const { releaseId } = useParams();
  const { query, book, activeId } = useRelease(releaseId);
  const actorName = useActorNames();
  const base = releaseId === undefined ? "/architecture" : `/architecture/versions/${encodeURIComponent(releaseId)}`;
  const inService = releaseId === undefined || (activeId !== undefined && releaseId === activeId);
  // A draft's steps (Sources, Decide, Changes, Check, Publish) have their own frame.
  const step = draftStepOf(useLocation().pathname, base);

  if (step) return <DraftFrame step={step} query={query} book={book} base={base} inService={inService} actorName={actorName} />;

  if (query.isPending) {
    return (
      <div className="cat">
        <PageHeader title="Architecture catalogue" documentTitle="Architecture catalogue" />
        <Skeleton label="Opening the catalogue" rows={8} />
      </div>
    );
  }
  if (query.isError || !book) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="cat">
        <PageHeader
          title={missing ? "There is no catalogue version here" : query.isError ? "Couldn't open the catalogue" : "No catalogue version is in service yet"}
          documentTitle="Architecture catalogue"
        />
        <EmptyState
          title={
            missing
              ? "It may have been removed, or the address is wrong."
              : query.isError
                ? `The knowledge service didn't answer: ${errorMessage(query.error)}`
                : "Start a draft from Versions, and publish it to put it in service."
          }
          action={
            <ActionGroup>
              {query.isError && !missing && <Button onClick={() => void query.refetch()}>Try again</Button>}
              <ButtonLink to="/architecture/versions">See every version</ButtonLink>
            </ActionGroup>
          }
        />
      </div>
    );
  }

  const context: CatalogueContext = { book, base, inService, actorName, editable: book.release.status === "draft" };
  const register = sourceRegister(book.release);
  return (
    <div className="cat">
      <SourcesContext.Provider value={register}>
        <Outlet context={context} />
      </SourcesContext.Provider>
    </div>
  );
}

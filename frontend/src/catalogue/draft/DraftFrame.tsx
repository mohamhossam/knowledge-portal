import "./draft.css";

import type { UseQueryResult } from "@tanstack/react-query";
import { type RefObject, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";

import type { Release } from "../../api/client";
import { ApiError, errorMessage } from "../../api/errors";
import {
  ActionGroup, Breadcrumbs, Button, ConsequencePanel, EmptyState, PageHeader, Skeleton, Status, Stepper, TextField,
} from "../../design/components";
import { useDisclosure } from "../../design/hooks";
import { count } from "../../home/format";
import { ButtonLink, RouterLink } from "../../shell/links";
import { type Catalogue, contents } from "../catalogue";
import { sourceRegister, SourcesContext } from "../governance";
import { type CatalogueContext, useReleases } from "../useCatalogue";
import { useDraftLifecycle } from "../useDraft";
import { DRAFT_STEPS, type DraftStep, draftSteps, useDraftProgress } from "./progress";

const nameOf = (release: Release) => release.name || "Untitled version";
const stepLabel = (step: DraftStep) => DRAFT_STEPS.find((item) => item.id === step)!.label;

/**
 * A draft's workflow (redesign phase 3): its head, the five steps it goes
 * through (Sources, Decide, Changes, Check, Publish) and the step open now.
 * Any step can be opened; the stepper says where each stands.
 */
export function DraftFrame({ step, query, book, base, inService, actorName }: {
  step: DraftStep;
  query: UseQueryResult<Release | null>;
  book: Catalogue | undefined;
  base: string;
  inService: boolean;
  actorName: CatalogueContext["actorName"];
}) {
  if (query.isPending) {
    return (
      <div className="draft">
        <PageHeader title="Catalogue draft" documentTitle={`${stepLabel(step)} · Catalogue draft`} />
        <Skeleton label="Opening the draft" rows={6} />
      </div>
    );
  }
  if (query.isError || !book) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="draft">
        <PageHeader title={missing ? "There is no catalogue version here" : book ? "Couldn't open this version" : "No catalogue version is in service yet"} />
        <EmptyState
          title={missing ? "It may have been removed, or the address is wrong." : query.isError ? `The knowledge service didn't answer: ${errorMessage(query.error)}` : "Start a draft from Versions."}
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
  const release = book.release;
  if (release.status !== "draft") return <NotADraft release={release} step={step} inService={inService} base={base} />;
  return <Draft release={release} step={step} context={{ book, base, inService, actorName, editable: true }} />;
}

function Draft({ release, step, context }: { release: Release; step: DraftStep; context: CatalogueContext }) {
  const { base, actorName } = context;
  const progress = useDraftProgress(release);
  const renaming = useDisclosure();
  const removing = useDisclosure();
  const name = nameOf(release);
  const holds = contents(release);
  return (
    <div className="draft">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            link={RouterLink}
            items={[{ href: "/architecture", label: "Catalogue" }, { href: "/architecture/versions", label: "Versions" }, { label: name }]}
          />
        }
        title={<bdi>{name}</bdi>}
        documentTitle={`${stepLabel(step)} · ${name} · Catalogue draft`}
        lead="A draft of the architecture catalogue. Nothing in it is in service until it is published."
        meta={
          <>
            <Status tone="working">In preparation</Status>
            <span>Started by <bdi>{actorName(release.created_by)}</bdi></span>
            <span>{count(holds.systems, "system")}, {count(holds.connections, "connection")}</span>
            <RouterLink href={base}>Read its contents</RouterLink>
          </>
        }
        actions={
          <ActionGroup label="This draft">
            <Button aria-expanded={renaming.open} onClick={(event) => (renaming.open ? renaming.close() : renaming.show(event))}>Rename…</Button>
            <Button aria-expanded={removing.open} onClick={(event) => (removing.open ? removing.close() : removing.show(event))}>Remove the draft…</Button>
          </ActionGroup>
        }
      >
        <Stepper label="Steps of this draft" link={RouterLink} steps={draftSteps(base, step, progress)} />
      </PageHeader>
      {renaming.open && <Rename release={release} panelRef={renaming.panel} onDone={renaming.close} />}
      {removing.open && <Remove release={release} panelRef={removing.panel} onKeep={removing.close} />}
      <SourcesContext.Provider value={sourceRegister(release)}>
        <Outlet context={context} />
      </SourcesContext.Provider>
    </div>
  );
}

function Rename({ release, panelRef, onDone }: { release: Release; panelRef: RefObject<HTMLElement | null>; onDone: () => void }) {
  const { rename } = useDraftLifecycle();
  const [name, setName] = useState(release.name ?? "");
  const [tried, setTried] = useState(false);
  const problem = !name.trim() ? "Give the version a name." : null;
  return (
    <form
      ref={panelRef as RefObject<HTMLFormElement>}
      className="draft-panel"
      aria-label="Rename the draft"
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if (problem) return;
        if (name.trim() === release.name) onDone();
        else rename.mutate({ release, name: name.trim() }, { onSuccess: onDone });
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onDone();
      }}
    >
      <TextField
        label="Name of the draft"
        maxLength={80}
        value={name}
        error={tried ? problem : null}
        onChange={(event) => setName(event.target.value)}
      />
      {rename.isError && <p role="status"><Status tone="attention">{errorMessage(rename.error)}</Status></p>}
      <ActionGroup>
        <Button type="submit" variant="primary" busy={rename.isPending}>{rename.isPending ? "Renaming…" : "Rename it"}</Button>
        <Button onClick={onDone}>Keep the name</Button>
      </ActionGroup>
    </form>
  );
}

function Remove({ release, panelRef, onKeep }: { release: Release; panelRef: RefObject<HTMLElement | null>; onKeep: () => void }) {
  const navigate = useNavigate();
  const { discard } = useDraftLifecycle();
  const name = nameOf(release);
  return (
    <ConsequencePanel
      panelRef={panelRef}
      tone="danger"
      title={<>Remove the draft <bdi>‘{name}’</bdi></>}
      happens="The draft and everything decided in it go: its documents, their suggestions accepted and rejected alike, and its hand edits."
      affects={<p>The version in service doesn't change, and the draft was never in service.</p>}
      reversibility="It can't be brought back. To start again, start a new draft from Versions."
      confirmLabel="Remove the draft"
      busyLabel="Removing…"
      keepLabel="Keep it"
      busy={discard.isPending}
      failure={discard.isError ? errorMessage(discard.error) : null}
      onConfirm={() =>
        discard.mutate(release, {
          onSuccess: () => navigate("/architecture/versions", { state: { notice: `‘${name}’ was removed.` } }),
        })
      }
      onKeep={onKeep}
    />
  );
}

/** A step of a version that is not a draft: its work is history; the draft in progress, if any, is the way on. */
function NotADraft({ release, step, inService, base }: { release: Release; step: DraftStep; inService: boolean; base: string }) {
  const draft = useReleases().data?.find((item) => item.status === "draft");
  const name = nameOf(release);
  return (
    <div className="draft">
      <PageHeader
        title={<bdi>{name}</bdi>}
        documentTitle={`${stepLabel(step)} · ${name} · Catalogue`}
        meta={inService ? <Status tone="done">In service</Status> : <Status tone="stopped">Replaced</Status>}
      />
      <EmptyState
        title={`${stepLabel(step)} is a step of a draft; this version is published.`}
        action={
          <ActionGroup>
            {draft && (
              <ButtonLink to={`/architecture/versions/${encodeURIComponent(draft.id)}/${step}`} variant="primary">
                {stepLabel(step)} in the draft ‘{nameOf(draft)}’
              </ButtonLink>
            )}
            <ButtonLink to={base}>Read this version</ButtonLink>
          </ActionGroup>
        }
      >
        <p>Sources, decisions and checks belong to a version while it is prepared.</p>
      </EmptyState>
    </div>
  );
}

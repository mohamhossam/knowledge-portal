import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { errorMessage } from "../api/errors";
import { Button, EmptyState, FormPanel, PageHeader, Skeleton, TextField } from "../design/components";
import { useFocusAfterRender } from "../design/hooks";
import { ButtonLink } from "../shell/links";
import { useReleases } from "./useCatalogue";
import { useDraftLifecycle } from "./useDraft";

/**
 * On Versions, when no draft is in preparation: start the one draft, a copy of
 * the version in service, and go to its first step. The `first` version, with
 * none in service, starts empty.
 */
export function StartDraft({ onCancel, first = false }: { onCancel: () => void; first?: boolean }) {
  const navigate = useNavigate();
  const { create } = useDraftLifecycle();
  const [name, setName] = useState("");
  return (
    <FormPanel
      title={first ? "Start the first version" : "Start a new version"}
      submitLabel="Start it"
      busyLabel="Starting…"
      busy={create.isPending}
      problem={name.trim() ? null : "Give the new version a name."}
      failure={create.isError ? errorMessage(create.error) : null}
      onSubmit={() => create.mutate(name.trim(), { onSuccess: (release) => navigate(`/architecture/versions/${encodeURIComponent(release.id)}/sources`) })}
      onCancel={onCancel}
    >
      <p className="cat-lead">
        {first
          ? "The first version starts empty. Documents, a catalogue file or hand edits fill it; nothing reaches requirement work until it is published."
          : "A draft starts as a copy of the version in service. Documents, a catalogue file or hand edits change it; nothing reaches requirement work until it is published."}
      </p>
      <TextField
        label="Name"
        maxLength={80}
        // Opened by its own button ("Start a draft"), the name is where the person goes next.
        // eslint-disable-next-line jsx-a11y-x/no-autofocus
        autoFocus
        placeholder="For example: November integration update"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
    </FormPanel>
  );
}

/**
 * The catalogue before anything is in service (ADR-0126): the service starts
 * with no catalogue, so this is where the first version is started, or the
 * draft of it carried on.
 */
export function FirstVersion() {
  const releases = useReleases();
  const focusLater = useFocusAfterRender();
  const [starting, setStarting] = useState(false);
  const draft = releases.data?.find((release) => release.status === "draft");
  return (
    <div className="cat">
      <PageHeader title="No catalogue version is in service yet" documentTitle="Architecture catalogue" />
      {starting ? (
        <StartDraft
          first
          onCancel={() => {
            setStarting(false);
            focusLater(() => document.getElementById("first-version-start"));
          }}
        />
      ) : releases.isPending ? (
        <Skeleton label="Reading the versions" rows={3} />
      ) : (
        <EmptyState
          title={draft ? "The first version is in preparation." : "The catalogue starts empty."}
          action={
            releases.isError ? (
              <Button onClick={() => void releases.refetch()}>Try again</Button>
            ) : draft ? (
              <ButtonLink to={`/architecture/versions/${encodeURIComponent(draft.id)}/sources`} variant="primary">
                Carry on with ‘<bdi>{draft.name || "Untitled version"}</bdi>’
              </ButtonLink>
            ) : (
              <Button id="first-version-start" variant="primary" onClick={() => setStarting(true)}>Start the first version</Button>
            )
          }
        >
          {releases.isError ? (
            <p role="alert">The knowledge service didn't answer: {errorMessage(releases.error)}</p>
          ) : (
            <p>
              Build it from documents, a catalogue file or by hand, then publish it. Requirement work maps against the version in
              service, so it has nothing to map against until then.
            </p>
          )}
        </EmptyState>
      )}
    </div>
  );
}

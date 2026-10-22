import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { errorMessage } from "../api/errors";
import { FormPanel, TextField } from "../design/components";
import { useDraftLifecycle } from "./useDraft";

/**
 * On Versions, when no draft is in preparation: start the one draft, a copy of
 * the version in service, and go to its first step.
 */
export function StartDraft({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  const { create } = useDraftLifecycle();
  const [name, setName] = useState("");
  return (
    <FormPanel
      title="Start a new version"
      submitLabel="Start it"
      busyLabel="Starting…"
      busy={create.isPending}
      problem={name.trim() ? null : "Give the new version a name."}
      failure={create.isError ? errorMessage(create.error) : null}
      onSubmit={() => create.mutate(name.trim(), { onSuccess: (release) => navigate(`/architecture/versions/${encodeURIComponent(release.id)}/sources`) })}
      onCancel={onCancel}
    >
      <p className="cat-lead">
        A draft starts as a copy of the version in service. Documents, a catalogue file or hand edits change it; nothing reaches
        requirement work until it is published.
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

import { ArrowRight } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { Release } from "../api/client";
import { errorMessage } from "../api/errors";
import { useDraftLifecycle } from "./useDraft";

/** On Versions: start the one draft, or carry on with it. */
export function StartDraft({ draft }: { draft: Release | undefined }) {
  const id = useId();
  const navigate = useNavigate();
  const { create } = useDraftLifecycle();
  const [name, setName] = useState("");
  if (draft) {
    return (
      <p className="timetable__next">
        <Link to={`/architecture/versions/${encodeURIComponent(draft.id)}/sources`}>
          Carry on with ‘<span dir="auto">{draft.name || "Untitled version"}</span>’
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </p>
    );
  }
  const waits = name.trim() ? null : "Give the new version a name.";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (waits) return;
    create.mutate(name.trim(), {
      onSuccess: (release) => navigate(`/architecture/versions/${encodeURIComponent(release.id)}/sources`),
    });
  };
  return (
    <form className="add documents__add" aria-labelledby={`${id}-title`} onSubmit={submit}>
      <h3 id={`${id}-title`} className="add__title">Start a new version</h3>
      <p className="add__lead">
        A draft starts as a copy of the version in service. Documents, a catalogue file or hand edits change it; nothing reaches
        requirement work until it is published.
      </p>
      <label className="field" htmlFor={`${id}-name`}>
        <span className="field__label">Name</span>
        <input
          id={`${id}-name`}
          className="field__input"
          dir="auto"
          maxLength={80}
          placeholder="For example: November integration update"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {create.isError && <p className="docpage__failure" role="alert">{errorMessage(create.error)}</p>}
      <p className="add__actions">
        <button type="submit" className="action-button" disabled={!!waits || create.isPending} aria-describedby={waits ? `${id}-waits` : undefined}>
          {create.isPending ? "Starting…" : "Start it"}
        </button>
      </p>
      {waits && <p id={`${id}-waits`} className="versions__waits">{waits}</p>}
    </form>
  );
}

import { ArrowRight } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { Release } from "../api/client";
import { errorMessage } from "../api/errors";
import { useDraftLifecycle } from "./useDraft";

/** Under a draft's head: rename it, or remove it, each an inline step, never a modal. */
export function DraftActions({ release }: { release: Release }) {
  const [step, setStep] = useState<"rename" | "remove" | null>(null);
  return (
    <>
      <p className="docpage__actions">
        <button type="button" className="text-button" aria-expanded={step === "rename"} onClick={() => setStep(step === "rename" ? null : "rename")}>
          Rename it
        </button>
        <button type="button" className="text-button" aria-expanded={step === "remove"} onClick={() => setStep(step === "remove" ? null : "remove")}>
          Remove this draft
        </button>
      </p>
      {step === "rename" && <Rename release={release} onDone={() => setStep(null)} />}
      {step === "remove" && <Remove release={release} onKeep={() => setStep(null)} />}
    </>
  );
}

function Rename({ release, onDone }: { release: Release; onDone: () => void }) {
  const id = useId();
  const { rename } = useDraftLifecycle();
  const [name, setName] = useState(release.name ?? "");
  const waits = !name.trim() ? "Give the version a name." : name.trim() === release.name ? "The name is unchanged." : null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!waits) rename.mutate({ release, name: name.trim() }, { onSuccess: onDone });
  };
  return (
    <form className="withdraw draft-step" aria-labelledby={`${id}-title`} onSubmit={submit}>
      <h2 id={`${id}-title`} className="withdraw__title">Rename the draft</h2>
      <label className="field" htmlFor={`${id}-name`}>
        <span className="field__label">Name</span>
        <input id={`${id}-name`} className="field__input" dir="auto" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      {rename.isError && <p className="docpage__failure" role="alert">{errorMessage(rename.error)}</p>}
      <p className="withdraw__actions">
        <button type="submit" className="action-button" disabled={!!waits || rename.isPending} aria-describedby={waits ? `${id}-waits` : undefined}>
          {rename.isPending ? "Renaming…" : "Rename it"}
        </button>
        <button type="button" className="text-button" onClick={onDone}>Keep the name</button>
      </p>
      {waits && <p id={`${id}-waits`} className="versions__waits">{waits}</p>}
    </form>
  );
}

function Remove({ release, onKeep }: { release: Release; onKeep: () => void }) {
  const id = useId();
  const navigate = useNavigate();
  const { discard } = useDraftLifecycle();
  const [sure, setSure] = useState(false);
  const name = release.name || "Untitled version";
  return (
    <section className="withdraw draft-step" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="withdraw__title">Remove this draft</h2>
      <p>
        ‘<span dir="auto">{name}</span>’ and everything decided in it go: its documents' suggestions, accepted and rejected alike, and its
        edits. The version in service does not change, and requirement work never saw the draft.
      </p>
      <label className="check">
        <input type="checkbox" checked={sure} onChange={(event) => setSure(event.target.checked)} />
        I understand the draft and its decisions cannot be brought back.
      </label>
      {discard.isError && <p className="docpage__failure" role="alert">{errorMessage(discard.error)}</p>}
      <p className="withdraw__actions">
        <button
          type="button"
          className="action-button"
          disabled={!sure || discard.isPending}
          aria-describedby={!sure ? `${id}-waits` : undefined}
          onClick={() =>
            discard.mutate(release, {
              onSuccess: () => navigate("/architecture/versions", { state: { notice: `‘${name}’ was removed.` } }),
            })
          }
        >
          {discard.isPending ? "Removing…" : "Remove the draft"}
        </button>
        <button type="button" className="text-button" onClick={onKeep}>Keep it</button>
      </p>
      {!sure && <p id={`${id}-waits`} className="versions__waits">Confirm above first.</p>}
    </section>
  );
}

/** On Versions: start the one draft, or carry on with it. */
export function StartDraft({ draft }: { draft: Release | undefined }) {
  const id = useId();
  const navigate = useNavigate();
  const { create } = useDraftLifecycle();
  const [name, setName] = useState("");
  if (draft) {
    return (
      <p className="timetable__next">
        <Link to={`/architecture/versions/${encodeURIComponent(draft.id)}/suggestions`}>
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
      onSuccess: (release) => navigate(`/architecture/versions/${encodeURIComponent(release.id)}/suggestions`),
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

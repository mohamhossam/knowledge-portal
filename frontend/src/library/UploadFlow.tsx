import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type RefObject, useId, useState } from "react";

import { api, type LibraryDocument } from "../api/client";
import { errorMessage } from "../api/errors";
import { ActionGroup, Button, TextField, Upload, type UploadItem } from "../design/components";
import { DOC_STATE_WORDS, docState } from "./docState";
import { ACCEPT } from "./FileButton";
import { DocumentLink } from "./parts";

/** The service refuses files over 10 MB; say so before the upload, not after. */
const MAX_BYTES = 10 * 1024 * 1024;

type Chosen = { key: string; file: File; title: string; documentId?: string; error?: string; sending?: boolean };

const titleOf = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || name;

/** A started upload's state, from the library list (Jobs polls it while anything is read). */
function stateOf(chosen: Chosen, documents: LibraryDocument[] | undefined): UploadItem["state"] {
  if (chosen.error) return "attention";
  if (!chosen.documentId) return chosen.sending ? "working" : "waiting";
  const document = documents?.find((item) => item.id === chosen.documentId);
  const state = document ? docState(document) : "reading";
  return state === "reading" ? "working" : state === "attention" ? "attention" : state === "held" ? "held" : state === "stopped" ? "stopped" : "done";
}

function noteOf(chosen: Chosen, documents: LibraryDocument[] | undefined): string | undefined {
  if (chosen.error) return chosen.error;
  if (!chosen.documentId) return chosen.sending ? "Uploading…" : undefined;
  const document = documents?.find((item) => item.id === chosen.documentId);
  if (!document) return "Scanning for malware, then reading";
  const state = docState(document);
  if (state === "review") return "Read: ready for your review";
  if (state === "attention") return `Couldn't read it: ${document.versions.at(-1)?.error ?? "the reading failed"}`;
  if (state === "held") return "Held by the malware scan; it won't be read";
  return DOC_STATE_WORDS[state];
}

/**
 * Upload as a flow opened in place (plan 02 §1): choose files, name each,
 * upload; then each is scanned and read while the person carries on. Jobs
 * shows the reading too, so the flow can be left at any time.
 */
export function UploadFlow({ onClose, panelRef }: { onClose: () => void; panelRef: RefObject<HTMLElement | null> }) {
  const id = useId();
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const [tried, setTried] = useState(false);
  const started = chosen.some((item) => item.documentId || item.sending || item.error);
  const sending = chosen.some((item) => item.sending);
  const documents = useQuery({ queryKey: ["library", "documents"], queryFn: api.libraryDocuments, enabled: started });

  const update = (key: string, change: Partial<Chosen>) =>
    setChosen((all) => all.map((item) => (item.key === key ? { ...item, ...change } : item)));

  const upload = async () => {
    setTried(true);
    const untitled = chosen.findIndex((item) => !item.title.trim());
    if (untitled >= 0) {
      // To the field that needs it: its error is part of its description.
      window.document.querySelectorAll<HTMLInputElement>(".lib-flow__titles input")[untitled]?.focus();
      return;
    }
    if (chosen.length === 0) return;
    for (const item of chosen) {
      if (item.documentId || item.error) continue;
      if (item.file.size > MAX_BYTES) {
        update(item.key, { error: "It's over 10 MB. Split it, or save a smaller copy." });
        continue;
      }
      update(item.key, { sending: true });
      try {
        const document = await api.upload({ file: item.file, title: item.title.trim() });
        update(item.key, { sending: false, documentId: document.id });
      } catch (error) {
        update(item.key, { sending: false, error: errorMessage(error) });
      }
    }
    void queryClient.invalidateQueries({ queryKey: ["library", "documents"] });
  };

  const items: UploadItem[] = chosen.map((item) => ({ name: item.file.name, state: stateOf(item, documents.data), note: noteOf(item, documents.data) }));
  const done = chosen.filter((item) => item.documentId);

  return (
    <section
      ref={panelRef as RefObject<HTMLElement>}
      className="lib-flow"
      aria-labelledby={`${id}-title`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !sending) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <h2 id={`${id}-title`} tabIndex={-1} className="lib-flow__title">Upload documents</h2>
      <Upload
        label="Choose files"
        hint="PDF, Word, Excel, PowerPoint, CSV, Markdown, text or an image, up to 10 MB each. Each is scanned for malware, then read. Nothing reaches requirement work until you review what was read and approve it; until then it is private to you."
        accept={ACCEPT}
        items={started ? items : []}
        onFiles={(files) => {
          setTried(false);
          setChosen(files.map((file, index) => ({ key: `${index}-${file.name}`, file, title: titleOf(file.name) })));
        }}
      />
      {!started && chosen.length > 0 && (
        <fieldset className="lib-flow__titles">
          <legend className="ds-field__label">{chosen.length === 1 ? "Its title in the library" : "Their titles in the library"}</legend>
          {chosen.map((item) => (
            <TextField
              key={item.key}
              label={<>Title for <bdi>{item.file.name}</bdi></>}
              required
              maxLength={200}
              value={item.title}
              error={tried && !item.title.trim() ? "Give it a title: it's how the library and requirement work name it." : null}
              onChange={(event) => update(item.key, { title: event.target.value })}
            />
          ))}
        </fieldset>
      )}
      {started ? (
        <>
          <p role="status" className="lib-flow__note">
            {sending
              ? "Uploading…"
              : `${done.length === 1 ? "Reading has started" : done.length > 1 ? `${done.length} files are being read` : "Nothing was uploaded"}. You can leave this page; reading carries on, and Jobs shows its progress.`}
          </p>
          {done.length > 0 && (
            <ul className="ds-lines" aria-label="Uploaded documents">
              {done.map((item) => <li key={item.key}><DocumentLink id={item.documentId!} title={item.title} /></li>)}
            </ul>
          )}
          <ActionGroup>
            <Button busy={sending} onClick={onClose}>Close</Button>
          </ActionGroup>
        </>
      ) : (
        <ActionGroup>
          <Button variant="primary" unavailableReason={chosen.length === 0 ? "Choose a file first." : null} onClick={() => void upload()}>
            {chosen.length > 1 ? `Upload ${chosen.length} files` : "Upload and read"}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </ActionGroup>
      )}
    </section>
  );
}

import { Download, FileSearch } from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";

import { api, type CatalogueFileFormat, type Release } from "../api/client";
import { errorMessage } from "../api/errors";
import { DiffTable } from "./DiffTable";
import { saveBlob, useCatalogueFile } from "./useEditing";

const FORMATS: { format: CatalogueFileFormat; label: string }[] = [
  { format: "xlsx", label: "Excel" },
  { format: "yaml", label: "YAML" },
  { format: "json", label: "JSON" },
];

const fileName = (release: Release, format: string) =>
  `${(release.name || release.id).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")}.${format}`;

/**
 * The catalogue as a file: the template, the draft as it stands, and a file
 * brought back, shown as its differences before it replaces anything.
 */
export function CatalogueFile({ release }: { release: Release }) {
  const id = useId();
  const { preview, replace } = useCatalogueFile(release);
  const [file, setFile] = useState<File | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const shown = preview.data && file ? preview.data : null;

  const download = async (blob: Promise<Blob>, name: string) => {
    setFailure(null);
    try {
      saveBlob(await blob, name);
    } catch (error) {
      setFailure(error);
    }
  };
  const look = (event: FormEvent) => {
    event.preventDefault();
    if (file) preview.mutate(file);
  };
  const reset = () => {
    setFile(null);
    preview.reset();
    if (input.current) input.current.value = "";
  };

  return (
    <section className="govsection" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="govsection__title">Catalogue file</h2>
      <p className="govsection__lead">
        Fill in the Excel template, or take the draft as a file, change it, and bring it back. A file replaces the draft's
        systems, connections, domains, offerings and journeys; its documents and their suggestions stay.
      </p>
      <p className="govsection__actions">
        <button type="button" className="text-button" onClick={() => void download(api.catalogueTemplate(), "catalogue-template.xlsx")}>
          <Download size={14} aria-hidden="true" />
          The empty template
        </button>
        <span className="versions__label">The draft as it stands:</span>
        {FORMATS.map(({ format, label }) => (
          <button
            key={format}
            type="button"
            className="text-button"
            onClick={() => void download(api.catalogueFile(release.id, format), fileName(release, format))}
          >
            <Download size={14} aria-hidden="true" />
            {label}
            <span className="visually-hidden"> file of the draft</span>
          </button>
        ))}
      </p>
      {failure ? <p className="docpage__failure" role="alert">{errorMessage(failure)}</p> : null}
      {notice && <p className="toolbar__notice" role="status">{notice}</p>}

      <form className="searchbar catalogue-file__form" onSubmit={look} aria-label="Bring back a catalogue file">
        <label className="field searchbar__field" htmlFor={`${id}-file`}>
          <span className="field__label">A catalogue file (Excel, YAML or JSON)</span>
          <input
            ref={input}
            id={`${id}-file`}
            type="file"
            className="field__input field__input--file"
            accept=".xlsx,.yaml,.yml,.json"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setNotice(null);
              preview.reset();
            }}
          />
        </label>
        <button type="submit" className="action-button action-button--secondary" disabled={!file || preview.isPending}>
          <FileSearch size={16} aria-hidden="true" />
          {preview.isPending ? "Reading it…" : "Show what it would change"}
        </button>
      </form>
      {preview.isError && <p className="docpage__failure" role="alert">{errorMessage(preview.error)}</p>}

      {shown && file && (
        <div className="withdraw catalogue-file__preview" aria-label={`What ${file.name} would change`}>
          <h3 className="withdraw__title">What ‘{file.name}’ would change in the draft</h3>
          <DiffTable diff={shown} caption={`What ${file.name} would change in the draft`} release={release} />
          {replace.isError && <p className="docpage__failure" role="alert">{errorMessage(replace.error)}</p>}
          <p className="withdraw__actions">
            <button
              type="button"
              className="action-button"
              disabled={replace.isPending || shown.changes.length === 0}
              onClick={() =>
                replace.mutate(file, {
                  onSuccess: () => {
                    setNotice(`The draft now holds what ‘${file.name}’ says.`);
                    reset();
                  },
                })
              }
            >
              {replace.isPending ? "Replacing…" : "Replace the draft's content with the file"}
            </button>
            <button type="button" className="text-button" onClick={reset}>Keep the draft as it is</button>
          </p>
        </div>
      )}
    </section>
  );
}

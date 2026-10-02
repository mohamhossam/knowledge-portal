import { useMutation } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";

import { api, type ReferenceChunk } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { count } from "../home/format";
import { contextPlaces } from "./searchContext";

/**
 * Searching every passage in service, across all owners, the way requirement
 * work's grounding does: each answer is an exact, citable passage with the
 * approved context around it.
 */
export function SearchPage() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const id = useId();
  const search = useMutation({ mutationFn: (text: string) => api.search(text) });

  useEffect(() => {
    window.document.title = "Search · Library · Knowledge portal";
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (query.trim()) search.mutate(query.trim());
  };
  const results = search.data ?? [];
  const limited = search.error instanceof ApiError && search.error.status === 429;

  return (
    <section className="timetable" aria-labelledby={`${id}-title`}>
      <p className="timetable__number" aria-hidden="true">1</p>
      <header className="timetable__head">
        <h1 id={`${id}-title`} className="timetable__title">
          <span className="visually-hidden">Table 1:</span>{" "}Search the library
        </h1>
        <p className="timetable__edition">
          Every passage in service, across all owners: what requirement work can cite today. <Link to="/library">Back to the documents</Link>
        </p>
      </header>
      <div className="timetable__body">
        <form className="searchbar" onSubmit={submit} role="search">
          <label className="field searchbar__field" htmlFor={`${id}-query`}>
            <span className="field__label">What are you looking for?</span>
            <input id={`${id}-query`} type="search" className="field__input" maxLength={2000} value={query}
              onChange={(event) => setQuery(event.target.value)} placeholder="For example: XGPON coverage for business bundles" />
          </label>
          <button type="submit" className="action-button" disabled={!query.trim() || search.isPending}>
            <Search size={16} aria-hidden="true" />
            {search.isPending ? "Searching…" : "Search"}
          </button>
        </form>

        {search.isError && (
          <p className="docpage__failure" role="alert">
            {limited ? "Too many searches in a minute. Wait a moment and search again." : errorMessage(search.error)}
          </p>
        )}
        {search.isSuccess && (
          <p className="govsection__lead" aria-live="polite">
            {results.length === 0
              ? "No passage in service matches."
              : `${count(results.length, "passage")} from ${count(new Set(results.map((item) => item.document_id)).size, "document")}, best first.`}
          </p>
        )}
        {results.length > 0 && (
          <table className="govtable searchresults">
            <caption className="visually-hidden">Passages in service matching “{search.variables}”</caption>
            <thead>
              <tr>
                <th scope="col">Passage</th>
                <th scope="col" className="cell--p2">Cited from</th>
              </tr>
            </thead>
            <tbody>
              {results.map((chunk) => (
                <Result key={chunk.id} chunk={chunk} open={open === chunk.id} onToggle={() => setOpen(open === chunk.id ? null : chunk.id)} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Result({ chunk, open, onToggle }: { chunk: ReferenceChunk; open: boolean; onToggle: () => void }) {
  // Context earns its toggle only when it reaches beyond the passage's own place.
  const hasContext = chunk.context_locations.length >= 2 && chunk.context_text.trim() !== chunk.original_text.trim();
  const place = [...chunk.heading_path.filter((part) => !chunk.location.includes(part)), chunk.location].join(" › ");
  return (
    <tr className="row">
      <th scope="row" dir="auto" className="searchresults__passage">
        {chunk.original_text}
        {hasContext && (
          <span className="searchresults__toggle">
            <button type="button" className="text-button" aria-expanded={open} onClick={onToggle}>
              {open ? "Hide the surrounding text" : `Show the surrounding text (${count(chunk.context_locations.length, "place")})`}
            </button>
          </span>
        )}
        {hasContext && open && (
          <span className="searchresults__context">
            {contextPlaces(chunk.context_text, chunk.location).map((place) => (
              <span key={place.location} className={place.cited ? "context-place is-cited" : "context-place"}>
                <span className="context-place__where">{place.location}</span>
                <span dir="auto">{place.text}</span>
              </span>
            ))}
          </span>
        )}
        <span className="secondary govtable__by searchresults__from" dir="ltr">
          <bdi><Link to={`/library/${encodeURIComponent(chunk.document_id)}`}>{chunk.document_title}</Link></bdi>
          {" · "}version {chunk.version_number} · {place}
        </span>
      </th>
      <td className="cell--p2">
        <Link to={`/library/${encodeURIComponent(chunk.document_id)}`} dir="auto">{chunk.document_title}</Link>
        <span className="secondary govtable__by" dir="ltr">
          version {chunk.version_number} · {place}
          {chunk.field_context && <> · {chunk.field_context}</>}
        </span>
      </td>
    </tr>
  );
}

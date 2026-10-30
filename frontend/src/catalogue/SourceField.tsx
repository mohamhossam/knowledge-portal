import { useContext, useId, useState } from "react";
import { Link } from "react-router-dom";

import type { KnowledgeSource, SourceConfidence } from "../api/client";
import { Button, Status } from "../design/components";
import { useFocusAfterRender } from "../design/hooks";
import { citedAs, registerOptions, SourcesContext } from "./governance";
import { SelectField, TextField } from "./forms";
import { useCatalogueContext } from "./useCatalogue";

/** The choice that keeps a citation of a document the register does not hold. */
const ELSEWHERE = "*elsewhere";
/** Between the source a line cites and where in it, as the service reads a line (citations.SEPARATOR). */
const SEPARATOR = " · ";


/** The line a choice writes: the source as cited, then where in it. */
const lineOf = (source: KnowledgeSource, where: string) => `${citedAs(source)}${where.trim() ? `${SEPARATOR}${where.trim()}` : ""}`;

type Choice = { source: string; where: string; text: string };

/** How sure a source is, in a word that reads within a sentence: "…, inferred". */
const CONFIDENCE_WORD: Record<SourceConfidence, string> = { confirmed: "confirmed", inferred: "inferred", gap: "with gaps" };

/**
 * Lines written in this session, each with the choice that wrote it, so a row that moves (and
 * meets its line again) opens on its source though the service has not read the line yet.
 */
const written = new Map<string, Choice>();

/**
 * The way to the register, in a new tab so the edit stays open; the source registered there is
 * offered here once this draft is read again, on coming back to this tab.
 */
function RegisterLink({ children }: { children: string }) {
  const context = useCatalogueContext() as Partial<ReturnType<typeof useCatalogueContext>> | undefined;
  if (!context?.base) return null;
  return (
    <Link to={`${context.base}/governance`} target="_blank" rel="noopener" className="cat-source__register">
      {children} (opens in a new tab)
    </Link>
  );
}

/**
 * A fact's source, chosen from the draft's register with where in it typed beside it, written
 * as the one line the service reads back to that source ("SDD v2.3 · §4.1"), and said as it will
 * be saved. A line opens on the source the service read it as; one naming no registered source
 * stays as written, marked, with the way to register it. Controlled: `value` is the line,
 * `onChange` gets the line or null.
 */
/** Where a fact comes from, as a row holds it: its source line and how sure that source is. */
export type Sourced = { source?: string | null; confidence?: SourceConfidence | null };

export function SourceField({ value, onChange, previous, onCopy, label = "Source" }: {
  value: string | null | undefined;
  /** What the source is of, where a form holds more than one: "Where the conflict is recorded". */
  label?: string;
  onChange: (line: string | null) => void;
  /** The row above, in a list of rows: its source is offered while this one names none, so a run of rows from one document is quick. */
  previous?: Sourced | null;
  /** Takes the row above's source and how sure it is in one change, so neither is lost to the other. */
  onCopy?: (copied: { source: string; confidence: SourceConfidence | null }) => void;
}) {
  const own = useId();
  const focusLater = useFocusAfterRender();
  const register = useContext(SourcesContext);
  const sources = [...register.sources.values()];
  // What a line says, as the service read it, or as this session wrote it against this register.
  const read = (line: string | null | undefined): Choice => {
    const text = (line ?? "").trim();
    if (!text) return { source: "", where: "", text: "" };
    const reading = register.lines.get(text);
    if (reading?.source_id && register.sources.has(reading.source_id)) return { source: reading.source_id, where: reading.where ?? "", text: "" };
    const remembered = written.get(text);
    if (remembered && (remembered.source === ELSEWHERE || register.sources.has(remembered.source))) return remembered;
    return { source: ELSEWHERE, where: "", text };
  };
  const [choice, setChoice] = useState<Choice>(() => read(value));
  const [said, setSaid] = useState<string | null>((value ?? "").trim() || null);
  // A line from outside, such as a row that moved into this place, is read afresh.
  const now = (value ?? "").trim() || null;
  if (now !== said) {
    setSaid(now);
    setChoice(read(now));
  }
  const chosen = register.sources.get(choice.source);
  const choose = (next: Choice) => {
    // Leaving a registered source for one not in the register keeps what was written of it.
    const carried =
      next.source === ELSEWHERE && choice.source !== ELSEWHERE && !next.text && chosen ? { ...next, text: lineOf(chosen, choice.where) } : next;
    setChoice(carried);
    const source = register.sources.get(carried.source);
    const line = source ? lineOf(source, carried.where) : carried.source === ELSEWHERE ? carried.text.trim() || null : null;
    if (line) written.set(line, carried);
    setSaid(line);
    onChange(line);
  };
  const options = [{ value: "", label: "Not stated" }, ...registerOptions(sources), { value: ELSEWHERE, label: "A document not in the register" }];
  const above = previous?.source?.trim() || null;
  // The copy takes the row's source in its place, and focus goes to it, never to the page.
  const copy = () => {
    if (!above) return;
    setChoice(read(above));
    setSaid(above);
    if (onCopy) onCopy({ source: above, confidence: previous?.confidence ?? null });
    else onChange(above);
    focusLater(() => document.querySelector<HTMLElement>(`[data-source="${CSS.escape(own)}"] :is(input, select)`));
  };
  return (
    <div className="cat-source" data-source={own}>
      <SelectField label={label} value={choice.source} options={options} onChange={(source) => choose({ ...choice, source })} />
      {!now && above && (
        <div className="cat-form__cell cat-source__copy">
          <Button variant="tertiary" onClick={copy}>
            Same source as above: “{above}”{previous?.confidence ? `, ${CONFIDENCE_WORD[previous.confidence]}` : ""}
          </Button>
        </div>
      )}
      {chosen && <TextField label="Where in it" value={choice.where} hint="Such as §4.1; a note may follow a ·" onChange={(where) => choose({ ...choice, where })} />}
      {choice.source === ELSEWHERE && (
        <TextField
          label="The document, as cited"
          value={choice.text}
          hint="Not in the register, so it can't be traced to its document."
          onChange={(text) => choose({ ...choice, text })}
        />
      )}
      {/* What is saved, said as the line it becomes; and what to do when nothing can be. */}
      <div className="cat-form__wide cat-source__note" aria-live="polite">
        {chosen ? (
          <p className="ds-field__hint">Saves as “{lineOf(chosen, choice.where)}”.</p>
        ) : choice.source === ELSEWHERE ? (
          <>
            {!choice.text.trim() && (
              <p className="ds-field__hint">
                <Status tone="warning">Nothing is recorded until the document is named.</Status>
              </p>
            )}
            <RegisterLink>Register it on Governance</RegisterLink>
          </>
        ) : sources.length === 0 ? (
          <>
            <p className="ds-field__hint">This draft registers no source yet.</p>
            <RegisterLink>Register a source on Governance</RegisterLink>
          </>
        ) : null}
      </div>
    </div>
  );
}

import "./focus.css";

import { createContext, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject, useContext, useEffect, useId, useRef, useState } from "react";

import { Button } from "./actions";

/**
 * Whether a frame has shown its first title. The shell moves focus to a page's h1 after a
 * navigation (and leaves a page opened directly to the skip link), so only the titles after
 * the first, one per new question, take focus themselves.
 */
const Arrived = createContext<{ first: () => boolean } | null>(null);

/** Where each question of a run stands, drawn as the progress line's segments. */
export type FocusStep = "answered" | "skipped" | "current" | "open";

/** A field or a control that takes keys of its own: Esc and the number keys leave it alone. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest("input:not([type='radio']):not([type='checkbox']), textarea, select, [contenteditable='true']"));

/**
 * Focus mode (UX rebuild plan, phase 2): one piece of work, one question at a
 * time. The shell hides the sidebar on these pages; this frame holds what the
 * work is, where you are in it ("Question 2 of 5", with the progress line), a
 * way out (also Esc), the question, and an optional aside beside it (a
 * diagram of what the answers settle). Every answer can be changed until the
 * summary is confirmed: nothing is sent before.
 */
export function FocusFrame({ work, place, steps, onLeave, leaveLabel = "Leave", aside, asideLabel, documentTitle, children }: {
  /** What the work is: a document's or a draft's name (wrap a name in <bdi>). */
  work: ReactNode;
  /** Where you are, in words: "Question 2 of 5", "Summary". */
  place: string;
  steps: FocusStep[];
  onLeave: () => void;
  leaveLabel?: string;
  /** Shown beside the question on a wide window, under it on a narrow one. */
  aside?: ReactNode;
  asideLabel?: string;
  /** The tab's title, without the portal's name. */
  documentTitle: string;
  children: ReactNode;
}) {
  useEffect(() => {
    window.document.title = `${documentTitle} · Knowledge portal`;
  }, [documentTitle]);
  const done = steps.filter((step) => step === "answered").length;
  const [arrived] = useState(() => {
    let shown = false;
    return {
      first: () => {
        if (shown) return false;
        shown = true;
        return true;
      },
    };
  });
  // Esc leaves from the page itself too (opened directly, nothing in it has focus yet).
  useEffect(() => {
    const fromPage = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && event.target === window.document.body) onLeave();
    };
    window.addEventListener("keydown", fromPage);
    return () => window.removeEventListener("keydown", fromPage);
  }, [onLeave]);
  return (
    <Arrived.Provider value={arrived}>
      <div
        className={`ds-focus${aside ? " ds-focus--aside" : ""}`}
        onKeyDown={(event) => {
          // Esc leaves, unless a field or a panel inside took it first.
          if (event.key !== "Escape" || event.defaultPrevented || typing(event.target)) return;
          event.preventDefault();
          onLeave();
        }}
      >
        <div className="ds-focus__bar">
          <p className="ds-focus__work">
            <span className="ds-focus__name">{work}</span>
            <span className="ds-focus__place">{place}</span>
          </p>
          <Button variant="tertiary" aria-keyshortcuts="Escape" onClick={onLeave}>
            {leaveLabel} <kbd className="ds-focus__key">Esc</kbd>
          </Button>
        </div>
        {steps.length > 0 && (
          <div className="ds-focus__progress">
            {/* The segments repeat the words of the line above and its count below. */}
            <ol className="ds-focus__steps" aria-hidden="true">
              {steps.map((step, index) => <li key={index} className={`ds-focus__step ds-focus__step--${step}`} />)}
            </ol>
            <p className="ds-focus__count">{done} of {steps.length} answered</p>
          </div>
        )}
        <div className="ds-focus__body">
          <div className="ds-focus__main">{children}</div>
          {aside && <aside className="ds-focus__aside" aria-label={asideLabel}>{aside}</aside>}
        </div>
      </div>
    </Arrived.Provider>
  );
}

/** A focus page's h1: each new question's takes focus as it appears, so it is announced. */
export function FocusTitle({ children, headingRef }: { children: ReactNode; headingRef?: RefObject<HTMLHeadingElement | null> }) {
  const own = useRef<HTMLHeadingElement>(null);
  const ref = headingRef ?? own;
  const arrived = useContext(Arrived);
  useEffect(() => {
    // The frame's first title is the page's: the shell has placed focus for it already.
    if (arrived?.first()) return;
    ref.current?.focus({ preventScroll: false });
  }, [ref, arrived]);
  return <h1 ref={ref} id="ds-page-title" className="ds-focus__title" tabIndex={-1} dir="auto">{children}</h1>;
}

export type FocusChoice<T extends string> = {
  value: T;
  /** The answer, short and bold ("Yes, it is BCRM"). */
  label: ReactNode;
  /** What choosing it does, in a sentence. */
  consequence: ReactNode;
};

/**
 * One question: its title, why it is asked, the source it comes from, then
 * the choices, each with what it does. 1 to 9 pick a choice; Enter confirms
 * and goes on; Skip leaves it open for later. Mount it with a `key` per
 * question, so its heading takes focus as it arrives.
 */
export function FocusQuestion<T extends string>({
  title, lead, source, choices, value, onChange, onNext, onSkip, nextLabel = "Confirm and next", skipLabel = "Skip for now", unavailableReason, children,
}: {
  title: ReactNode;
  lead?: ReactNode;
  /** Where the question comes from: a quoted passage, a warning, a citation. */
  source?: ReactNode;
  choices: FocusChoice<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  onNext: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  skipLabel?: string;
  /** Why Next can't run yet (no choice made, a reason missing). */
  unavailableReason?: string | null;
  /** Anything the chosen answer still needs (a reason field), under the choices. */
  children?: ReactNode;
}) {
  const id = useId();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!unavailableReason && value !== undefined) onNext();
  };
  const why = value === undefined ? "Choose an answer first." : unavailableReason ?? null;
  const pick = (event: KeyboardEvent<HTMLFormElement> | globalThis.KeyboardEvent) => {
    // Enter confirms from anywhere in the question (its heading has focus as it arrives), but a
    // button, a link or a text area keeps its own Enter; a text field already submits the form.
    if (event.key === "Enter" && !event.defaultPrevented && event.target instanceof HTMLElement && !event.target.closest("button, a, textarea, input")) {
      event.preventDefault();
      if (!why) onNext();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
    const index = Number(event.key) - 1;
    const choice = Number.isInteger(index) && index >= 0 ? choices[index] : undefined;
    if (!choice) return;
    event.preventDefault();
    onChange(choice.value);
    window.document.getElementById(`${id}-${index}`)?.focus();
  };
  // Opened directly, the page leaves focus where the browser put it (the skip link comes first):
  // the keys work from there too, before anything in the question has focus.
  useEffect(() => {
    const fromPage = (event: globalThis.KeyboardEvent) => {
      if (event.target === window.document.body) pick(event);
    };
    window.addEventListener("keydown", fromPage);
    return () => window.removeEventListener("keydown", fromPage);
  });
  return (
    <form className="ds-focus__question" aria-labelledby="ds-page-title" onSubmit={submit} onKeyDown={pick}>
      <FocusTitle>{title}</FocusTitle>
      {lead && <p className="ds-focus__lead">{lead}</p>}
      {source && <div className="ds-focus__source">{source}</div>}
      <fieldset className="ds-focus__choices">
        <legend className="ds-visually-hidden">Your answer</legend>
        {choices.map((choice, index) => (
          <label key={choice.value} className={`ds-focus__choice${value === choice.value ? " is-chosen" : ""}`}>
            <input
              id={`${id}-${index}`}
              type="radio"
              className="ds-focus__radio"
              name={id}
              value={choice.value}
              checked={value === choice.value}
              aria-labelledby={`${id}-${index}-answer`}
              aria-describedby={`${id}-${index}-does`}
              aria-keyshortcuts={index < 9 ? String(index + 1) : undefined}
              onChange={() => onChange(choice.value)}
            />
            {index < 9 && <kbd className="ds-focus__key" aria-hidden="true">{index + 1}</kbd>}
            <span id={`${id}-${index}-answer`} className="ds-focus__answer">{choice.label}</span>
            <span id={`${id}-${index}-does`} className="ds-focus__does">{choice.consequence}</span>
          </label>
        ))}
      </fieldset>
      {children}
      <div className="ds-focus__actions">
        {onSkip && <Button variant="tertiary" onClick={onSkip}>{skipLabel}</Button>}
        <Button type="submit" variant="primary" unavailableReason={why}>{nextLabel}</Button>
      </div>
    </form>
  );
}

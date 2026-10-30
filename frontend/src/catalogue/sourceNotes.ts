import { createContext, useContext, useLayoutEffect, useSyncExternalStore } from "react";

/**
 * The source fields of one form, counted, so the form says once, under its title, what the
 * register lacks ("This draft registers no source yet"), not at whichever row comes first.
 */
export type SourceNotes = {
  claim: (field: string) => () => void;
  count: () => number;
  subscribe: (listener: () => void) => () => void;
};

export function sourceNotes(): SourceNotes {
  const fields = new Set<string>();
  const listeners = new Set<() => void>();
  const tell = () => listeners.forEach((listener) => listener());
  return {
    claim: (field) => {
      fields.add(field);
      tell();
      return () => {
        fields.delete(field);
        tell();
      };
    },
    count: () => fields.size,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const SourceNotesContext = createContext<SourceNotes | null>(null);

const alone = () => () => {};

/** Counts this source field in its form, if it is in one: then the form, not the field, says what the register lacks. */
export function useSourceFieldInForm(field: string): boolean {
  const notes = useContext(SourceNotesContext);
  useLayoutEffect(() => notes?.claim(field), [notes, field]);
  return notes !== null;
}

/** How many source fields a form holds, as its fields come and go. */
export function useSourceFieldCount(notes: SourceNotes): number {
  return useSyncExternalStore(notes.subscribe ?? alone, notes.count);
}

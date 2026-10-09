/** Asks the shell to open Help at its shortcuts, beside the page; `detail` is the element to return focus to. */
export const SHORTCUTS_EVENT = "knowledge-portal:shortcuts";

export function openShortcuts(opener: HTMLElement | null) {
  window.dispatchEvent(new CustomEvent(SHORTCUTS_EVENT, { detail: opener }));
}

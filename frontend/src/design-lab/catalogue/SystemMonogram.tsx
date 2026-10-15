import { monogram } from "./labUtil";

/**
 * A system's (or channel's) monogram tile in its TAM layer's colour; with no layer, a party
 * (a team or the customer). `decorative` hides it from screen readers when the name is
 * written beside it.
 */
export function SystemMonogram({ name, tone, title, decorative = true }: { name: string; tone?: string | null; title?: string; decorative?: boolean }) {
  const letters = monogram(name);
  return (
    <span className={`am-mono cl-systile${tone ? ` tone--${tone}` : " is-party"} am-mono--${letters.length}`} title={title} aria-hidden={decorative || undefined} translate="no">
      {letters}
    </span>
  );
}

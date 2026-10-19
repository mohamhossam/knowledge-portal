import type { ReactNode } from "react";

/**
 * A line icon on the lab's 16px grid, drawn in the text colour. `glyph` sits in a card or
 * header, `view` in a list or switch: the two classes size and colour it for where it is.
 */
export function LabIcon({ children, size = 16, kind = "glyph" }: { children: ReactNode; size?: number; kind?: "glyph" | "view" }) {
  return (
    <svg className={kind === "glyph" ? "cl-glyph" : "cl-view-icon"} viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      {children}
    </svg>
  );
}

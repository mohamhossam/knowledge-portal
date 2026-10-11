import type { ReactNode } from "react";

/** One quiet fact at a row's end or beside a name: "No squad", "To check". Words, never colour alone. */
export function Tag({ children }: { children: ReactNode }) {
  return <span className="own-tag">{children}</span>;
}

/**
 * Small pieces the library's pages share. Design-system components only;
 * anything another area needs moves into src/design.
 */
import { type ReactNode, type Ref } from "react";

import { ApiError, errorMessage } from "../api/errors";
import { Button, Status } from "../design/components";
import { RouterLink } from "../shell/links";
import { contentLang } from "./where";

/**
 * An outcome line under an action (§7, §15): polite, and empty until there is
 * something to say. A failure carries its icon and words, never colour alone.
 */
export function Outcome({ text, failed, focusRef }: { text: string | null | undefined; failed?: boolean; focusRef?: Ref<HTMLParagraphElement> }) {
  return (
    <p ref={focusRef} tabIndex={focusRef ? -1 : undefined} className="lib-outcome" role="status">
      {text ? failed ? <Status tone="attention">{text}</Status> : text : null}
    </p>
  );
}

/** Content of either language: isolated, with its language where it can be told (backlog K2). */
export function Content({ text, children }: { text: string; children?: ReactNode }) {
  return <bdi lang={contentLang(text)}>{children ?? text}</bdi>;
}

/** A document's name as a link to its record. */
export function DocumentLink({ id, title, hash = "" }: { id: string; title: string; hash?: string }) {
  // Not wrapped in <bdi>: a cell's dir="auto" then sees the title and aligns to its script.
  return <span dir="auto" lang={contentLang(title)}><RouterLink href={`/library/${encodeURIComponent(id)}${hash}`}>{title}</RouterLink></span>;
}

/**
 * A failed change, said with its cause; a conflict (409) offers the reload
 * that resolves it (§7). Polite, never an alert: it answers the person's own action.
 */
export function Failure({ error, onReload }: { error: unknown; onReload: () => void }) {
  const conflict = error instanceof ApiError && error.status === 409;
  return (
    <p className="lib-outcome" role="status">
      <Status tone="attention">
        {conflict
          ? "The document changed while you worked (someone else, or the service finishing a step). Reload it, then try again."
          : errorMessage(error)}
      </Status>
      {conflict && <>{" "}<Button variant="link" onClick={onReload}>Reload the document</Button></>}
    </p>
  );
}

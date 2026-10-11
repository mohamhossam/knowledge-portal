import { Status } from "../../design/components";

/**
 * The outcome of an action, under it: polite, mounted before it has anything
 * to say so it is announced, and a failure carries its icon and words.
 */
export function Said({ text, failed }: { text: string | null | undefined; failed?: boolean }) {
  return (
    <p className="draft-said" role="status">
      {text ? failed ? <Status tone="attention">{text}</Status> : text : null}
    </p>
  );
}

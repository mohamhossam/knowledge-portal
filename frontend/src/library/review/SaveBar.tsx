import { ActionGroup, BulkActionBar, Button, StickyFooter } from "../../design/components";
import { Outcome } from "../parts";
import { plural } from "../where";

/**
 * The desk's one-line save bar: the selection's actions, review progress, save and publish,
 * and the outcome of the last of them.
 */
export function SaveBar({
  selected, excluding, onClearSelection, onExcludeSelected, onIncludeSelected,
  seen, passages, flagged, blocking, dirty, comparedWith,
  saving, asking, onSave, publishing, unavailableReason, onPublish, said, onReload,
}: {
  /** How many passages are selected. */
  selected: number;
  /** The bulk exclude panel is open: the selection's bar gives way to it. */
  excluding: boolean;
  onClearSelection: () => void;
  onExcludeSelected: (event: { currentTarget: EventTarget | null }) => void;
  onIncludeSelected: () => void;
  seen: number;
  passages: number;
  flagged: number;
  blocking: number;
  dirty: number;
  /** What the passages are compared with, said after the counts. */
  comparedWith: string;
  saving: boolean;
  /** The save panel is open. */
  asking: boolean;
  onSave: () => void;
  /** The publish panel is open. */
  publishing: boolean;
  unavailableReason: string | null;
  onPublish: (event: { currentTarget: EventTarget | null }) => void;
  said: { text: string; failed?: boolean; conflict?: boolean } | null;
  onReload: () => void;
}) {
  return (
    <StickyFooter label="Save the review">
      {/* The selection bar sits inside the save bar's region, so the two stack and are measured as one (§1.1). */}
      <BulkActionBar count={excluding ? 0 : selected} noun={["passage", "passages"]} onClear={onClearSelection}>
        <Button onClick={onExcludeSelected}>Exclude {plural(selected, "passage")}…</Button>
        <Button onClick={onIncludeSelected}>
          Include {plural(selected, "passage")}
        </Button>
      </BulkActionBar>
      <div className="lib-savebar">
        <div className="lib-savebar__row">
          <section className="lib-progress" aria-label="Review progress">
            <p>
              Seen <strong className="ds-num">{seen.toLocaleString("en")}</strong> of {passages.toLocaleString("en")}
              {" · "}{flagged.toLocaleString("en")} flagged
              {" · "}{blocking.toLocaleString("en")} {blocking === 1 ? "blocks" : "block"} approval
              {" · "}<span className={dirty > 0 ? "lib-strong" : undefined}>{dirty.toLocaleString("en")} unsaved {dirty === 1 ? "change" : "changes"}</span>
              <span className="lib-quiet">
                {" · "}{comparedWith}
              </span>
            </p>
            <progress max={Math.max(passages, 1)} value={seen} aria-label="Passages seen" />
          </section>
          <ActionGroup>
            <Button id="desk-save" busy={saving} aria-expanded={asking} onClick={onSave}>{saving ? "Saving…" : "Save review"}</Button>
            <Button
              id="desk-approve"
              variant="primary"
              unavailableReason={unavailableReason}
              aria-expanded={publishing}
              onClick={onPublish}
            >
              Approve and publish…
            </Button>
          </ActionGroup>
        </div>
        <div className="lib-savebar__said">
          <Outcome text={said?.text} failed={said?.failed} />
          {said?.conflict && <Button variant="link" onClick={onReload}>Reload the document</Button>}
        </div>
      </div>
    </StickyFooter>
  );
}

import { type ReactNode, useCallback, useLayoutEffect, useMemo, useRef } from "react";

import type { LibraryDocument, LibraryVersion } from "../api/client";
import { Button, FilterStrip, Lines, SplitPane, Status } from "../design/components";
import { densityFor, usePreferences } from "../shell/preferences";
import type { Row } from "./model";
import { passageColumns } from "./review/columns";
import { LocationPicker } from "./review/LocationPicker";
import { excludePanel, publishPanel, saveReviewPanel } from "./review/panels";
import { PassageGrid } from "./review/PassageGrid";
import { PassagePane } from "./review/PassagePane";
import { SaveBar } from "./review/SaveBar";
import { type Filter, PAGE, useDeskState } from "./review/useDeskState";
import { plural } from "./where";

export { PassageText } from "./review/PassageText";

/**
 * The review desk (plan 02 §1, interaction model §2.2): progress and "seen",
 * the passage grid beside a sticky passage pane, bulk exclude with one
 * reason, a one-line save bar, and publishing through a consequence panel.
 * The grid's keys work only while focus is in it (WCAG 2.1.4).
 */
export function ReviewDesk({ document, version }: { document: LibraryDocument; version: LibraryVersion }) {
  const { density } = usePreferences();
  const {
    hook, dirty, summary, setSummary, rows, basis, headings, tally, revision, fileWarnings, unsavedReview,
    seen, selected, setSelected, editing, setEditing, original, setOriginal, filter, find, opening, said, setSaid,
    desk, bulk, approve, asking, shown, visible, current, focusRow, onActivate,
    move, change, exclude, include, edit, excludeSelected, includeSelected, clearSelection, goNext, onRowKey,
    showFilter, findPassages, clearView, showMore, save, reload, onDeskKey,
    included, flaggedSeen, seenCount, unseen, live, liveNumber, unavailableReason, togglePublish, publish,
  } = useDeskState(document, version);

  const columns = useMemo(() => passageColumns(seen, headings), [seen, headings]);

  // The grid is memoized: its handlers are stable and read the latest state when a key arrives.
  const handlers = useRef({ move, onRowKey });
  useLayoutEffect(() => {
    handlers.current = { move, onRowKey };
  });
  const onCurrentChange = useCallback((key: string) => handlers.current.move(key), []);
  const onGridKey = useCallback((row: Row, key: string) => handlers.current.onRowKey(row, key), []);

  const bulkPanel = bulk.open ? excludePanel({ disclosure: bulk, rows, selected, headings, onConfirm: excludeSelected }) : null;
  const savePanel = asking.open
    ? saveReviewPanel({ disclosure: asking, hook, decided: rows.filter((row) => row.draft).length, versionNumber: version.number, summary, onSummaryChange: setSummary, onConfirm: save })
    : null;
  const approvePanel = approve.open
    ? publishPanel({
      disclosure: approve, hook, document, version, included, live, liveNumber,
      passages: rows.length, seenCount, flagged: tally.flagged, flaggedSeen, unsavedReview, revision, dirty,
      summary, onSummaryChange: setSummary, onConfirm: publish,
    })
    : null;
  // The bulk and publish panels open in the pane, beside the list and next to the bar that opened
  // them, not after 200 rows (area 2 reviews).
  const pane: ReactNode = bulkPanel ?? approvePanel ?? savePanel ?? (
    <PassagePane
      current={current}
      documentId={document.id}
      versionId={version.id}
      versionNumber={version.number}
      headings={headings}
      seen={seen}
      comparedWithEdition={basis.kind === "edition"}
      liveNumber={liveNumber}
      editing={editing}
      original={original}
      saveFailed={said?.failed}
      onChange={change}
      onExclude={exclude}
      onInclude={include}
      onEdit={edit}
      onEditingChange={setEditing}
      onOriginalChange={setOriginal}
      goNext={goNext}
      focusRow={focusRow}
    />
  );

  return (
    <div ref={desk} className="lib-desk" data-density={densityFor(density, "desk")} onKeyDownCapture={onDeskKey}>
      {fileWarnings.filter((warning) => warning.severity === "blocking").length > 0 && (
        <Lines label="Blocks approval, about the whole file">
          {fileWarnings.filter((warning) => warning.severity === "blocking").map((warning, index) => (
            <li key={`${warning.code}-${index}`}>
              <Status tone="attention">Blocks approval, whole file</Status> {warning.message} Excluding passages can't clear this one: upload a new version.
            </li>
          ))}
        </Lines>
      )}

      <div className="lib-toolbar">
        <FilterStrip
          label="Show passages"
          filters={[
            { id: "all", label: "All", count: rows.length },
            { id: "unseen", label: "Not seen yet", count: unseen },
            { id: "flagged", label: "Flagged", count: tally.flagged },
            { id: "changed", label: "Changed", count: tally.edited + tally.new + tally.removed },
            { id: "excluded", label: "Excluded", count: tally.excludedAll },
            ...(basis.kind === "edition" && tally.removed > 0 ? [{ id: "removed", label: "Removed", count: tally.removed }] : []),
          ]}
          active={filter}
          onChange={(id) => showFilter(id as Filter)}
          find={{ label: "Find in passages", value: find, onChange: findPassages, placeholder: "Words or a sheet…" }}
          // Back to the view the desk opened on; that view needs no clearing.
          onClear={filter !== opening || find ? clearView : undefined}
        />
        <LocationPicker rows={rows} selected={selected} onSelectedChange={setSelected} onSaid={setSaid} />
        {fileWarnings.some((warning) => warning.severity !== "blocking") && (
          <details className="lib-filenotes">
            <summary>
              <Status tone="warning">Whole file flagged</Status>{" "}
              <span className="lib-quiet">{plural(fileWarnings.filter((warning) => warning.severity !== "blocking").length, "note")}</span>
            </summary>
            <Lines>
              {fileWarnings.filter((warning) => warning.severity !== "blocking").map((warning, index) => <li key={`${warning.code}-${index}`}>{warning.message}</li>)}
            </Lines>
          </details>
        )}
      </div>

      <SplitPane
        paneLabel={bulkPanel ? "Exclude the selected passages" : approvePanel ? "Publish" : savePanel ? "Save the review" : current ? `Passage ${current.ordinal}` : "Passage"}
        list={
          <>
            <PassageGrid
              caption={`Passages of version ${version.number}`}
              columns={columns}
              rows={visible}
              total={shown.length}
              selected={selected}
              onSelectedChange={setSelected}
              currentId={current?.key}
              onCurrentChange={onCurrentChange}
              onActivate={onActivate}
              onRowKey={onGridKey}
            />
            {visible.length < shown.length && (
              <p className="lib-more">
                <Button variant="link" onClick={showMore}>
                  Show the next {Math.min(PAGE, shown.length - visible.length).toLocaleString("en")} of {(shown.length - visible.length).toLocaleString("en")} more
                </Button>
              </p>
            )}
          </>
        }
        pane={pane}
      />

      <SaveBar
        selected={selected.size}
        excluding={bulk.open}
        onClearSelection={clearSelection}
        onExcludeSelected={bulk.show}
        onIncludeSelected={includeSelected}
        seen={seen.size}
        passages={rows.length}
        flagged={tally.flagged}
        blocking={tally.blocking}
        dirty={dirty}
        comparedWith={basis.kind === "edition" ? `compared with version ${liveNumber ?? "?"} in service` : "compared with the text as read"}
        saving={hook.review.isPending && !approve.open}
        asking={asking.open}
        onSave={save}
        publishing={approve.open}
        unavailableReason={unavailableReason}
        onPublish={togglePublish}
        said={said}
        onReload={reload}
      />
    </div>
  );
}

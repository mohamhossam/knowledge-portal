/**
 * A connection whose kind no source says, named the same way wherever it shows: a dashed
 * stroke, as its line is drawn in the diagrams, and the words.
 */
export function KindNotKnown() {
  return (
    <span className="cat-kind-unknown">
      <svg aria-hidden="true" focusable="false" width="16" height="8" viewBox="0 0 16 8">
        <line x1="0" y1="4" x2="16" y2="4" />
      </svg>
      Kind not known
    </span>
  );
}

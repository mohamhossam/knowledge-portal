/** The journeys page's filters: the portfolio scope it opens on, and one menu per level of the scope bar. */

import { useDismissableDetails } from "./labUtil";

/** One level's menu in the scope bar: a chip naming its kind and the choice, "Any …" first unless the level must name one. */
export function ScopeMenu({ level, value, options, onPick, allowAny = true }: { level: string; value: string | null; options: { id: string; name: string }[]; onPick: (id: string | null) => void; allowAny?: boolean }) {
  const { ref: menu, close, onKeyDown } = useDismissableDetails();
  const pick = (id: string | null) => {
    close();
    onPick(id);
  };
  const chosen = options.find((option) => option.id === value);
  const any = `Any ${level.toLowerCase()}`;
  return (
    <li className="jx-scope-level">
      <details ref={menu} className="jx-scope-menu" onKeyDown={onKeyDown}>
        <summary aria-label={`${level}: ${chosen?.name ?? any}. Change`}>
          <small aria-hidden="true">{level}</small>
          <span className={chosen ? undefined : "is-any"}>{chosen?.name ?? any}</span>
        </summary>
        <ul>
          {allowAny && (
            <li>
              <button type="button" aria-current={value === null ? "true" : undefined} onClick={() => pick(null)}>
                {any}
              </button>
            </li>
          )}
          {options.map((option) => (
            <li key={option.id}>
              <button type="button" aria-current={option.id === value ? "true" : undefined} onClick={() => pick(option.id)}>
                {option.name}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * A find field kept in the address (`?find=`). The field answers each key at
 * once from its own state; the address follows a moment after typing stops, so
 * a fast typist never loses a letter to a navigation in flight. Clearing the
 * address (Clear filters, Back) empties the field.
 */
export function useFindParam(key = "find"): [string, (value: string) => void] {
  const [params, setParams] = useSearchParams();
  const applied = params.get(key) ?? "";
  const [draft, setDraft] = useState(applied);
  // What this field last wrote: an address that differs from it was changed from elsewhere.
  const [sent, setSent] = useState(applied);
  const [seen, setSeen] = useState(applied);
  if (seen !== applied) {
    setSeen(applied);
    if (applied !== sent) {
      setSent(applied);
      setDraft(applied);
    }
  }
  useEffect(() => {
    if (draft === applied) return;
    const timer = window.setTimeout(() => {
      setSent(draft);
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        if (draft) next.set(key, draft);
        else next.delete(key);
        return next;
      }, { replace: true });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, applied, key, setParams]);
  return [draft, setDraft];
}

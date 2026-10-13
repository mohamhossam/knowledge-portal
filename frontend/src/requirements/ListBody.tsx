import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";

import { errorMessage } from "../api/errors";
import { Button, Skeleton, Status } from "../design/components";

type Pages = {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  data?: { pages: { items: unknown[] }[] };
};

/**
 * A workbench list's rows, or why there are none: still asking, a refusal to try again, or
 * nothing that matches. Paged lists end in "Show more".
 */
export function ListBody({ pages, source = "Requirement work", empty, children }: {
  pages: Pages;
  /** Who was asked, for the refusal: "Requirement work did not answer". */
  source?: string;
  empty: ReactNode;
  children: ReactNode;
}) {
  if (pages.isPending) return <div className="rk-listpad"><Skeleton label={`Asking ${source.toLowerCase()}`} rows={6} /></div>;
  if (pages.isError) {
    return (
      <div className="rk-listpad">
        <p className="rk-failure" role="alert"><Status tone="attention">{source} did not answer: {errorMessage(pages.error)}</Status></p>
        <Button variant="tertiary" icon={<RotateCw size={14} />} onClick={() => void pages.refetch()}>Try again</Button>
      </div>
    );
  }
  if (!pages.data?.pages.some((page) => page.items.length > 0)) return <p className="ds-records__empty">{empty}</p>;
  return (
    <>
      {children}
      {pages.hasNextPage && (
        <p className="rk-listpad">
          <Button variant="tertiary" busy={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>
            {pages.isFetchingNextPage ? "Asking…" : "Show more"}
          </Button>
        </p>
      )}
    </>
  );
}

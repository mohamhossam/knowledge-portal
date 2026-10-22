import { Component, type ReactNode, useEffect, useRef } from "react";

import { Notice } from "../auth/Gate";
import { ActionGroup, Button, EmptyState, PageHeader } from "../design/components";
import { failureTitle, isStaleChunk } from "./failure";

type Props = {
  children: ReactNode;
  /** What shows in place of what failed; `retry` renders the children again. */
  fallback: (error: unknown, retry: () => void) => ReactNode;
  /** A change of this (the address) clears the failure: going elsewhere is a fresh start. */
  resetKey?: unknown;
};
type State = { failed: boolean; error: unknown; key: unknown };

/**
 * Keeps one failure from blanking the portal (review: no error boundary). A render
 * error or a page chunk that fails to load shows `fallback` here; everything around
 * the boundary, such as the shell's navigation, keeps working.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { failed: true, error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.key ? null : { failed: false, error: null, key: props.resetKey };
  }

  retry = () => this.setState({ failed: false, error: null });

  render() {
    return this.state.failed ? this.props.fallback(this.state.error, this.retry) : this.props.children;
  }
}

function reloadPage() {
  window.location.reload();
}

type FailureProps = { error: unknown; onRetry?: () => void; reload?: () => void };

/** What happened, that saved work is safe, and the way on. */
export function FailureBody({ error, onRetry, reload = reloadPage }: FailureProps) {
  const stale = isStaleChunk(error);
  const said = error instanceof Error ? error.message : String(error ?? "");
  return (
    <EmptyState
      title={stale
        ? "The portal was updated while this page was open, so this page can't load. Reload to open it in the new version."
        : "Something went wrong while showing this page. Try again, or reload it."}
      action={
        <ActionGroup label="What to do now">
          {stale || !onRetry ? (
            <Button variant="primary" onClick={reload}>Reload the page</Button>
          ) : (
            <>
              <Button variant="primary" onClick={onRetry}>Try again</Button>
              <Button onClick={reload}>Reload the page</Button>
            </>
          )}
        </ActionGroup>
      }
    >
      <p>
        What you have saved is safe. A library review's unsaved decisions are kept in this tab and return when
        the page reloads; other unsaved edits on this page may be lost.
      </p>
      {!stale && said && <p>The error said: <bdi>{said}</bdi></p>}
    </EmptyState>
  );
}

/**
 * A page that failed inside the shell: the navigation stays, the page says so.
 * Focus moves to it, so a keyboard or screen reader user is not left on a vanished control.
 */
export function PageFailed(props: FailureProps) {
  const region = useRef<HTMLElement>(null);
  useEffect(() => region.current?.focus(), []);
  return (
    <section ref={region} className="page-failed" role="alert" aria-labelledby="ds-page-title" tabIndex={-1}>
      <PageHeader title={failureTitle(props.error)} />
      <FailureBody {...props} />
    </section>
  );
}

/** The whole portal failed: a page of its own, since the shell may be what broke. */
export function RootFailed({ error }: { error: unknown }) {
  return (
    <Notice title={failureTitle(error)}>
      <div role="alert">
        <FailureBody error={error} />
      </div>
    </Notice>
  );
}

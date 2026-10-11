import { Button, EmptyState, Section, Skeleton } from "../../design/components";
import { errorMessage } from "../../api/errors";
import { ButtonLink } from "../../shell/links";
import { useCatalogueContext } from "../useCatalogue";
import { ChangeTable } from "./ChangeTable";
import { useDraftProgress } from "./progress";

/** Step 3 of a draft: every difference from the version in service, counted, then listed. */
export function ChangesStep() {
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const { changes } = useDraftProgress(release);
  return (
    <div className="draft-step">
      <Section title="Changes from the version in service" count={changes.data?.changes.length}>
        <p className="draft-lead">What publishing this draft would change, from its accepted suggestions, hand edits and catalogue files.</p>
        {changes.isPending ? (
          <Skeleton label="Comparing with the version in service" rows={6} />
        ) : changes.isError ? (
          <EmptyState title={`Couldn't compare: ${errorMessage(changes.error)}`} action={<Button onClick={() => void changes.refetch()}>Try again</Button>} />
        ) : changes.data.changes.length ? (
          <ChangeTable
            diff={changes.data}
            release={release}
            caption={`What ‘${release.name || release.id}’ changes against the version in service`}
            systemLink={(key) => (book.systems.has(key) ? `${base}/systems/${encodeURIComponent(key)}` : null)}
          />
        ) : (
          <EmptyState title="Nothing differs from the version in service yet.">
            <p>Accept suggestions on Decide, or edit the draft's pages by hand.</p>
          </EmptyState>
        )}
      </Section>
      <p className="draft-next">
        <ButtonLink to={`${base}/check`} variant="primary">Next: check it</ButtonLink>
      </p>
    </div>
  );
}

import { Facts, Section } from "../design/components";
import { classificationFacts, useClassificationOptions } from "./classification";
import { ClassificationForm } from "./ClassificationForm";
import { useDocumentContext } from "./documentContext";

/**
 * What kind of document it is and what it is about (ADR-0123), on a page of its own so a
 * review starting or ending never takes the form away mid-edit. Its owner sets them from
 * the catalogue's own terms; anyone else reads them.
 */
export function ClassificationPage() {
  const { document, announce } = useDocumentContext();
  const options = useClassificationOptions();
  return (
    <div className="lib-stack">
      <Section title="Type and topics">
        <p className="lib-quiet">
          The library is filtered by them. Types and topics come from the catalogue in service: its document types and its business
          capabilities.
        </p>
        {document.is_owner ? (
          <ClassificationForm document={document} onDone={announce} />
        ) : (
          <Facts items={classificationFacts(document, options.data)} />
        )}
      </Section>
    </div>
  );
}

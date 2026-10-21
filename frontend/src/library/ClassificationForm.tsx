import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { type FormEvent, useState } from "react";

import { api, type LibraryDocument } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { ActionGroup, Button, Combobox, Lines, Select, Status } from "../design/components";
import { labelOf, useClassificationOptions } from "./classification";
import { documentKey } from "./useDocument";

/** The owner sets what kind of document it is and what it is about, from the catalogue's own terms. */
export function ClassificationForm({ document, onDone }: { document: LibraryDocument; onDone: (text: string) => void }) {
  const options = useClassificationOptions();
  const queryClient = useQueryClient();
  const [documentType, setDocumentType] = useState(document.document_type ?? "");
  const [topics, setTopics] = useState<string[]>(document.topics ?? []);
  const [round, setRound] = useState(0);
  // What the form opened with: reading moves the document's version on its own, which is no
  // reason to refuse the owner's edit unless the type or topics themselves changed meanwhile.
  const [opened] = useState(() => ({ type: document.document_type ?? null, topics: document.topics ?? [] }));
  const send = (version: number) => api.classify(document.id, { expected_version: version, document_type: documentType || null, topics });
  const save = useMutation({
    mutationFn: async () => {
      try {
        return await send(document.version);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
        const latest = await api.libraryDocument(document.id);
        const untouched = (latest.document_type ?? null) === opened.type && (latest.topics ?? []).join("\n") === opened.topics.join("\n");
        if (!untouched) throw new Error("Someone changed its type or topics meanwhile. Reload to see them, then choose again.");
        return send(latest.version);
      }
    },
    onSuccess: async (saved) => {
      queryClient.setQueryData(documentKey(document.id), saved);
      await queryClient.invalidateQueries({ queryKey: ["library", "documents"] });
      onDone("Its type and topics are saved.");
    },
  });
  const offered = options.data;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!save.isPending) save.mutate();
  };
  if (options.isError) return <p role="status"><Status tone="attention">{errorMessage(options.error)}</Status></p>;
  return (
    <form className="lib-classify" aria-label="Type and topics" onSubmit={submit}>
      <Select
        label="Type"
        hint={offered && !offered.document_types.length ? "The catalogue in service has no document types yet." : undefined}
        value={documentType}
        onChange={(event) => setDocumentType(event.target.value)}
      >
        <option value="">Not given</option>
        {offered?.document_types.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        {documentType && offered && !offered.document_types.some((item) => item.id === documentType) && (
          <option value={documentType}>{labelOf(offered, "document_types", documentType)}</option>
        )}
      </Select>
      {topics.length > 0 && (
        <Lines label="Its topics">
          {topics.map((id) => (
            <li key={id} className="lib-classify__topic">
              {labelOf(offered, "topics", id)}
              <Button variant="quiet" icon={<X size={14} />} aria-label={`Remove ${labelOf(offered, "topics", id)}`} onClick={() => setTopics(topics.filter((item) => item !== id))}>
                Remove
              </Button>
            </li>
          ))}
        </Lines>
      )}
      <Combobox
        key={round}
        label="Add a topic"
        hint={offered && !offered.topics.length ? "The catalogue in service has no business capability concepts yet." : "A business capability it is about."}
        options={(offered?.topics ?? []).filter((item) => !topics.includes(item.id))}
        placeholder="Find a capability"
        emptyText="No capability matches."
        onSelect={(option) => {
          setTopics([...topics, option.id]);
          setRound(round + 1);
        }}
      />
      <ActionGroup>
        <Button type="submit" variant="primary" busy={save.isPending}>{save.isPending ? "Saving…" : "Save type and topics"}</Button>
      </ActionGroup>
      {save.isError && <p role="status"><Status tone="attention">{errorMessage(save.error)}</Status></p>}
    </form>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Image as ImageIcon } from "lucide-react";

import { api } from "../../api/client";
import { errorMessage } from "../../api/errors";
import { Button, Status } from "../../design/components";

/** The passage in the original file, rendered by the service, on request ("o"). */
export function OriginalPreview({ documentId, versionId, blockId, where }: { documentId: string; versionId: string; blockId: string; where: string }) {
  const preview = useQuery({
    queryKey: ["library", "preview", versionId, blockId],
    queryFn: () => api.originalPreview(documentId, versionId, blockId),
    staleTime: Infinity,
    retry: false,
  });
  if (preview.isPending) return <p className="lib-quiet" role="status"><ImageIcon size={14} aria-hidden="true" /> Showing the original at {where}…</p>;
  if (preview.isError) {
    return (
      <p role="status">
        <Status tone="attention">Couldn't show the original: {errorMessage(preview.error)}</Status>{" "}
        <Button variant="link" onClick={() => void preview.refetch()}>Try again</Button>
      </p>
    );
  }
  return (
    <figure className="lib-original">
      {preview.data.image_data && <img src={preview.data.image_data} alt={`The original at ${where}`} />}
      <figcaption className="lib-quiet">{preview.data.explanation}</figcaption>
    </figure>
  );
}

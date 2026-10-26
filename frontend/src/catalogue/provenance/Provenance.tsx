/**
 * Provenance one step away (catalogue merge, step 6, PRODUCT.md principle 3): a
 * fact's source line opens the registered source it names, on Governance; a
 * quote opens the passage it was read in, re-read from the stored document with
 * its neighbours and the quoted words marked; and the document itself opens,
 * when the version holds it.
 */
import "./provenance.css";

import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useContext, useState } from "react";

import { api } from "../../api/client";
import { errorMessage } from "../../api/errors";
import { Button, EvidenceQuote, Status } from "../../design/components";
import { RouterLink } from "../../shell/links";
import { SourcesContext, namedSource, withLevel } from "../governance";
import { useCatalogueContext } from "../useCatalogue";

/** Where a registered source's record is, on Governance. */
export const sourceHref = (base: string, sourceId: string) => `${base}/governance/sources/${encodeURIComponent(sourceId)}`;

/**
 * The catalogue version's address, on a catalogue page; null elsewhere. The Explorer draws the
 * same sections for readers, who can't open Governance or the stored documents: there a source
 * stays a name.
 */
function useCatalogueBase(): string | null {
  const context = useCatalogueContext() as Partial<ReturnType<typeof useCatalogueContext>> | null | undefined;
  return context?.book && typeof context.base === "string" ? context.base : null;
}

/**
 * A fact's source line as the service read it, "BPP SDD (L2) §11": a link to the source's
 * record when it names a registered one, else the line as written.
 */
export function SourceName({ text }: { text: string | null | undefined }) {
  const register = useContext(SourcesContext);
  const base = useCatalogueBase();
  const said = withLevel(text, register);
  if (!said) return null;
  const source = namedSource(text, register);
  return source && base !== null ? <RouterLink href={sourceHref(base, source.id)}><bdi>{said}</bdi></RouterLink> : <bdi>{said}</bdi>;
}

/** A registered source by its id (the lab's evidence names it so): its name, as a link to its record. */
export function SourceById({ id, children }: { id: string; children?: ReactNode }) {
  const register = useContext(SourcesContext);
  const base = useCatalogueBase();
  const source = register.sources.get(id);
  if (!source || base === null) return <bdi>{children ?? source?.short ?? source?.title ?? id}</bdi>;
  return <RouterLink href={sourceHref(base, id)}><bdi>{children ?? source.short ?? source.title}</bdi></RouterLink>;
}

const IMAGE = /^image\//;

/**
 * Opens a stored document of the version in a new tab (a browser shows a PDF or an image;
 * other files download). The tab opens on the click, so a blocker lets it through, and is
 * pointed at the file once it has been read. Where tabs are blocked all the same, the file
 * downloads under its own name: the page itself never leaves the record.
 */
export function OpenDocument({ versionId, title }: { versionId: string; title: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const { book } = useCatalogueContext();
  const filename = book.release.documents.find((item) => item.id === versionId)?.filename ?? title;
  const open = async () => {
    setFailed(null);
    const tab = window.open("", "_blank");
    try {
      const file = await api.catalogueDocumentContent(versionId);
      const url = URL.createObjectURL(file);
      if (tab) tab.location.href = url;
      else {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      tab?.close();
      setFailed(errorMessage(error));
    }
  };
  return (
    <span className="prov-open">
      <Button variant="link" onClick={() => void open()}>
        Open the document{" "}
        <span className="ds-visually-hidden">{title}</span>
      </Button>
      {failed && <Status tone="attention">{failed}</Status>}
    </span>
  );
}

/**
 * Where a quote was read: "Show the passage" opens it in place, the passage the service
 * re-reads from the stored document with the passages either side, the quoted words marked.
 * An image has no passages: it shows the image.
 */
export function CitedPassage({ versionId, location, quote, title }: { versionId: string; location: string; quote?: string; title: string }) {
  const [open, setOpen] = useState(false);
  const { book } = useCatalogueContext();
  const document = book.release.documents.find((item) => item.id === versionId);
  return (
    <div className="prov-cited">
      <Button variant="link" aria-expanded={open} onClick={() => setOpen((on) => !on)}>
        {open ? "Hide the passage" : "Show the passage"}{" "}
        <span className="ds-visually-hidden">in {title}, {location}</span>
      </Button>
      {open && (
        <div className="prov-passage">
          {document && IMAGE.test(document.mime_type) ? (
            <CitedImage versionId={versionId} title={title} />
          ) : (
            <Passage releaseId={book.release.id} versionId={versionId} location={location} quote={quote} title={title} />
          )}
          {document && <OpenDocument versionId={versionId} title={title} />}
        </div>
      )}
    </div>
  );
}

function Passage({ releaseId, versionId, location, quote, title }: { releaseId: string; versionId: string; location: string; quote?: string; title: string }) {
  const passage = useQuery({
    queryKey: ["architecture", "releases", releaseId, "documents", versionId, "passage", location],
    queryFn: () => api.citedPassage(releaseId, versionId, location),
    staleTime: Infinity,
  });
  if (passage.isPending) return <span className="cat-quiet" role="status">Opening the passage…</span>;
  if (passage.isError) return <span role="status"><Status tone="attention">{errorMessage(passage.error)}</Status></span>;
  const plain = (text: string) => text.replace(/^#{1,6}\s+/gm, "").trim();
  return (
    <div className="prov-context">
      {passage.data.before.map((place) => (
        <p key={place.location} className="prov-context__near" dir="auto">{plain(place.text)}</p>
      ))}
      <EvidenceQuote text={plain(passage.data.passage.text)} quote={quote} source={<><bdi>{title}</bdi> · {passage.data.passage.location}</>} />
      {passage.data.after.map((place) => (
        <p key={place.location} className="prov-context__near" dir="auto">{plain(place.text)}</p>
      ))}
    </div>
  );
}

function CitedImage({ versionId, title }: { versionId: string; title: string }) {
  const image = useQuery({
    queryKey: ["architecture", "documents", versionId, "content"],
    queryFn: async () => URL.createObjectURL(await api.catalogueDocumentContent(versionId)),
    staleTime: Infinity,
  });
  if (image.isError) return <span role="status"><Status tone="attention">{errorMessage(image.error)}</Status></span>;
  return image.data ? <img className="prov-image" src={image.data} alt={`From ${title}`} /> : <span className="cat-quiet" role="status">Opening the image…</span>;
}

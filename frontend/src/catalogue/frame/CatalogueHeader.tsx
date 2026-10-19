import { useQuery } from "@tanstack/react-query";
import { Compass } from "lucide-react";
import type { ReactNode } from "react";

import { api, type Release } from "../../api/client";
import { Breadcrumbs, PageHeader, Status, SubNav } from "../../design/components";
import { count, formatDay } from "../../home/format";
import { ButtonLink, RouterLink } from "../../shell/links";
import { changeSentence } from "../catalogue";
import { useDraftAction } from "../draft/useDraftAction";
import { useChangeRequests } from "../inbox";
import { type CatalogueContext, useCatalogueContext, useMappingImpact } from "../useCatalogue";

/** A catalogue page, as its sub-navigation and its breadcrumb name it. */
export type CataloguePageId =
  | "systems" | "map" | "concepts" | "offerings" | "journeys" | "domains" | "channels" | "governance" | "versions" | "compare" | "evidence" | "golden";

const PAGE_LABEL: Record<CataloguePageId, string> = {
  systems: "Systems",
  map: "Map",
  concepts: "Concepts",
  offerings: "Offerings",
  journeys: "Journeys",
  domains: "Landscape",
  channels: "Channels",
  governance: "Governance",
  versions: "Versions",
  compare: "Compare versions",
  evidence: "A cited passage",
  golden: "Golden set report",
};

const PAGE_PATH: Partial<Record<CataloguePageId, string>> = {
  systems: "",
  map: "/map",
  concepts: "/concepts",
  offerings: "/offerings",
  journeys: "/journeys",
  domains: "/domains",
  channels: "/channels",
  governance: "/governance",
  golden: "/golden-set",
};

const versionName = (release: Release) => release.name || "Untitled version";

/** Where a catalogue page sits: Catalogue › (Versions › a version ›) the page (› a record). */
function catalogueCrumbs(context: Pick<CatalogueContext, "book" | "base" | "inService">, page: CataloguePageId, record?: string) {
  const { book, base, inService } = context;
  const items: { href?: string; label: string }[] = [{ href: "/architecture", label: "Catalogue" }];
  const ofVersions = page === "versions" || page === "compare";
  if (ofVersions || !inService) items.push({ href: "/architecture/versions", label: "Versions" });
  if (!ofVersions && !inService) items.push({ href: base, label: versionName(book.release) });
  if (page !== "versions") items.push({ href: page in PAGE_PATH ? `${base}${PAGE_PATH[page]}` : undefined, label: PAGE_LABEL[page] });
  if (record) items.push({ label: record });
  return items;
}

/**
 * Every catalogue page's head (redesign phase 5). A page of the version
 * (Systems, Concepts, …) is titled by its own name, the version and its state
 * beside it, with the version's pages as sub-navigation; a record page (an
 * offering, a journey) is titled by its record (UX rebuild, phase 1).
 */
export function CatalogueHeader({ page, chosen, record, children }: {
  page: CataloguePageId;
  /** A workbench page with a record chosen: its name, for the tab title and the breadcrumb. */
  chosen?: string;
  /** A record page: its title, lead, facts and actions. */
  record?: {
    name: string;
    title?: ReactNode;
    lead?: ReactNode;
    meta?: ReactNode;
    actions?: ReactNode;
  };
  /** Under the head: a state line or the page's own controls. */
  children?: ReactNode;
}) {
  const context = useCatalogueContext();
  const { book, base, inService } = context;
  const release = book.release;
  const draft = release.status === "draft";
  const name = versionName(release);
  const crumbs = <Breadcrumbs link={RouterLink} items={catalogueCrumbs(context, page, record?.name ?? chosen)} />;
  const where = inService ? "Catalogue" : name;
  const waiting = useWaitingRequests();
  // A draft in preparation is one action on the head, not a banner.
  const drafting = useDraftAction(draft ? release : undefined);
  if (record) {
    return (
      <>
        <PageHeader
          breadcrumbs={crumbs}
          title={record.title ?? <bdi>{record.name}</bdi>}
          documentTitle={`${record.name} · ${where}`}
          lead={record.lead}
          meta={record.meta}
          actions={record.actions || drafting ? <>{record.actions}{drafting}</> : undefined}
        >
          {children}
        </PageHeader>
      </>
    );
  }
  return (
    <>
      <PageHeader
        breadcrumbs={crumbs}
        title={PAGE_LABEL[page]}
        documentTitle={`${chosen ? `${chosen} · ` : ""}${PAGE_LABEL[page]} · ${inService ? "Architecture catalogue" : `${name} · Catalogue`}`}
        lead={
          page === "golden" ? (
            "How well the impact mapper agrees with the catalogue's hand-labelled answer key. A run scores a throwaway copy of the golden set's catalogue, never the live one."
          ) : (
            <>
              <Edition release={release} inService={inService} actorName={context.actorName} />
              {!inService && <>{" "}<Consequence release={release} /></>}
            </>
          )
        }
        meta={
          <>
            {inService ? <Status tone="done">In service</Status> : draft ? <Status tone="working">In preparation</Status> : <Status tone="stopped">Replaced</Status>}
            <bdi>{name}</bdi>
            {inService && <MappedEarlier />}
          </>
        }
        actions={
          inService || drafting ? (
            <>
              {drafting}
              {inService && <ButtonLink to="/explorer"><Compass size={16} aria-hidden="true" /> Open the explorer</ButtonLink>}
            </>
          ) : undefined
        }
      >
        <SubNav label="This catalogue" link={RouterLink} items={pages(base, page, inService, release, waiting)} />
        {children}
      </PageHeader>
    </>
  );
}

function pages(base: string, page: CataloguePageId, inService: boolean, release: Release, waiting: number) {
  return [
    { href: base, label: "Systems", current: page === "systems", count: release.systems.length },
    { href: `${base}/map`, label: "Map", current: page === "map" },
    { href: `${base}/concepts`, label: "Concepts", current: page === "concepts", count: release.business_capabilities?.length ?? 0 },
    { href: `${base}/offerings`, label: "Offerings", current: page === "offerings", count: release.products?.length ?? 0 },
    { href: `${base}/journeys`, label: "Journeys", current: page === "journeys", count: release.journeys?.length ?? 0 },
    { href: `${base}/domains`, label: "Landscape", current: page === "domains" },
    { href: `${base}/channels`, label: "Channels", current: page === "channels" },
    { href: `${base}/governance`, label: "Governance", current: page === "governance" },
    // Change requests from Requirement AI wait on Versions; the count is seen from every page.
    ...(inService
      ? [
          { href: "/architecture/versions", label: waiting ? `Versions · ${waiting} waiting` : "Versions", current: page === "versions" || page === "compare" },
          { href: "/architecture/golden-set", label: "Golden set", current: page === "golden" },
        ]
      : []),
  ];
}

function Edition({ release, inService, actorName }: { release: Release; inService: boolean; actorName: CatalogueContext["actorName"] }) {
  const name = <bdi>‘{versionName(release)}’</bdi>;
  if (release.status === "draft") {
    return <>A draft started by <bdi>{actorName(release.created_by)}</bdi>. Nothing in it reaches requirement work until it is published.</>;
  }
  const published = <>published by <bdi>{actorName(release.published_by)}</bdi> on {formatDay(release.published_at)}</>;
  if (inService) return <>The version in service, {name}, {published}. Requirement work maps to what you read here.</>;
  return <>Replaced: {published}; no longer in service. <RouterLink href="/architecture">Read the version in service</RouterLink></>;
}

/** Requirement work still mapped with an earlier version, when there is any. */
function MappedEarlier() {
  const outdated = useMappingImpact().data?.outdated_requirements ?? 0;
  if (!outdated) return null;
  return <Status tone="attention">{count(outdated, "requirement")} still mapped with an earlier version</Status>;
}

/** Shown on any other version: what putting it in service would change. */
function Consequence({ release }: { release: Release }) {
  const changes = useQuery({
    queryKey: ["architecture", "releases", release.id, "changes", release.revision],
    queryFn: () => api.releaseChanges(release.id),
  });
  if (!changes.data) return null;
  const sentence = changeSentence(changes.data);
  const verb = release.status === "draft" ? "Publishing it" : "Putting it back in service";
  return <span>{sentence ? `${verb} would ${sentence}.` : "Its contents match the version in service."}</span>;
}

/** Change requests from Requirement AI waiting on Versions: the count, seen from every page. */
function useWaitingRequests(): number {
  return (useChangeRequests().data ?? []).filter((item) => item.status === "waiting").length;
}

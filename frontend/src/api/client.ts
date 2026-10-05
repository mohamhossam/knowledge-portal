/**
 * The knowledge portal's API client, over `/knowledge-api` (ADR-0099).
 *
 * Every request carries the caller's credentials: a bearer token from the OIDC
 * provider, or the offline persona header. Changing who is signed in aborts
 * every request still in flight, so one person's answer never lands on
 * another's screen.
 */
import { ApiError, normalizeErrorDetail } from "./errors";
import type { components } from "./schema";

type Schemas = components["schemas"];
export type Actor = Schemas["ActorResponse"];
export type IdentityConfig = Schemas["IdentityConfigResponse"];
export type LibraryDocument = Schemas["LibraryView"];
export type LibraryVersion = Schemas["LibraryVersion"];
export type Publication = Schemas["Publication"];
export type IngestionStage = Schemas["IngestionStage"];
export type Release = Schemas["KnowledgeReleaseResponse"];
/** The version in service as the explorer reads it: content only, for anyone signed in. */
export type ExplorerRelease = Schemas["ExplorerReleaseResponse"];
export type CatalogueSuggestions = Schemas["CatalogueSuggestionsResponse"];
export type Organisation = Schemas["OrganisationResponse"];
export type OrganisationAuditEvent = Schemas["OrganisationAuditEventResponse"];
export type OriginalPreview = Schemas["OriginalPreview"];
export type ReferenceChunk = Schemas["ReferenceChunk"];
export type BuildPreview = Schemas["CorpusBuildPreview"];
export type DependencyPage = Schemas["LibraryDependencyPage"];
export type Dependency = Schemas["LibraryDependency"];
export type ImpactPage = Schemas["DependencyImpactPage"];
export type Impact = Schemas["DependencyImpact"];
export type OwnershipTransfer = Schemas["OwnershipTransfer"];
export type ReviewRequest = Schemas["LibraryReviewRequest"];
export type CatalogueSystem = Schemas["SystemDefinitionSchema"];
export type Relationship = Schemas["SystemRelationshipSchema"];
export type RelationshipKind = Schemas["RelationshipKind"];
export type LandscapeDomain = Schemas["LandscapeDomainSchema"];
export type CapabilityDomain = Schemas["CapabilityDomainSchema"];
export type Offering = Schemas["ProductOfferingSchema"];
export type Journey = Schemas["JourneySchema"];
/** Where orders are placed, and the system each is entered through. */
export type Channel = Schemas["ChannelSchema"];
export type JourneyActivity = Schemas["ActivitySchema"];
export type SourceConfidence = Schemas["SourceConfidence"];
export type ReleaseAuditEvent = Schemas["KnowledgeAuditEventResponse"];
export type CatalogueDiff = Schemas["CatalogueDiffResponse"];
export type MappingImpact = Schemas["MappingImpactResponse"];
export type SystemOwnership = Schemas["SystemOwnershipResponse"];
export type CatalogueFileFormat = Schemas["CatalogueFileFormat"];
export type Suggestion = Schemas["CatalogueSuggestionResponse"];
export type SuggestionContent = Schemas["CandidateContentSchema"];
export type SuggestionKind = Schemas["CandidateKind"];
export type SuggestionMatch = Schemas["CandidateMatch"];
export type PossibleMatch = Schemas["PossibleMatchResponse"];
export type ExtractionRun = Schemas["ExtractionRunResponse"];
export type ArchitectureJob = Schemas["ArchitectureJobResponse"];
export type DocumentExtraction = Schemas["DocumentExtractionResponse"];
export type CitedPassage = Schemas["DocumentPassageResponse"];
export type CatalogueDocument = Schemas["KnowledgeDocumentVersionResponse"];
export type DocumentLanguage = "en" | "ar" | "mixed";
export type Person = Schemas["PersonSchema"];
export type ValueStream = Schemas["ValueStreamSchema"];
export type OrgProduct = Schemas["ProductSchema"];
export type Squad = Schemas["SquadSchema"];
export type SampleRequirements = Schemas["SampleRequirementsResponse"];
export type SampleRequirement = Schemas["SampleRequirementSchema"];
export type ImpactComparison = Schemas["ImpactComparisonResponse"];
export type DraftUpdate = Schemas["DraftUpdateRequest"];
/** One passage the draft's index holds, cited as evidence for a system. */
export type Evidence = { id: string; source_label: string; location: string; text: string; document_version_id?: string | null };
/** What this draft would map a requirement to, with the evidence behind each system. */
export type ImpactPreview = {
  release_id: string;
  system_ids: string[];
  citation_ids: string[];
  citations: { system_id: string; chunk_id: string; quote: string }[];
  uncertainty: string | null;
  evidence: Evidence[];
};

const documentPath = (documentId: string) => `/library/documents/${encodeURIComponent(documentId)}`;
const versionPath = (documentId: string, versionId: string) =>
  `${documentPath(documentId)}/versions/${encodeURIComponent(versionId)}`;

const releasePath = (releaseId: string) => `/architecture-knowledge/releases/${encodeURIComponent(releaseId)}`;

const baseUrl = (import.meta.env.VITE_API_BASE ?? "/knowledge-api").replace(/\/$/, "");
let authorizationHeaders: () => Record<string, string> = () => ({});
let authenticationFailure: (() => void) | null = null;
let credentialSession = new AbortController();

export function configureAuthenticationHeaders(headers: () => Record<string, string>) {
  credentialSession.abort();
  credentialSession = new AbortController();
  authorizationHeaders = headers;
}

export function configureAuthentication(
  headers: () => Record<string, string>,
  onUnauthorized?: () => void,
) {
  configureAuthenticationHeaders(headers);
  if (onUnauthorized !== undefined) authenticationFailure = onUnauthorized;
}

function responseError(status: number, payload: unknown): ApiError {
  const value = typeof payload === "object" && payload !== null
    ? payload as Record<string, unknown>
    : {};
  return new ApiError(
    status,
    normalizeErrorDetail(payload, `Request failed with status ${status}.`),
    typeof value.code === "string" ? value.code : undefined,
    typeof value.correlation_id === "string" ? value.correlation_id : undefined,
  );
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  const session = credentialSession;
  const signal = init?.signal ? AbortSignal.any([session.signal, init.signal]) : session.signal;
  // A multipart body sets its own Content-Type, boundary included.
  const json = init?.body !== undefined && !(init.body instanceof FormData);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal,
      headers: { ...(json ? { "Content-Type": "application/json" } : {}), ...authorizationHeaders(), ...init?.headers },
    });
  } catch (error) {
    throw new ApiError(0, error instanceof Error ? error.message : "The knowledge service is unavailable.");
  }
  session.signal.throwIfAborted();
  if (!response.ok) {
    if (response.status === 401) authenticationFailure?.();
    const payload: unknown = await response.json().catch(() => null);
    throw responseError(response.status, payload);
  }
  return response;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const session = credentialSession;
  const result = (await (await send(path, init)).json()) as T;
  session.signal.throwIfAborted();
  return result;
}

const post = <T>(path: string, body: unknown) =>
  apiRequest<T>(path, { method: "POST", body: JSON.stringify(body) });

const PAGE = 100;

/** Every library document, page by page: the overview counts the whole library. */
async function allLibraryDocuments(): Promise<LibraryDocument[]> {
  const documents: LibraryDocument[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await apiRequest<LibraryDocument[]>(`/library/documents?offset=${offset}&limit=${PAGE}`);
    documents.push(...page);
    if (page.length < PAGE) return documents;
  }
}

export const api = {
  identityConfig: () => apiRequest<IdentityConfig>("/identity/config"),
  currentActor: () => apiRequest<Actor>("/identity/me"),
  /** Who is reading the explorer, admin or not (requirement-portal ADR-0101). */
  explorerReader: () => apiRequest<Actor>("/explorer/me"),
  explorerRelease: () => apiRequest<ExplorerRelease>("/explorer/release"),
  /** The admins the portal has seen sign in, to name who published or prepared something. */
  knownActors: () => apiRequest<Actor[]>("/identity/actors?limit=100"),
  libraryDocuments: allLibraryDocuments,
  releases: () => apiRequest<Release[]>("/architecture-knowledge/releases"),
  activeRelease: () => apiRequest<Release | null>("/architecture-knowledge/releases/active"),
  suggestions: (releaseId: string) =>
    apiRequest<CatalogueSuggestions>(
      `/architecture-knowledge/releases/${encodeURIComponent(releaseId)}/suggestions`,
    ),
  release: (releaseId: string) => apiRequest<Release>(releasePath(releaseId)),
  releaseAudit: (releaseId: string) => apiRequest<ReleaseAuditEvent[]>(`${releasePath(releaseId)}/audit`),
  /** What changed from the version in service to this one. */
  releaseChanges: (releaseId: string) => apiRequest<CatalogueDiff>(`${releasePath(releaseId)}/changes`),
  /** Puts a published version back in service. */
  activateRelease: (releaseId: string, rationale: string) =>
    post<Release>(`${releasePath(releaseId)}/activate`, { rationale }),
  catalogueFile: async (releaseId: string, format: CatalogueFileFormat) =>
    (await send(`${releasePath(releaseId)}/catalogue-file?format=${format}`)).blob(),
  /** Starts the one draft: a copy of the version in service. */
  createDraft: (name: string) => post<Release>("/architecture-knowledge/releases", { name }),
  renameDraft: (releaseId: string, body: { expected_revision: number; name: string }) =>
    apiRequest<Release>(`${releasePath(releaseId)}/name`, { method: "PUT", body: JSON.stringify(body) }),
  discardDraft: async (releaseId: string, expectedRevision: number) => {
    await send(releasePath(releaseId), { method: "DELETE", body: JSON.stringify({ expected_revision: expectedRevision }) });
  },
  addCatalogueDocument: (releaseId: string, input: { file: File; title: string; language: DocumentLanguage; expectedRevision: number }) => {
    const body = new FormData();
    body.set("file", input.file);
    body.set("title", input.title);
    body.set("language", input.language);
    body.set("expected_revision", String(input.expectedRevision));
    return apiRequest<Release>(`${releasePath(releaseId)}/documents`, { method: "POST", body });
  },
  /** The draft's documents, as the whole list that remains. */
  selectCatalogueDocuments: (releaseId: string, body: { expected_revision: number; version_ids: string[] }) =>
    apiRequest<Release>(`${releasePath(releaseId)}/documents`, { method: "PUT", body: JSON.stringify(body) }),
  readCatalogueDocument: (releaseId: string, versionId: string) =>
    apiRequest<ArchitectureJob>(`${releasePath(releaseId)}/documents/${encodeURIComponent(versionId)}/extractions`, { method: "POST" }),
  extractions: (releaseId: string) => apiRequest<DocumentExtraction[]>(`${releasePath(releaseId)}/extractions`),
  cancelJob: (jobId: string) =>
    apiRequest<ArchitectureJob>(`/architecture-knowledge/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" }),
  retryJob: (jobId: string) =>
    apiRequest<ArchitectureJob>(`/architecture-knowledge/jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST" }),
  citedPassage: (releaseId: string, versionId: string, location: string) =>
    apiRequest<CitedPassage>(
      `${releasePath(releaseId)}/documents/${encodeURIComponent(versionId)}/passage?${new URLSearchParams({ location })}`,
    ),
  catalogueDocumentContent: async (versionId: string) =>
    (await send(`/architecture-knowledge/documents/versions/${encodeURIComponent(versionId)}/content`)).blob(),
  decide: (releaseId: string, suggestionId: string, body: { expected_revision: number; accept: boolean; content?: SuggestionContent | null }) =>
    post<Release>(`${releasePath(releaseId)}/suggestions/${encodeURIComponent(suggestionId)}/decision`, body),
  acceptAll: (releaseId: string, expectedRevision: number) =>
    post<Schemas["AcceptAllResponse"]>(`${releasePath(releaseId)}/suggestions/acceptance`, { expected_revision: expectedRevision }),
  rejectMany: (releaseId: string, expectedRevision: number, suggestionIds: string[]) =>
    post<{ rejected: number }>(`${releasePath(releaseId)}/suggestions/rejection`, {
      expected_revision: expectedRevision,
      suggestion_ids: suggestionIds,
    }),
  /** The whole draft at once: systems and connections always; omitted lists are kept as they are. */
  saveDraft: (releaseId: string, body: DraftUpdate) =>
    apiRequest<Release>(releasePath(releaseId), { method: "PUT", body: JSON.stringify(body) }),
  saveSystem: (releaseId: string, systemId: string, body: { expected_revision: number; system: CatalogueSystem }) =>
    apiRequest<Release>(`${releasePath(releaseId)}/systems/${encodeURIComponent(systemId)}`, { method: "PUT", body: JSON.stringify(body) }),
  buildJob: (releaseId: string) => apiRequest<ArchitectureJob | null>(`${releasePath(releaseId)}/build`),
  buildRelease: (releaseId: string, expectedRevision: number) =>
    post<ArchitectureJob>(`${releasePath(releaseId)}/build`, { expected_revision: expectedRevision }),
  publish: (releaseId: string, body: { expected_revision: number; rationale: string }) =>
    post<Release>(`${releasePath(releaseId)}/publish`, body),
  samples: () => apiRequest<SampleRequirements>("/architecture-knowledge/sample-requirements"),
  saveSamples: (body: { expected_revision: number; items: SampleRequirement[] }) =>
    apiRequest<SampleRequirements>("/architecture-knowledge/sample-requirements", { method: "PUT", body: JSON.stringify(body) }),
  compareImpact: (releaseId: string, query: string) => post<ImpactComparison>(`${releasePath(releaseId)}/compare-impact`, { query }),
  previewImpact: (releaseId: string, query: string) => post<ImpactPreview>(`${releasePath(releaseId)}/preview-impact`, { query }),
  evidence: (releaseId: string, chunkId: string) =>
    apiRequest<Evidence>(`${releasePath(releaseId)}/evidence/${encodeURIComponent(chunkId)}`),
  catalogueTemplate: async () => (await send("/architecture-knowledge/catalogue-template.xlsx")).blob(),
  previewCatalogueFile: (releaseId: string, file: File) => {
    const body = new FormData();
    body.set("file", file);
    return apiRequest<CatalogueDiff>(`${releasePath(releaseId)}/catalogue-file/preview`, { method: "POST", body });
  },
  importCatalogueFile: (releaseId: string, file: File, expectedRevision: number) => {
    const body = new FormData();
    body.set("file", file);
    body.set("expected_revision", String(expectedRevision));
    return apiRequest<Release>(`${releasePath(releaseId)}/catalogue-file`, { method: "POST", body });
  },
  mappingImpact: () => apiRequest<MappingImpact>("/architecture-knowledge/mapping-impact"),
  systemOwnership: (systemId: string) =>
    apiRequest<SystemOwnership>(`/organisation/systems/${encodeURIComponent(systemId)}/ownership`),
  organisation: () => apiRequest<Organisation>("/organisation"),
  /** Saves one organisation record whole; a new one has no expected revision. Returns the whole catalogue. */
  saveOrganisation: (kind: "people" | "value-streams" | "products" | "squads", id: string, body: Record<string, unknown>, isNew: boolean) =>
    apiRequest<Organisation>(isNew ? `/organisation/${kind}` : `/organisation/${kind}/${encodeURIComponent(id)}`, {
      method: isNew ? "POST" : "PUT",
      body: JSON.stringify(body),
    }),
  removeOrganisation: (kind: "value-streams" | "products" | "squads", id: string, expectedRevision: number) =>
    apiRequest<Organisation>(`/organisation/${kind}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: JSON.stringify({ expected_revision: expectedRevision }),
    }),
  organisationAudit: () => apiRequest<OrganisationAuditEvent[]>("/organisation/audit"),

  // Library: one document and its curation. Every change names the version it saw.
  libraryDocument: (documentId: string) => apiRequest<LibraryDocument>(documentPath(documentId)),
  /** A new document, or a new version of one (with its id and the version the owner saw). */
  upload: (input: { file: File; title: string; documentId?: string; expectedVersion?: number }) => {
    const form = new FormData();
    form.append("file", input.file);
    form.append("title", input.title);
    form.append("idempotency_key", crypto.randomUUID());
    if (input.documentId) {
      form.append("document_id", input.documentId);
      form.append("expected_version", String(input.expectedVersion ?? 0));
    }
    return apiRequest<LibraryDocument>("/library/ingestions", { method: "POST", body: form });
  },
  review: (documentId: string, versionId: string, body: ReviewRequest) =>
    post<LibraryDocument>(`${versionPath(documentId, versionId)}/review`, body),
  approve: (documentId: string, versionId: string, body: { expected_version: number; revision_id: string; fingerprint: string }) =>
    post<LibraryDocument>(`${versionPath(documentId, versionId)}/approval`, body),
  withdraw: (documentId: string, body: { expected_version: number; reason: string }) =>
    post<LibraryDocument>(`${documentPath(documentId)}/withdrawal`, body),
  retry: (documentId: string, versionId: string, expectedVersion: number) =>
    post<LibraryDocument>(`${versionPath(documentId, versionId)}/retry`, { expected_version: expectedVersion }),
  cancel: (documentId: string, versionId: string, expectedVersion: number) =>
    post<LibraryDocument>(`${versionPath(documentId, versionId)}/cancellation`, { expected_version: expectedVersion }),
  originalPreview: (documentId: string, versionId: string, blockId: string) =>
    apiRequest<OriginalPreview>(`${versionPath(documentId, versionId)}/blocks/${encodeURIComponent(blockId)}/original-preview`),
  // Governance: how it is indexed for search, who relies on it, who owns it.
  chunkPreview: (documentId: string) => apiRequest<ReferenceChunk[]>(`${documentPath(documentId)}/chunks/preview`),
  buildPreview: (documentId: string) => apiRequest<BuildPreview>(`${documentPath(documentId)}/builds/preview`),
  build: (documentId: string, body: { expected_version: number; fingerprint: string; index_identity: string }) =>
    post<LibraryDocument>(`${documentPath(documentId)}/builds`, body),
  activate: (documentId: string, buildId: string, body: { expected_version: number; manifest: string }) =>
    post<LibraryDocument>(`${documentPath(documentId)}/builds/${encodeURIComponent(buildId)}/activation`, body),
  discard: (documentId: string, buildId: string, expectedVersion: number) =>
    post<LibraryDocument>(`${documentPath(documentId)}/builds/${encodeURIComponent(buildId)}/discard`, { expected_version: expectedVersion }),
  retryIndexing: (documentId: string, expectedVersion: number) =>
    post<LibraryDocument>(`${documentPath(documentId)}/index-retry`, { expected_version: expectedVersion }),
  dependencies: (documentId: string, offset: number) =>
    apiRequest<DependencyPage>(`${documentPath(documentId)}/dependencies?offset=${offset}&limit=50`),
  sourceImpact: (documentId: string, input: { offset: number; activeOnly: boolean; query: string }) =>
    apiRequest<ImpactPage>(`${documentPath(documentId)}/source-impact?${new URLSearchParams({
      offset: String(input.offset), limit: "50", active_only: String(input.activeOnly), query: input.query,
    })}`),
  ownershipHistory: (documentId: string) => apiRequest<OwnershipTransfer[]>(`${documentPath(documentId)}/ownership/history`),
  transfer: (documentId: string, body: { expected_version: number; actor_id: string; reason: string }) =>
    post<OwnershipTransfer>(`${documentPath(documentId)}/ownership`, body),
  findActors: (query: string) =>
    apiRequest<Actor[]>(`/identity/actors?${new URLSearchParams({ q: query, limit: "20" })}`),
  search: (query: string) => post<ReferenceChunk[]>("/knowledge/search", { query }),
  /** The uploaded file itself, for the owner to compare against. */
  original: async (documentId: string, versionId: string) =>
    (await send(`${versionPath(documentId, versionId)}/original`)).blob(),
};

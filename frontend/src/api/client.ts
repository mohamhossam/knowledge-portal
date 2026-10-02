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
export type CatalogueSuggestions = Schemas["CatalogueSuggestionsResponse"];
export type Organisation = Schemas["OrganisationResponse"];
export type OrganisationAuditEvent = Schemas["OrganisationAuditEventResponse"];
export type OriginalPreview = Schemas["OriginalPreview"];
export type ReviewRequest = Schemas["LibraryReviewRequest"];

const documentPath = (documentId: string) => `/library/documents/${encodeURIComponent(documentId)}`;
const versionPath = (documentId: string, versionId: string) =>
  `${documentPath(documentId)}/versions/${encodeURIComponent(versionId)}`;

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
  /** The admins the portal has seen sign in, to name who published or prepared something. */
  knownActors: () => apiRequest<Actor[]>("/identity/actors?limit=100"),
  libraryDocuments: allLibraryDocuments,
  releases: () => apiRequest<Release[]>("/architecture-knowledge/releases"),
  activeRelease: () => apiRequest<Release | null>("/architecture-knowledge/releases/active"),
  suggestions: (releaseId: string) =>
    apiRequest<CatalogueSuggestions>(
      `/architecture-knowledge/releases/${encodeURIComponent(releaseId)}/suggestions`,
    ),
  organisation: () => apiRequest<Organisation>("/organisation"),
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
  /** The uploaded file itself, for the owner to compare against. */
  original: async (documentId: string, versionId: string) =>
    (await send(`${versionPath(documentId, versionId)}/original`)).blob(),
};

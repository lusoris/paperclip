import { api } from "./client";

/**
 * Company-level Artifacts client (PAP-10359).
 *
 * Talks to the company-scoped artifacts projection endpoint
 * (`GET /api/companies/:companyId/artifacts`) defined by the approved
 * Artifacts plan (PAP-10353). The endpoint flattens agent-produced issue
 * documents, direct attachments, and `artifact` work products into a single
 * card-ready list so the UI never has to stitch issue-specific endpoints
 * together.
 *
 * The `CompanyArtifact` shape below is the shared contract from the plan. The
 * backend projection task (PAP-10358) is expected to expose the same fields
 * (and may also publish them through `@paperclipai/shared`); keeping a local
 * definition lets the frontend build and test against the contract
 * independently.
 */

export type ArtifactSource = "document" | "attachment" | "work_product";

export type ArtifactMediaKind = "image" | "video" | "text" | "document" | "file" | "empty";

export interface CompanyArtifactIssue {
  id: string;
  identifier: string;
  title: string;
}

export interface CompanyArtifactProject {
  id: string;
  name: string;
}

export interface CompanyArtifactAgent {
  id: string;
  name: string;
}

export interface CompanyArtifact {
  id: string;
  source: ArtifactSource;
  mediaKind: ArtifactMediaKind;
  title: string;
  previewText: string | null;
  contentType: string | null;
  contentPath: string | null;
  openPath: string | null;
  downloadPath: string | null;
  issue: CompanyArtifactIssue;
  project: CompanyArtifactProject | null;
  createdByAgent: CompanyArtifactAgent | null;
  updatedAt: string;
  /** Board-relative or prefixed link to the artifact inside its issue context. */
  href: string;
}

export interface CompanyArtifactsResponse {
  artifacts: CompanyArtifact[];
  nextCursor: string | null;
}

export type ArtifactKindFilter = ArtifactMediaKind | "all";

export interface ListArtifactsParams {
  kind?: ArtifactKindFilter;
  projectId?: string;
  q?: string;
  limit?: number;
  cursor?: string;
}

function buildArtifactsQuery(params?: ListArtifactsParams): string {
  const search = new URLSearchParams();
  if (params?.kind && params.kind !== "all") search.set("kind", params.kind);
  if (params?.projectId) search.set("projectId", params.projectId);
  if (params?.q) search.set("q", params.q);
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Normalize the endpoint response. The contract is an envelope
 * (`{ artifacts, nextCursor }`), but we also tolerate a bare array so the page
 * keeps working if the backend ships the simpler shape.
 */
function normalizeArtifactsResponse(
  raw: CompanyArtifactsResponse | CompanyArtifact[],
): CompanyArtifactsResponse {
  if (Array.isArray(raw)) {
    return { artifacts: raw, nextCursor: null };
  }
  return { artifacts: raw.artifacts ?? [], nextCursor: raw.nextCursor ?? null };
}

export const artifactsApi = {
  list: async (companyId: string, params?: ListArtifactsParams): Promise<CompanyArtifactsResponse> => {
    const raw = await api.get<CompanyArtifactsResponse | CompanyArtifact[]>(
      `/companies/${companyId}/artifacts${buildArtifactsQuery(params)}`,
    );
    return normalizeArtifactsResponse(raw);
  },
};

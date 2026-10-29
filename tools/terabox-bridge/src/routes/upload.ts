export const UPLOAD_PROTOCOL = {
  create: "POST /api/uploads",
  receivePart: "PATCH /api/uploads/:uploadId (X-Chunk-Index, Content-Length)",
  progress: "GET /api/uploads/:uploadId",
  complete: "POST /api/uploads/:uploadId/complete",
  cancel: "DELETE /api/uploads/:uploadId",
} as const;

export interface UploadRouteMatch {
  uploadId: string;
  action: "progress" | "complete" | "cancel" | "part";
}

export function matchUploadRoute(
  pathname: string,
  method: string,
): UploadRouteMatch | null {
  const match = /^\/api\/uploads\/([0-9a-f-]+)(?:\/(complete))?$/i.exec(
    pathname,
  );
  if (!match) return null;
  const action = match[2];
  if (action === "complete" && method === "POST") {
    return { uploadId: match[1], action: "complete" };
  }
  if (!action && method === "GET") {
    return { uploadId: match[1], action: "progress" };
  }
  if (!action && method === "PATCH") {
    return { uploadId: match[1], action: "part" };
  }
  if (!action && method === "DELETE") {
    return { uploadId: match[1], action: "cancel" };
  }
  return null;
}

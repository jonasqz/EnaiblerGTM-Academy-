import { getDb } from "@/db/client";
import { sessionFor } from "@/server/access";
import { fileUrl, storeFile, UploadRejected, type StoreIssue } from "@/server/files";
import { isPlatformHost } from "@/server/platform/config";
import { rateLimit } from "@/server/rate-limit";
import { storageConfigured } from "@/server/storage";
import { resolveTenant } from "@/server/tenant-resolver";
import { authorizeUpload, isUploadPurpose } from "@/server/uploads";

/**
 * File uploads: the raw file is the request body, its name is in
 * `x-file-name`. This path is excluded from src/proxy.ts, which would buffer
 * the body (and cut it off at 10 MB); the academy is resolved here instead.
 */

const HOUR = 60 * 60_000;

const STATUS: Record<StoreIssue, number> = {
  unknown_type: 415,
  type_not_allowed: 415,
  too_large: 413,
  invalid_content: 422,
};

const json = (body: Record<string, unknown>, status: number) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  const host = request.headers.get("host");
  const tenant = isPlatformHost(host) ? null : await resolveTenant(host);
  if (!tenant || tenant.status !== "active") return json({ error: "not_found" }, 404);

  const params = new URL(request.url).searchParams;
  const purpose = params.get("purpose");
  if (!isUploadPurpose(purpose)) return json({ error: "invalid_purpose" }, 400);
  const session = await sessionFor(tenant);
  if (!session) return json({ error: "sign_in" }, 401);
  if (!storageConfigured()) return json({ error: "storage_unavailable" }, 503);

  const authorized = await authorizeUpload(session, purpose, params);
  if ("error" in authorized) return json({ error: authorized.error }, authorized.status);
  const { quotaLimited, ...grant } = authorized;
  // Over the academy's video storage, "too large" means "no room left".
  const tooLarge = quotaLimited ? "storage_quota" : "too_large";
  const studio = grant.status === "attached" || purpose === "video";
  if (!rateLimit(`upload:${tenant.id}:${session.viewer.userId}`, studio ? 300 : 60, HOUR)) {
    return json({ error: "rate_limited" }, 429);
  }
  const declared = Number(request.headers.get("content-length") ?? "");
  if (grant.maxBytes && Number.isFinite(declared) && declared > grant.maxBytes) {
    return json({ error: tooLarge }, 413);
  }
  if (!request.body) return json({ error: "empty" }, 400);

  let name = "file";
  try {
    name = decodeURIComponent(request.headers.get("x-file-name") ?? "file");
  } catch {
    // keep the default name
  }

  try {
    const file = await storeFile(getDb(), tenant.id, { ...grant, body: request.body, name });
    return json(
      {
        id: file.id,
        name: file.name,
        contentType: file.contentType,
        size: file.sizeBytes,
        url: fileUrl(file),
      },
      201,
    );
  } catch (error) {
    if (error instanceof UploadRejected) {
      const issue = error.issue === "too_large" ? tooLarge : error.issue;
      return json({ error: issue, detail: error.message }, STATUS[error.issue]);
    }
    console.error("[uploads] storing a file failed", error);
    return json({ error: "storage_failed" }, 502);
  }
}

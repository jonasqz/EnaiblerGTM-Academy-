import { credentialImportSchema } from "@/core/credentials/import";
import { getDb } from "@/db/client";
import { authenticateApiKey } from "@/server/api-keys";
import { importCredentials } from "@/server/credentials/import";
import { rateLimit } from "@/server/rate-limit";
import { getTenant } from "@/server/request";

const MAX_BODY = 2 * 1024 * 1024;

/**
 * Credential import (brief §6): POST the credentials an academy issued on
 * another platform, with an API key from Studio → Settings → Integrations.
 * The academy is the one whose domain is called.
 */
export async function POST(request: Request): Promise<Response> {
  const tenant = await getTenant();
  const keyId = await authenticateApiKey(
    getDb(),
    tenant.id,
    request.headers.get("authorization"),
    "credentials.import",
  );
  if (!keyId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`import:${keyId}`, 60, 60 * 60_000)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return Response.json({ error: "too_large" }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = credentialImportSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 50)
      .map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    return Response.json({ error: "invalid", issues }, { status: 400 });
  }
  const results = await importCredentials(getDb(), tenant, parsed.data.credentials);
  const count = (status: string) => results.filter((result) => result.status === status).length;
  return Response.json({
    imported: count("imported"),
    existing: count("exists"),
    failed: count("failed"),
    results,
  });
}

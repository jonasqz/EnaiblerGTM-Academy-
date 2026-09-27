import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";

import type { Database } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";

/*
 * API keys for an academy's own tools. Shown once, stored as a SHA-256 hash
 * (the key is random, so a fast hash is enough), bound to one academy and to
 * the scopes they were made for.
 */

export const API_SCOPES = ["credentials.import"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

const hash = (key: string) => createHash("sha256").update(key).digest("hex");

export async function createApiKey(
  db: Database,
  tenantId: string,
  input: { name: string; scopes: ApiScope[]; createdBy: string },
): Promise<{ id: string; key: string }> {
  const key = `enk_${randomBytes(24).toString("base64url")}`;
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .insert(apiKeys)
      .values({
        tenantId,
        name: input.name.trim().slice(0, 80) || "API key",
        prefix: key.slice(0, 12),
        keyHash: hash(key),
        scopes: input.scopes,
        createdBy: input.createdBy,
      })
      .returning({ id: apiKeys.id }),
  );
  return { id: row!.id, key };
}

export async function listApiKeys(db: Database, tenantId: string) {
  return withTenant(db, tenantId, (tx) =>
    tx
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        scopes: apiKeys.scopes,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
      })
      .from(apiKeys)
      .where(isNull(apiKeys.revokedAt))
      .orderBy(desc(apiKeys.createdAt)),
  );
}

export async function revokeApiKey(db: Database, tenantId: string, id: string): Promise<void> {
  await withTenant(db, tenantId, (tx) =>
    tx.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id)),
  );
}

/** The key's id if it is a live key of this academy with the scope; notes its use. */
export async function authenticateApiKey(
  db: Database,
  tenantId: string,
  authorization: string | null,
  scope: ApiScope,
): Promise<string | null> {
  const key = authorization?.match(/^Bearer\s+(enk_[A-Za-z0-9_-]{20,})$/)?.[1];
  if (!key) return null;
  return withTenant(db, tenantId, async (tx) => {
    const [row] = await tx
      .select({ id: apiKeys.id, scopes: apiKeys.scopes })
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, hash(key)), isNull(apiKeys.revokedAt)));
    if (!row || !row.scopes.includes(scope)) return null;
    await tx.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
    return row.id;
  });
}

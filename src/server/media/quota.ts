import { eq, sql } from "drizzle-orm";

import {
  parseQuotaDefault,
  quotaAdmits,
  quotaFromColumn,
  quotaStatus,
  quotaToColumn,
  type QuotaSetting,
  type QuotaStatus,
} from "@/core/media/quota";
import type { Database, Queryable } from "@/db/client";
import { files, mediaAssets, tenants } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";

/*
 * Video storage per academy (core/media/quota). Uploads and transcodes ask
 * first; the operator sets the quota with `npm run academy -- storage`. The
 * worker, the upload route and the scripts use this module, hence no
 * "server-only".
 */

/** Read by name, not through env(): the worker and the scripts have no auth secret. */
export function mediaQuotaDefault(): number | null {
  return parseQuotaDefault(process.env.MEDIA_STORAGE_QUOTA_GB);
}

/** tenants is global: the operator's setting is read without a tenant context. */
async function settingOf(db: Queryable, tenantId: string): Promise<QuotaSetting> {
  const [row] = await db
    .select({ quota: tenants.mediaStorageQuotaBytes })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  return quotaFromColumn(row?.quota ?? null);
}

/** Originals of the media library plus the renditions and posters made from them. */
export async function mediaBytesUsed(db: Database, tenantId: string): Promise<number> {
  return withTenant(db, tenantId, async (tx) => {
    const [originals] = await tx
      .select({ bytes: sql`coalesce(sum(${files.sizeBytes}), 0)`.mapWith(Number) })
      .from(files)
      .where(eq(files.purpose, "video"));
    const [renditions] = await tx
      .select({ bytes: sql`coalesce(sum(${mediaAssets.hlsBytes}), 0)`.mapWith(Number) })
      .from(mediaAssets);
    return (originals?.bytes ?? 0) + (renditions?.bytes ?? 0);
  });
}

export async function mediaQuotaStatus(db: Database, tenantId: string): Promise<QuotaStatus> {
  return quotaStatus({
    setting: await settingOf(db, tenantId),
    platformDefaultBytes: mediaQuotaDefault(),
    usedBytes: await mediaBytesUsed(db, tenantId),
  });
}

/** Whether `addingBytes` more video fit into the academy's quota. */
export async function admitMediaBytes(
  db: Database,
  tenantId: string,
  addingBytes: number,
): Promise<boolean> {
  const status = await mediaQuotaStatus(db, tenantId);
  return quotaAdmits(status.usedBytes, addingBytes, status.quotaBytes);
}

export interface AcademyMediaQuota extends QuotaStatus {
  slug: string;
}

/** For the operator's CLI: the academy's quota and what it uses; null for an unknown slug. */
export async function readMediaQuota(
  db: Database,
  slug: string,
): Promise<AcademyMediaQuota | null> {
  const [row] = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.slug, slug));
  return row ? { slug: row.slug, ...(await mediaQuotaStatus(db, row.id)) } : null;
}

/** For the operator's CLI: gigabytes, "unlimited" or "default"; applies to the next upload. */
export async function setMediaQuota(
  db: Database,
  slug: string,
  setting: QuotaSetting,
): Promise<AcademyMediaQuota | null> {
  const [row] = await db
    .update(tenants)
    .set({ mediaStorageQuotaBytes: quotaToColumn(setting) })
    .where(eq(tenants.slug, slug))
    .returning({ id: tenants.id });
  return row ? readMediaQuota(db, slug) : null;
}

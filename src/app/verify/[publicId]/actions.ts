"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { normalizePublicId } from "@/core/credentials/public-id";
import { getDb } from "@/db/client";
import { credentials } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { getViewer } from "@/server/auth";
import { trackEvent } from "@/server/events";
import { getLocale, getTenant } from "@/server/request";

/** Private by default, public by choice, and private again at any time (brief §3, §6). */
export async function setCredentialVisibility(formData: FormData): Promise<void> {
  const tenant = await getTenant();
  const viewer = await getViewer(tenant);
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""));
  const visibility = formData.get("visibility") === "public" ? "public" : "private";
  if (!viewer || !publicId) return;

  const locale = await getLocale();
  await withTenant(getDb(), tenant.id, async (tx) => {
    const [updated] = await tx
      .update(credentials)
      .set({ visibility, ...(visibility === "public" ? { madePublicAt: new Date() } : {}) })
      .where(and(eq(credentials.publicId, publicId), eq(credentials.userId, viewer.userId)))
      .returning({ courseId: credentials.courseId, pathId: credentials.pathId });
    if (updated && visibility === "public") {
      await trackEvent(tx, {
        tenantId: tenant.id,
        name: "credential_made_public",
        userId: viewer.userId,
        courseId: updated.courseId,
        pathId: updated.pathId,
        locale,
      });
    }
  });
  revalidatePath(`/verify/${publicId}`);
}

"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { normalizePublicId } from "@/core/credentials/public-id";
import { getDb } from "@/db/client";
import { credentials } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { getViewer } from "@/server/auth";
import { saveShowcase, SHOWCASE_MAX_TEXT } from "@/server/credentials/showcase";
import { trackEvent } from "@/server/events";
import { getLocale, getTenant, getTranslator } from "@/server/request";

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
      .where(
        and(
          eq(credentials.publicId, publicId),
          eq(credentials.userId, viewer.userId),
          // A public credential needs the learner's name on it.
          visibility === "public" ? ne(credentials.displayName, "") : undefined,
        ),
      )
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
  revalidatePath("/me");
}

export type ShowcaseState = { status: "idle" | "saved" } | { status: "error"; message: string };

/** The learner's excerpt on their credential page (features.showcase). */
export async function saveShowcaseAction(
  _: ShowcaseState,
  formData: FormData,
): Promise<ShowcaseState> {
  const tenant = await getTenant();
  const viewer = await getViewer(tenant);
  const t = await getTranslator();
  if (!viewer || !tenant.settings.features.showcase) {
    return { status: "error", message: t.t("error.notFound") };
  }
  const publicId = String(formData.get("publicId") ?? "");
  const result = await saveShowcase(getDb(), tenant, {
    userId: viewer.userId,
    publicId,
    showcase:
      formData.get("remove") === "1"
        ? null
        : {
            text: String(formData.get("text") ?? ""),
            fileIds: formData.getAll("pictures").map(String),
          },
  });
  if (!result.ok) {
    const message =
      result.error === "wording"
        ? t.t("showcase.wording")
        : result.error === "too_long"
          ? t.t("showcase.tooLong", { max: SHOWCASE_MAX_TEXT })
          : t.t("upload.errorFailed", { name: "" }).trim();
    return { status: "error", message };
  }
  revalidatePath(`/verify/${publicId}`);
  return { status: "saved" };
}

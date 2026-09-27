"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { normalizePublicId } from "@/core/credentials/public-id";
import { getDb } from "@/db/client";
import { credentials } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { requireViewer } from "@/server/access";
import { getViewer } from "@/server/auth";
import { saveShowcase, SHOWCASE_MAX_TEXT } from "@/server/credentials/showcase";
import { trackEvent } from "@/server/events";
import { setContactOptIn, setDisplayName } from "@/server/profile";
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

/** The name on the credential, set right where the learner is about to share it. */
export async function saveCredentialNameAction(formData: FormData): Promise<void> {
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""));
  const { tenant, viewer } = await requireViewer(publicId ? `/verify/${publicId}` : "/me");
  const name = String(formData.get("displayName") ?? "");
  // Shown exactly as entered (brief §4); an empty field never clears a name.
  if (name.trim()) await setDisplayName(getDb(), tenant, viewer.userId, name);
  if (publicId) revalidatePath(`/verify/${publicId}`);
  revalidatePath("/me");
}

/**
 * Lead handoff from the share panel (brief §9): the same separate opt-in as
 * on "My learning", stored with the exact wording the learner agreed to.
 * Unticked, nothing changes.
 */
export async function agreeToContactAction(formData: FormData): Promise<void> {
  const publicId = normalizePublicId(String(formData.get("publicId") ?? ""));
  const back = publicId ? `/verify/${publicId}` : "/me";
  const { tenant, viewer } = await requireViewer(back);
  if (formData.get("optIn") !== "on") redirect(`${back}#share`);
  const t = await getTranslator();
  const wording = t.t("me.contactLabel", { academy: tenant.settings.author_display_name });
  await setContactOptIn(getDb(), tenant, viewer.userId, true, wording);
  revalidatePath("/me");
  redirect(`${back}?contact=saved#share`);
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

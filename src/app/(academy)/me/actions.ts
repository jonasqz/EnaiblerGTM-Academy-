"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { requireViewer } from "@/server/access";
import { authFor } from "@/server/auth";
import { startNewsOptIn, withdrawMarketingConsent } from "@/server/consent";
import { deleteMyData, setContactOptIn, setDisplayName } from "@/server/profile";
import { getTranslator } from "@/server/request";

export async function saveDisplayNameAction(formData: FormData): Promise<void> {
  const { tenant, viewer } = await requireViewer("/me");
  await setDisplayName(getDb(), tenant, viewer.userId, String(formData.get("displayName") ?? ""));
  revalidatePath("/me");
}

export async function saveContactOptInAction(formData: FormData): Promise<void> {
  const { tenant, viewer } = await requireViewer("/me");
  const t = await getTranslator();
  const optIn = formData.get("optIn") === "on";
  // Store the exact wording the learner agreed to.
  const wording = t.t("me.contactLabel", { academy: tenant.settings.author_display_name });
  await setContactOptIn(getDb(), tenant, viewer.userId, optIn, wording);
  revalidatePath("/me");
}

/** Marketing mail: double opt-in (brief §9). The click in the mailed link confirms. */
export async function subscribeNewsAction(formData: FormData): Promise<void> {
  if (formData.get("agree") !== "on") redirect("/me#news");
  const { tenant, viewer } = await requireViewer("/me");
  const started = await startNewsOptIn(getDb(), tenant, viewer, await getTranslator());
  redirect(started === "failed" ? "/me?news=failed#news" : "/me?news=sent#news");
}

export async function unsubscribeNewsAction(): Promise<void> {
  const { tenant, viewer } = await requireViewer("/me");
  await withdrawMarketingConsent(getDb(), tenant.id, viewer.userId);
  revalidatePath("/me");
  redirect("/me#news");
}

export async function deleteMyDataAction(formData: FormData): Promise<void> {
  if (formData.get("confirm") !== "on") redirect("/me#data");
  const { tenant, viewer } = await requireViewer("/me");
  const requestHeaders = await headers();
  const { accountDeleted } = await deleteMyData(getDb(), tenant, viewer.userId);
  if (!accountDeleted)
    await authFor(tenant)
      .api.signOut({ headers: requestHeaders })
      .catch(() => undefined);
  redirect("/");
}

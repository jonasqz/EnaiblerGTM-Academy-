"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { requireViewer } from "@/server/access";
import { authFor } from "@/server/auth";
import {
  requestMarketingConsent,
  sendMarketingConfirmation,
  withdrawMarketingConsent,
} from "@/server/consent";
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
  const t = await getTranslator();
  // Store the exact wording the learner agreed to.
  const wording = t.t("me.newsLabel", { academy: tenant.settings.author_display_name });
  const request = await requestMarketingConsent(getDb(), tenant.id, viewer.userId, wording);
  if (request.status === "confirmation_needed") {
    try {
      await sendMarketingConfirmation(tenant, {
        to: viewer.email,
        token: request.token,
        locale: t.locale,
      });
    } catch (error) {
      console.error("[consent] confirmation mail failed", error);
      // Nothing was confirmed and no link arrived: back to the start, so a retry sends at once.
      await withdrawMarketingConsent(getDb(), tenant.id, viewer.userId);
      redirect("/me?news=failed#news");
    }
  }
  redirect("/me?news=sent#news");
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

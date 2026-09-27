"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { requireViewer } from "@/server/access";
import { authFor } from "@/server/auth";
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

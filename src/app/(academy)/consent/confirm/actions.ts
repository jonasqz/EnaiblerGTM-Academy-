"use server";

import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { confirmMarketingConsent } from "@/server/consent";
import { getTenant } from "@/server/request";

/** The click that confirms the double opt-in; the token leaves the address bar afterwards. */
export async function confirmNewsAction(formData: FormData): Promise<void> {
  const tenant = await getTenant();
  const token = String(formData.get("token") ?? "");
  const confirmed = token ? await confirmMarketingConsent(getDb(), tenant.id, token) : false;
  redirect(`/consent/confirm?done=${confirmed ? "1" : "0"}`);
}

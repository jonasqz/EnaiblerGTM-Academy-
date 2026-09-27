"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";

import { continueUrl } from "@/components/entry-links";
import { decodeEntryContext, safeNextPath, type EntryContext } from "@/core/entry/context";
import type { TenantContext } from "@/core/tenant/context";
import { getDb } from "@/db/client";
import { memberships, user } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { authFor } from "@/server/auth";
import { trackEvent } from "@/server/events";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { getTenant, getTranslator } from "@/server/request";

export type SignInState =
  { status: "idle" } | { status: "sent"; email: string } | { status: "error"; message: string };

const TEN_MINUTES = 10 * 60_000;

/** `signup_started` only for people who are not yet learners of this academy. */
async function recordSignupStarted(
  tenant: TenantContext,
  email: string,
  locale: string,
  entry: EntryContext,
) {
  const db = getDb();
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  await withTenant(db, tenant.id, async (tx) => {
    if (existing) {
      const member = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(eq(memberships.userId, existing.id));
      if (member.length > 0) return;
    }
    await trackEvent(tx, { tenantId: tenant.id, name: "signup_started", locale, entry });
  });
}

export async function requestMagicLink(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const tenant = await getTenant();
  const t = await getTranslator();
  const failure: SignInState = { status: "error", message: t.t("signIn.error") };

  const email = z.email().safeParse(
    String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
  );
  if (!email.success) return failure;

  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders);
  if (
    !rateLimit(`magic-ip:${ip}`, 20, TEN_MINUTES) ||
    !rateLimit(`magic:${tenant.id}:${email.data}`, 5, TEN_MINUTES)
  ) {
    return failure;
  }

  const entry = decodeEntryContext(String(formData.get("ctx") ?? "")) ?? {};
  try {
    await authFor(tenant).api.signInMagicLink({
      body: {
        email: email.data,
        callbackURL: continueUrl(entry, safeNextPath(String(formData.get("next") ?? ""))),
        errorCallbackURL: "/sign-in",
        metadata: { locale: t.locale },
      },
      headers: requestHeaders,
    });
    await recordSignupStarted(tenant, email.data, t.locale, entry);
  } catch (error) {
    console.error("[sign-in] magic link failed", error);
    return failure;
  }
  return { status: "sent", email: email.data };
}

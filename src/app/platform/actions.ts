"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";

import { continueUrl } from "@/components/entry-links";
import { isLocale, SUPPORTED_LOCALES, type Locale } from "@/core/i18n/locales";
import { platformText, type PlatformMessageKey } from "@/core/i18n/platform-messages";
import { getDb } from "@/db/client";
import { authFor } from "@/server/auth";
import { createAcademy } from "@/server/platform/academies";
import { academyOrigin, platformConfig } from "@/server/platform/config";
import { acceptedDocuments, signupOpen } from "@/server/platform/legal";
import { notifyNewAcademy } from "@/server/platform/notices";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { getLocale } from "@/server/request";

export type SignupField = "name" | "slug" | "email" | "website" | "accept";

export type SignupState =
  | { status: "idle" }
  | { status: "sent"; email: string; url: string }
  | { status: "error"; fields: Partial<Record<SignupField, string>>; message?: string };

const HOUR = 60 * 60_000;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** "acme.com" → "https://acme.com"; null when it is not a plausible public website. */
function websiteUrl(input: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) return null;
    url.protocol = "https:";
    return url.toString();
  } catch {
    return null;
  }
}

/** Self-serve signup: creates the academy, then sends a sign-in link into its Studio. */
export async function createAcademyAction(
  _previous: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const locale = await getLocale();
  const t = platformText(locale);
  const config = platformConfig();
  if (!config || !(await signupOpen(config))) {
    return { status: "error", fields: {}, message: t("unavailable") };
  }
  const fail = (
    fields: Partial<Record<SignupField, PlatformMessageKey>>,
    message?: PlatformMessageKey,
  ) => ({
    status: "error" as const,
    fields: Object.fromEntries(Object.entries(fields).map(([field, key]) => [field, t(key)])),
    ...(message ? { message: t(message) } : {}),
  });

  const email = z.email().safeParse(text(formData, "email").toLowerCase());
  const name = text(formData, "name");
  const slug = text(formData, "slug").toLowerCase();
  const websiteInput = text(formData, "website");
  const website = websiteInput ? websiteUrl(websiteInput) : null;

  // Bots fill every field; people never see this one.
  if (text(formData, "fax")) return { status: "sent", email: email.data ?? "", url: "" };

  const requestHeaders = await headers();
  if (
    !rateLimit(`academy-ip:${clientIp(requestHeaders)}`, 5, HOUR) ||
    (email.success && !rateLimit(`academy-email:${email.data}`, 3, HOUR))
  ) {
    return fail({}, "error.rateLimited");
  }

  const fields: Partial<Record<SignupField, PlatformMessageKey>> = {};
  if (!email.success) fields.email = "error.email";
  if (name.length < 2 || name.length > 80) fields.name = "error.name";
  if (websiteInput && !website) fields.website = "error.website";
  if (formData.get("accept") !== "on") fields.accept = "error.accept";
  if (Object.keys(fields).length > 0 || !email.success) return fail(fields);

  const main: Locale = isLocale(text(formData, "language"))
    ? (text(formData, "language") as Locale)
    : locale;
  const other = SUPPORTED_LOCALES.find((candidate) => candidate !== main)!;
  const locales: Locale[] = formData.get("alsoOffer") === "on" ? [main, other] : [main];

  // What the person agreed to, in the words they saw, with the documents' addresses.
  const documents = await acceptedDocuments(config, locale);
  const wording = t("form.accept", {
    terms: `${t("form.termsLink")} (${documents.terms.url})`,
    dpa: `${t("form.dpaLink")} (${documents.dpa.url})`,
  });
  const result = await createAcademy(
    getDb(),
    {
      name,
      slug,
      email: email.data,
      locales,
      website,
      agreements: [
        { kind: "terms", version: documents.terms.version, wording },
        { kind: "dpa", version: documents.dpa.version, wording },
      ],
    },
    config.academyDomain,
  );
  if (!result.ok) {
    if (result.error === "slug_taken") return fail({ slug: "error.slugTaken" });
    if (result.error === "slug_reserved") return fail({ slug: "error.slugReserved" });
    if (result.error === "slug_invalid") return fail({ slug: "error.slugInvalid" });
    return fail({ name: "error.name" });
  }

  const { host, origin } = academyOrigin(result.tenant.primaryDomain);
  const notify = config.notifyEmail;
  if (notify) {
    const tenant = result.tenant;
    after(() => notifyNewAcademy({ to: notify, tenant, adminEmail: email.data }));
  }
  try {
    // The link is issued by the new academy's own auth, on the academy's own host.
    await authFor(result.tenant).api.signInMagicLink({
      body: {
        email: email.data,
        callbackURL: continueUrl({}, "/studio"),
        errorCallbackURL: "/sign-in",
        metadata: { locale: result.tenant.settings.default_locale },
      },
      headers: new Headers({ host }),
    });
  } catch (error) {
    // The academy exists; the person can still sign in from its /sign-in page.
    console.error("[platform] sign-in link for a new academy failed", error);
  }
  return { status: "sent", email: email.data, url: origin };
}

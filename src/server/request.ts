import "server-only";

import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

import { resolveLocale, type Locale } from "@/core/i18n/locales";
import { createTranslator, type Translator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";
import { LOCALE_COOKIE } from "@/server/cookies";
import { resolveTenant } from "@/server/tenant-resolver";

/** The academy for this request (by Host). Unknown hosts never get this far: see src/proxy.ts. */
export const getTenant = cache(async (): Promise<TenantContext> => {
  const tenant = await resolveTenant((await headers()).get("host"));
  if (!tenant || tenant.status !== "active") notFound();
  return tenant;
});

export const getLocale = cache(async (): Promise<Locale> => {
  const tenant = await getTenant();
  return resolveLocale({
    requested: (await cookies()).get(LOCALE_COOKIE)?.value,
    acceptLanguage: (await headers()).get("accept-language"),
    tenantLocales: tenant.settings.locales,
    defaultLocale: tenant.settings.default_locale,
  });
});

export const getTranslator = cache(async (): Promise<Translator> => {
  const tenant = await getTenant();
  return createTranslator({
    locale: await getLocale(),
    termOverrides: tenant.terminology,
    messageOverrides: tenant.terminology.strings,
  });
});

/** Origin of the current academy, e.g. https://academy.scaling-product.com */
export async function getOrigin(): Promise<string> {
  const host = (await headers()).get("host");
  const protocol =
    process.env.APP_PROTOCOL ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${protocol}://${host}`;
}

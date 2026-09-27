import "server-only";

import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

import { resolveLocale, SUPPORTED_LOCALES, type Locale } from "@/core/i18n/locales";
import { createTranslator, type Translator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";
import { LOCALE_COOKIE } from "@/server/cookies";
import { isPlatformHost } from "@/server/platform/config";
import { resolveTenant } from "@/server/tenant-resolver";

/** What this request is for: an academy, or the platform site where academies are created. */
export type Surface = { kind: "tenant"; tenant: TenantContext } | { kind: "platform" };

export const getSurface = cache(async (): Promise<Surface> => {
  const host = (await headers()).get("host");
  if (isPlatformHost(host)) return { kind: "platform" };
  const tenant = await resolveTenant(host);
  // Unknown hosts never get this far: see src/proxy.ts.
  if (!tenant || tenant.status !== "active") notFound();
  return { kind: "tenant", tenant };
});

/** The academy for this request (by Host). */
export const getTenant = cache(async (): Promise<TenantContext> => {
  const surface = await getSurface();
  if (surface.kind !== "tenant") notFound();
  return surface.tenant;
});

export const getLocale = cache(async (): Promise<Locale> => {
  const surface = await getSurface();
  return resolveLocale({
    requested: (await cookies()).get(LOCALE_COOKIE)?.value,
    acceptLanguage: (await headers()).get("accept-language"),
    tenantLocales: surface.kind === "tenant" ? surface.tenant.settings.locales : SUPPORTED_LOCALES,
    defaultLocale: surface.kind === "tenant" ? surface.tenant.settings.default_locale : "en",
  });
});

export const getTranslator = cache(async (): Promise<Translator> => {
  const surface = await getSurface();
  const locale = await getLocale();
  if (surface.kind === "platform") return createTranslator({ locale });
  return createTranslator({
    locale,
    termOverrides: surface.tenant.terminology,
    messageOverrides: surface.tenant.terminology.strings,
  });
});

/** Origin of the current academy, e.g. https://academy.scaling-product.com */
export async function getOrigin(): Promise<string> {
  const host = (await headers()).get("host");
  const protocol =
    process.env.APP_PROTOCOL ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${protocol}://${host}`;
}

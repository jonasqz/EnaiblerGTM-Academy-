import "server-only";

import { cookies, headers } from "next/headers";
import { cache } from "react";

import { resolveLocale, SUPPORTED_LOCALES, type Locale } from "@/core/i18n/locales";
import { studioText, type StudioText } from "@/core/i18n/studio/translator";
import { LOCALE_COOKIE } from "@/server/cookies";
import { getTenant } from "@/server/request";
import { appTimeZone } from "@/server/time-zone";

/**
 * The Studio speaks the team member's language, whatever languages the
 * academy teaches in: the language preference (?lang=, cookie), then the
 * browser, then the academy's main language.
 */
export const getStudioLocale = cache(async (): Promise<Locale> => {
  const tenant = await getTenant();
  return resolveLocale({
    requested: (await cookies()).get(LOCALE_COOKIE)?.value,
    acceptLanguage: (await headers()).get("accept-language"),
    tenantLocales: SUPPORTED_LOCALES,
    defaultLocale: tenant.settings.default_locale,
  });
});

/** APP_TIME_ZONE, else Berlin: dates and times in the Studio are local to the team. */
export const studioTimeZone = appTimeZone;

export const getStudioText = cache(async (): Promise<StudioText> =>
  studioText(await getStudioLocale(), { timeZone: studioTimeZone() }),
);

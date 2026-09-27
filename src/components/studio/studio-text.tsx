"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { Locale } from "@/core/i18n/locales";
import { DEFAULT_TIME_ZONE, studioText, type StudioText } from "@/core/i18n/studio/translator";

const StudioLocaleContext = createContext<{ locale: Locale; timeZone: string }>({
  locale: "en",
  timeZone: DEFAULT_TIME_ZONE,
});

/** Set by the Studio layout: client components word themselves in the team member's language. */
export function StudioTextProvider(props: {
  locale: Locale;
  timeZone: string;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ locale: props.locale, timeZone: props.timeZone }),
    [props.locale, props.timeZone],
  );
  return <StudioLocaleContext value={value}>{props.children}</StudioLocaleContext>;
}

export function useStudioText(): StudioText {
  const { locale, timeZone } = useContext(StudioLocaleContext);
  return useMemo(() => studioText(locale, { timeZone }), [locale, timeZone]);
}

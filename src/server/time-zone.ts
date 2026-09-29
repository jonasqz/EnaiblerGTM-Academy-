import { DEFAULT_TIME_ZONE } from "@/core/i18n/studio/translator";

/**
 * APP_TIME_ZONE, else Berlin: the zone the academy's team works in. The
 * Studio shows its dates in it, and homework deadlines are set in it.
 */
export function appTimeZone(): string {
  const configured = process.env.APP_TIME_ZONE?.trim();
  if (!configured) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en", { timeZone: configured });
    return configured;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

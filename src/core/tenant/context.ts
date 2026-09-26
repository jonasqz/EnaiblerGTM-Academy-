import type { Locale } from "@/core/i18n/locales";
import type { TenantSettings, Terminology } from "@/core/tenant/manifest";
import type { Theme } from "@/core/theme/schema";

/** Everything request handling needs to know about the current academy. */
export interface TenantContext {
  id: string;
  slug: string;
  status: "active" | "suspended";
  settings: TenantSettings;
  theme: Theme;
  terminology: Terminology;
  primaryDomain: string;
}

export function tenantLocales(tenant: TenantContext): Locale[] {
  return [...tenant.settings.locales];
}

/**
 * Normalises a Host header: lower-case, no port, no trailing dot.
 * Returns null for empty or obviously malformed values.
 */
export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  let value = host.trim().toLowerCase();
  if (value.startsWith("[")) return null; // IPv6 literals never map to a tenant
  const colon = value.indexOf(":");
  if (colon !== -1) value = value.slice(0, colon);
  value = value.replace(/\.$/, "");
  return /^[a-z0-9.-]{1,253}$/.test(value) ? value : null;
}

/**
 * Local development: `<slug>.localhost` maps to the tenant with that slug, so
 * every academy can be opened without touching DNS or the manifests.
 */
export function devSlugFromHost(host: string): string | null {
  const match = /^([a-z0-9-]+)\.localhost$/.exec(host);
  return match?.[1] ?? null;
}

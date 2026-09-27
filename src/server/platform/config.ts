import { normalizeHost, type TenantContext } from "@/core/tenant/context";
import { isProduction } from "@/server/env";

/**
 * The platform site (self-serve signup) and where new academies live. One
 * deployment serves the platform host and every academy host; creating an
 * academy is a database write, never a deploy.
 */
export interface PlatformConfig {
  host: string;
  /** Academies get <slug>.<academyDomain>. */
  academyDomain: string;
  links: { terms?: string; dpa?: string; privacy?: string; imprint?: string };
  agreementVersion: string;
}

/**
 * Read by name, not through env(): the proxy runs this on every request, and
 * Next only exposes the variables code references as process.env.NAME there.
 */
export function platformConfig(): PlatformConfig | null {
  const production = process.env.NODE_ENV === "production";
  const trimmed = (value: string | undefined) => value?.trim() || undefined;
  // Development: localhost is the platform and <slug>.localhost the academies,
  // unless plain localhost is taken by DEV_DEFAULT_TENANT.
  const devDefault =
    !production && !trimmed(process.env.DEV_DEFAULT_TENANT) ? "localhost" : undefined;
  const host = normalizeHost(trimmed(process.env.PLATFORM_HOST) ?? devDefault);
  const academyDomain = normalizeHost(
    trimmed(process.env.ACADEMY_DOMAIN) ?? (production ? undefined : "localhost"),
  );
  if (!host || !academyDomain) return null;
  return {
    host,
    academyDomain,
    links: {
      terms: trimmed(process.env.PLATFORM_TERMS_URL),
      dpa: trimmed(process.env.PLATFORM_DPA_URL),
      privacy: trimmed(process.env.PLATFORM_PRIVACY_URL),
      imprint: trimmed(process.env.PLATFORM_IMPRINT_URL),
    },
    agreementVersion: trimmed(process.env.PLATFORM_AGREEMENT_VERSION) ?? "2026-09",
  };
}

export function isPlatformHost(hostHeader: string | null | undefined): boolean {
  const host = normalizeHost(hostHeader);
  return host !== null && host === platformConfig()?.host;
}

/**
 * Host (with the dev port in development) and origin of an academy domain.
 * Read by name: the worker links to academies in mails and has no env().
 */
export function academyOrigin(domain: string): { host: string; origin: string } {
  const production = process.env.NODE_ENV === "production";
  const configured = process.env.APP_PROTOCOL?.trim();
  const protocol =
    configured === "http" || configured === "https" ? configured : production ? "https" : "http";
  const port = Number(process.env.DEV_PORT?.trim() || 3000);
  const host = production ? domain : `${domain}:${port}`;
  return { host, origin: `${protocol}://${host}` };
}

/** An absolute link into an academy, for mails and exports. */
export function academyUrl(tenant: TenantContext, path: string): string {
  return `${academyOrigin(tenant.primaryDomain).origin}${path}`;
}

/**
 * Signup needs somewhere to create academies and, in production, the terms and
 * the data processing agreement people accept (they are recorded per academy).
 */
export function signupOpen(config: PlatformConfig | null): config is PlatformConfig {
  if (!config) return false;
  return !isProduction() || Boolean(config.links.terms && config.links.dpa);
}

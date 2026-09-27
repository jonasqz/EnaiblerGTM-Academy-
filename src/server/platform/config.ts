import { normalizeHost, type TenantContext } from "@/core/tenant/context";

/**
 * The platform site (self-serve signup) and where new academies live. One
 * deployment serves the platform host and every academy host; creating an
 * academy is a database write, never a deploy.
 */
export interface PlatformConfig {
  host: string;
  /** Academies get <slug>.<academyDomain>. */
  academyDomain: string;
  /** The operator's own addresses for the legal pages; each replaces its built-in page. */
  links: { terms?: string; dpa?: string; privacy?: string; imprint?: string; demo?: string };
  /** Where content reports go; development falls back to a local address. */
  abuseEmail?: string;
  /** The operator's inbox for news such as each new academy. */
  notifyEmail?: string;
  /** Recorded with accepted agreements; unset, a built-in page's date is its version. */
  agreementVersion?: string;
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
      // An academy visitors of the website can look around in.
      demo: trimmed(process.env.PLATFORM_DEMO_URL),
    },
    abuseEmail:
      trimmed(process.env.PLATFORM_ABUSE_EMAIL) ??
      (production ? undefined : "abuse@enaibler.local"),
    notifyEmail: trimmed(process.env.PLATFORM_NOTIFY_EMAIL),
    agreementVersion: trimmed(process.env.PLATFORM_AGREEMENT_VERSION),
  };
}

export function isPlatformHost(hostHeader: string | null | undefined): boolean {
  const host = normalizeHost(hostHeader);
  return host !== null && host === platformConfig()?.host;
}

/**
 * APP_PROTOCOL, else https in production and http in development. Cookies
 * are Secure exactly when this is https, like the session's (Better Auth).
 * Read by name: the proxy and the worker use it.
 */
export function appProtocol(): "http" | "https" {
  const configured = process.env.APP_PROTOCOL?.trim();
  if (configured === "http" || configured === "https") return configured;
  return process.env.NODE_ENV === "production" ? "https" : "http";
}

/**
 * Host (with the dev port in development) and origin of an academy domain,
 * or of the platform host. Read by name: the worker links to academies in
 * mails and has no env().
 */
export function academyOrigin(domain: string): { host: string; origin: string } {
  const production = process.env.NODE_ENV === "production";
  const protocol = appProtocol();
  const port = Number(process.env.DEV_PORT?.trim() || 3000);
  const host = production ? domain : `${domain}:${port}`;
  return { host, origin: `${protocol}://${host}` };
}

/** An absolute link into an academy, for mails and exports. */
export function academyUrl(tenant: TenantContext, path: string): string {
  return `${academyOrigin(tenant.primaryDomain).origin}${path}`;
}

/** The website's origin, e.g. https://enaibler.app; null when there is no platform host. */
export function platformOrigin(config: PlatformConfig | null = platformConfig()): string | null {
  return config ? academyOrigin(config.host).origin : null;
}

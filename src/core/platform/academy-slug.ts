import { slugify } from "@/core/shared/slug";

/**
 * Addresses for self-serve academies: <slug>.<academy domain>. Slugs become
 * DNS labels, so they are short, and names the platform itself needs, or that
 * could pass for official enaibler pages, are reserved.
 */
export const RESERVED_ACADEMY_SLUGS: ReadonlySet<string> = new Set([
  "about",
  "academies",
  "academy",
  "account",
  "accounts",
  "admin",
  "administrator",
  "api",
  "app",
  "assets",
  "auth",
  "billing",
  "blog",
  "cdn",
  "dashboard",
  "demo",
  "dev",
  "dns",
  "docs",
  "email",
  "enaibler",
  "files",
  "ftp",
  "help",
  "imap",
  "imprint",
  "legal",
  "localhost",
  "login",
  "mail",
  "media",
  "news",
  "ns1",
  "ns2",
  "pay",
  "payments",
  "platform",
  "pop",
  "privacy",
  "register",
  "root",
  "s3",
  "security",
  "signin",
  "signup",
  "smtp",
  "staging",
  "static",
  "status",
  "storage",
  "studio",
  "support",
  "terms",
  "test",
  "www",
]);

export const ACADEMY_SLUG_MIN = 3;
export const ACADEMY_SLUG_MAX = 40;

export type AcademySlugIssue = "invalid" | "reserved";

export function academySlugIssue(slug: string): AcademySlugIssue | null {
  const valid =
    slug.length >= ACADEMY_SLUG_MIN &&
    slug.length <= ACADEMY_SLUG_MAX &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  if (!valid) return "invalid";
  return RESERVED_ACADEMY_SLUGS.has(slug) ? "reserved" : null;
}

/** "Acme Sales Academy" → "acme-sales-academy", cut at a word boundary to fit a DNS label. */
export function suggestAcademySlug(name: string): string {
  const full = slugify(name);
  if (full.length <= ACADEMY_SLUG_MAX) return full;
  const cut = full.slice(0, ACADEMY_SLUG_MAX + 1);
  const boundary = cut.lastIndexOf("-");
  return (
    boundary >= ACADEMY_SLUG_MIN ? cut.slice(0, boundary) : full.slice(0, ACADEMY_SLUG_MAX)
  ).replace(/-+$/, "");
}

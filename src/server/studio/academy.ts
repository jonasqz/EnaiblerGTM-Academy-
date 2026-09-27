import { eq } from "drizzle-orm";

import type { Locale, LocalizedText } from "@/core/i18n/locales";
import type { TenantContext } from "@/core/tenant/context";
import { validateTenantManifest } from "@/core/tenant/manifest";
import { themeContrastIssues } from "@/core/theme/contrast";
import { themeSchema, type ThemeInput } from "@/core/theme/schema";
import type { Database } from "@/db/client";
import { tenants } from "@/db/schema";
import { clearTenantCache } from "@/server/tenant-resolver";

/*
 * Academy settings from the Studio (self-serve). They go through the same
 * validation as a manifest: wording lint on the name and the certificate
 * button, locale rules, theme tokens and readability.
 * Academies managed by a manifest: the next `tenant:apply` wins.
 */

export type SettingsResult = { ok: true; warnings: string[] } | { ok: false; errors: string[] };

export interface AcademySettingsInput {
  name: string;
  locales: Locale[];
  defaultLocale: Locale;
  website: string | null;
  legalLinks: { imprint?: string; privacy?: string; terms?: string };
  ctaLabel: LocalizedText;
}

async function loadRow(db: Database, tenantId: string) {
  const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!row) throw new Error("Academy not found");
  return row;
}

export async function updateAcademySettings(
  db: Database,
  tenant: TenantContext,
  input: AcademySettingsInput,
): Promise<SettingsResult> {
  const row = await loadRow(db, tenant.id);
  const validation = validateTenantManifest({
    tenant: {
      ...row.config,
      slug: tenant.slug,
      domains: tenant.settings.domains,
      author_display_name: input.name,
      locales: input.locales,
      default_locale: input.defaultLocale,
      website: input.website ?? undefined,
      legal_links: input.legalLinks,
      verification_cta: { ...row.config.verification_cta, label: input.ctaLabel },
    },
    ...(row.theme ? { theme: row.theme } : {}),
    terminology: row.terminology,
  });
  if (!validation.ok) return { ok: false, errors: validation.errors };
  const { slug, domains, ...config } = validation.manifest.tenant;
  // Settings never move an academy: its address is its identity for learners and certificates.
  if (slug !== tenant.slug || domains.join() !== tenant.settings.domains.join()) {
    throw new Error("Academy settings must not change the address");
  }
  await db.update(tenants).set({ config }).where(eq(tenants.id, tenant.id));
  clearTenantCache();
  return { ok: true, warnings: validation.warnings };
}

/** Saves the academy's theme; null goes back to enaibler's default look. */
export async function updateAcademyTheme(
  db: Database,
  tenant: TenantContext,
  theme: ThemeInput | null,
): Promise<SettingsResult> {
  if (theme !== null) {
    const parsed = themeSchema.safeParse(theme);
    if (!parsed.success) {
      return {
        ok: false,
        errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      };
    }
    const issues = themeContrastIssues(parsed.data);
    const errors = issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message);
    if (errors.length > 0) return { ok: false, errors };
    await db.update(tenants).set({ theme }).where(eq(tenants.id, tenant.id));
    clearTenantCache();
    return { ok: true, warnings: issues.map((issue) => issue.message) };
  }
  await db.update(tenants).set({ theme: null }).where(eq(tenants.id, tenant.id));
  clearTenantCache();
  return { ok: true, warnings: [] };
}

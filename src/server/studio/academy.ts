import { eq } from "drizzle-orm";

import {
  postsWithoutUrl,
  sharingIssues,
  sharingWording,
  type SharingInput,
  type SharingIssue,
} from "@/core/credentials/share-settings";
import type { Locale, LocalizedText } from "@/core/i18n/locales";
import type { TenantContext } from "@/core/tenant/context";
import {
  tenantManifestSchema,
  validateTenantManifest,
  type Features,
  type ManifestWarning,
  type TenantManifest,
} from "@/core/tenant/manifest";
import { themeContrastIssues, type ContrastIssue } from "@/core/theme/contrast";
import { themeSchema, type ThemeInput } from "@/core/theme/schema";
import type { Database } from "@/db/client";
import { tenants } from "@/db/schema";
import type { StoredTenantConfig } from "@/db/schema/tenancy";
import { clearTenantCache } from "@/server/tenant-resolver";

/*
 * Academy settings from the Studio (self-serve). They go through the same
 * validation as a manifest: wording lint on the name, the certificate button
 * and what learners are offered to post, locale rules, theme tokens and
 * readability. Academies managed by a manifest: the next `tenant:apply` wins.
 */

/** Warnings and contrast problems by code, so the Studio words them in the team member's language. */
export type SettingsResult =
  | { ok: true; warnings: ManifestWarning[] }
  | { ok: false; errors: string[]; contrast?: ContrastIssue[] };

export interface AcademySettingsInput {
  name: string;
  locales: Locale[];
  defaultLocale: Locale;
  website: string | null;
  /** Where learners' replies to academy mail go; unchanged when omitted. */
  replyTo?: string | null;
  legalLinks: { imprint?: string; privacy?: string; terms?: string };
  /** The certificate button's label; unchanged when omitted (it is set under Sharing). */
  ctaLabel?: LocalizedText;
  /** Modules on or off; unchanged when omitted. */
  features?: Features;
}

/** Keeps a manifest's sender name and address; only the reply address is set here. */
function emailSenderWith(
  current: StoredTenantConfig["email_sender"],
  replyTo: string | null | undefined,
): StoredTenantConfig["email_sender"] {
  if (replyTo === undefined) return current;
  const next = { ...current, reply_to: replyTo ?? undefined };
  if (!next.reply_to) delete next.reply_to;
  return Object.keys(next).length > 0 ? next : undefined;
}

async function loadRow(db: Database, tenantId: string) {
  const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!row) throw new Error("Academy not found");
  return row;
}

/** The academy as a manifest with some settings changed, its theme and terms as stored. */
function manifestWith(
  row: Awaited<ReturnType<typeof loadRow>>,
  tenant: TenantContext,
  settings: Record<string, unknown>,
) {
  return {
    tenant: { ...row.config, slug: tenant.slug, domains: tenant.settings.domains, ...settings },
    ...(row.theme ? { theme: row.theme } : {}),
    terminology: row.terminology,
  };
}

async function saveConfig(db: Database, tenant: TenantContext, manifest: TenantManifest) {
  const { slug, domains, ...config } = manifest.tenant;
  // Settings never move an academy: its address is its identity for learners and certificates.
  if (slug !== tenant.slug || domains.join() !== tenant.settings.domains.join()) {
    throw new Error("Academy settings must not change the address");
  }
  await db.update(tenants).set({ config }).where(eq(tenants.id, tenant.id));
  clearTenantCache();
}

export async function updateAcademySettings(
  db: Database,
  tenant: TenantContext,
  input: AcademySettingsInput,
): Promise<SettingsResult> {
  const row = await loadRow(db, tenant.id);
  const validation = validateTenantManifest(
    manifestWith(row, tenant, {
      author_display_name: input.name,
      locales: input.locales,
      default_locale: input.defaultLocale,
      website: input.website ?? undefined,
      email_sender: emailSenderWith(row.config.email_sender, input.replyTo),
      legal_links: input.legalLinks,
      verification_cta: {
        ...row.config.verification_cta,
        label: input.ctaLabel ?? row.config.verification_cta.label,
      },
      features: input.features ?? row.config.features,
    }),
  );
  if (!validation.ok) return { ok: false, errors: validation.errors };
  await saveConfig(db, tenant, validation.manifest);
  return { ok: true, warnings: validation.findings };
}

/**
 * Problems by code, so the Studio words them in the team member's language
 * (sharingIssueText). The manifest's own warnings are about other settings.
 */
export type SharingResult =
  { ok: true; postsWithoutUrl: Locale[] } | { ok: false; issues: SharingIssue[] };

/**
 * What learners are offered when they share a certificate, and where its
 * page leads visitors (brief §2 steps 7–8, §6): the LinkedIn page, the
 * suggested post and hashtags, the call to action.
 */
export async function updateSharingSettings(
  db: Database,
  tenant: TenantContext,
  input: SharingInput,
): Promise<SharingResult> {
  const blocked = sharingWording(input).filter((finding) => finding.severity === "error");
  if (blocked.length > 0) {
    return { ok: false, issues: blocked.map((finding) => ({ code: "wording", finding })) };
  }
  const row = await loadRow(db, tenant.id);
  const parsed = tenantManifestSchema.safeParse(
    manifestWith(row, tenant, {
      linkedin_organization_id: input.linkedinOrganizationId ?? undefined,
      sharing: {
        ...(Object.keys(input.postText).length > 0 ? { post_text: input.postText } : {}),
        hashtags: input.hashtags,
      },
      verification_cta: {
        label: input.ctaLabel,
        ...(input.ctaUrl ? { url: input.ctaUrl } : {}),
      },
    }),
  );
  if (!parsed.success) return { ok: false, issues: sharingIssues(parsed.error.issues, input) };
  await saveConfig(db, tenant, parsed.data);
  return { ok: true, postsWithoutUrl: postsWithoutUrl(input.postText) };
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
    const blocking = issues.filter((issue) => issue.severity === "error");
    if (blocking.length > 0) return { ok: false, errors: [], contrast: blocking };
    await db.update(tenants).set({ theme }).where(eq(tenants.id, tenant.id));
    clearTenantCache();
    return { ok: true, warnings: issues.map((issue) => ({ code: "contrast" as const, issue })) };
  }
  await db.update(tenants).set({ theme: null }).where(eq(tenants.id, tenant.id));
  clearTenantCache();
  return { ok: true, warnings: [] };
}

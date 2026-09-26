import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { checkDeliveryMode, deliveryModeSchema } from "@/core/compliance/delivery-mode";
import {
  describeFinding,
  lintLocalizedWording,
  lintWording,
  type WordingContext,
  type WordingFinding,
} from "@/core/compliance/wording-lint";
import {
  localeSchema,
  localizedTextInputSchema,
  localizedTextSchema,
  localize,
  type Locale,
} from "@/core/i18n/locales";
import { MESSAGE_KEYS } from "@/core/i18n/messages";
import { levelSchemeSchema } from "@/core/levels/rules";
import { REVIEW_TONES } from "@/core/review/prompt";
import { slugSchema, slugify } from "@/core/shared/slug";
import { termOverrideEntries, termOverrideSchema } from "@/core/terminology/terms";
import { DEFAULT_THEME } from "@/core/theme/enaibler-tokens";
import { isBundledFont } from "@/core/theme/fonts";
import { hexColorSchema, themeSchema } from "@/core/theme/schema";

/**
 * A tenant manifest is the complete, declarative setup of one academy
 * (brief Appendix A). Rule of thumb from the brief: if onboarding a tenant
 * needs a code change, this model is missing something.
 */

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    "Use a bare host name such as academy.example.com (no scheme, port or path)",
  );

const httpsUrlSchema = z.url({ protocol: /^https$/, error: "Use an https:// URL" });

export const CTA_URL_PLACEHOLDERS = ["course", "path"] as const;

/**
 * Call-to-action target on the verification page. Either an https URL or a
 * path on the academy itself; `{course}` and `{path}` are replaced with the
 * credential's course and path slugs. Omitted: the academy's own entry link
 * for the same course, so every shared credential is a new entry point.
 */
const ctaUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    const sample = value
      .replaceAll("{course}", "sample-course")
      .replaceAll("{path}", "sample-path");
    if (sample.startsWith("/") && !sample.startsWith("//")) return !/[{}\s]/.test(sample);
    try {
      return new URL(sample).protocol === "https:" && !/[{}]/.test(sample);
    } catch {
      return false;
    }
  }, "Use an https:// URL or a path starting with /; only {course} and {path} placeholders are allowed");

export const FEATURE_KEYS = ["paths", "levels", "cohorts", "ai_review", "showcase"] as const;

export const featuresSchema = z.strictObject({
  paths: z.boolean().default(false),
  levels: z.boolean().default(false),
  /** Phase 2. */
  cohorts: z.boolean().default(false),
  ai_review: z.boolean().default(true),
  /** Phase 2. */
  showcase: z.boolean().default(false),
});
export type Features = z.output<typeof featuresSchema>;

export const emailSenderSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  address: z.email(),
  reply_to: z.email().optional(),
});

export const tenantSettingsSchema = z.strictObject({
  slug: slugSchema,
  domains: z.array(domainSchema).min(1).max(20),
  locales: z.array(localeSchema).min(1),
  default_locale: localeSchema,
  /** A brand, never a person ("Scaling Product Academy"). */
  author_display_name: z.string().trim().min(2).max(80),
  legal_links: z.strictObject({
    imprint: httpsUrlSchema,
    privacy: httpsUrlSchema,
    terms: httpsUrlSchema,
  }),
  features: featuresSchema.prefault({}),
  /** Sender for transactional mail. Defaults to the platform address with the academy name. */
  email_sender: emailSenderSchema.optional(),
  verification_cta: z.strictObject({
    label: localizedTextInputSchema,
    url: ctaUrlSchema.optional(),
  }),
  /** No person names in UI, e-mails, metadata or credentials (brief §9). */
  anonymity_mode: z.boolean().default(true),
  /** Numeric LinkedIn page id; without it "Add to profile" uses the academy name. */
  linkedin_organization_id: z.string().regex(/^\d+$/).optional(),
  review_tone: z.enum(REVIEW_TONES).default("warm"),
});
export type TenantSettings = z.output<typeof tenantSettingsSchema>;

export const terminologySchema = z.strictObject({
  path: termOverrideSchema.optional(),
  course: termOverrideSchema.optional(),
  lesson: termOverrideSchema.optional(),
  assignment: termOverrideSchema.optional(),
  artifact: termOverrideSchema.optional(),
  level: termOverrideSchema.optional(),
  credential: termOverrideSchema.optional(),
  /** Per-key overrides of learner UI strings (see core/i18n/messages.ts). */
  strings: z.partialRecord(z.enum(MESSAGE_KEYS), localizedTextSchema).optional(),
});
export type Terminology = z.output<typeof terminologySchema>;

const pathObjectSchema = z.strictObject({
  slug: slugSchema.optional(),
  title: localizedTextInputSchema,
  promise: localizedTextInputSchema.optional(),
  color: hexColorSchema.optional(),
  /** Asset paths or storage keys of the path visual. */
  visual: z
    .strictObject({
      svg: z.string().min(1).max(300).optional(),
      png: z.string().min(1).max(300).optional(),
    })
    .optional(),
  /** Ordered course slugs. Appendix A leaves the order to the author, so this may be empty. */
  courses: z.array(slugSchema).default([]),
});

export const pathManifestSchema = z
  .union([z.string().trim().min(1).max(60), pathObjectSchema])
  .transform((value) => {
    const path = typeof value === "string" ? pathObjectSchema.parse({ title: value }) : value;
    const slug = path.slug ?? slugify(localize(path.title, "en"));
    return { ...path, slug };
  });
export type PathManifest = z.output<typeof pathManifestSchema>;

export const courseManifestSchema = z.strictObject({
  slug: slugSchema,
  delivery_mode: deliveryModeSchema,
  title: localizedTextInputSchema.optional(),
  languages: z.array(localeSchema).min(1).optional(),
  /** Planned launch, "YYYY-MM" or "YYYY-MM-DD". Informational; publishing is a separate step. */
  launch: z
    .string()
    .regex(/^\d{4}-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?$/, "Use YYYY-MM or YYYY-MM-DD")
    .optional(),
  est_minutes: z.number().int().positive().max(10_000).optional(),
});
export type CourseManifest = z.output<typeof courseManifestSchema>;

type WordingCheck = { path: (string | number)[]; findings: WordingFinding[] };

function wordingChecks(manifest: {
  tenant: TenantSettings;
  terminology: Terminology;
  paths: PathManifest[];
  levels: z.output<typeof levelSchemeSchema>;
  courses: CourseManifest[];
}): WordingCheck[] {
  const checks: WordingCheck[] = [];
  const add = (path: (string | number)[], findings: WordingFinding[]) => {
    if (findings.length > 0) checks.push({ path, findings });
  };
  const text = (value: string, context: WordingContext) => lintWording(value, context);

  add(["tenant", "author_display_name"], text(manifest.tenant.author_display_name, "brand_name"));
  add(
    ["tenant", "verification_cta", "label"],
    lintLocalizedWording(manifest.tenant.verification_cta.label, "cta_label"),
  );
  for (const entry of termOverrideEntries(manifest.terminology)) {
    add(["terminology", entry.key, entry.locale], text(entry.text, "terminology"));
  }
  for (const [key, value] of Object.entries(manifest.terminology.strings ?? {})) {
    if (value)
      add(["terminology", "strings", key], lintLocalizedWording(value, "credential_template"));
  }
  manifest.paths.forEach((path, index) => {
    add(["paths", index, "title"], lintLocalizedWording(path.title, "path_name"));
  });
  manifest.levels.forEach((level, index) => {
    add(["levels", index, "name"], lintLocalizedWording(level.name, "level_name"));
  });
  manifest.courses.forEach((course, index) => {
    if (course.title)
      add(["courses", index, "title"], lintLocalizedWording(course.title, "course_title"));
  });
  return checks;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}

export const tenantManifestSchema = z
  .strictObject({
    tenant: tenantSettingsSchema,
    /** Omit to use enaibler's default theme. */
    theme: themeSchema.optional(),
    terminology: terminologySchema.prefault({}),
    paths: z.array(pathManifestSchema).default([]),
    levels: levelSchemeSchema.default([]),
    courses: z.array(courseManifestSchema).default([]),
  })
  .superRefine((manifest, ctx) => {
    const { tenant } = manifest;

    if (!tenant.locales.includes(tenant.default_locale)) {
      ctx.addIssue({
        code: "custom",
        path: ["tenant", "default_locale"],
        message: "default_locale must be one of locales",
      });
    }
    for (const domain of duplicates(tenant.domains)) {
      ctx.addIssue({
        code: "custom",
        path: ["tenant", "domains"],
        message: `Duplicate domain ${domain}`,
      });
    }
    for (const slug of duplicates(manifest.paths.map((path) => path.slug))) {
      ctx.addIssue({ code: "custom", path: ["paths"], message: `Duplicate path slug "${slug}"` });
    }
    for (const slug of duplicates(manifest.courses.map((course) => course.slug))) {
      ctx.addIssue({
        code: "custom",
        path: ["courses"],
        message: `Duplicate course slug "${slug}"`,
      });
    }

    const courseSlugs = new Set(manifest.courses.map((course) => course.slug));
    manifest.paths.forEach((path, index) => {
      for (const slug of path.courses) {
        if (!courseSlugs.has(slug)) {
          ctx.addIssue({
            code: "custom",
            path: ["paths", index, "courses"],
            message: `Unknown course "${slug}"`,
          });
        }
      }
    });

    manifest.courses.forEach((course, index) => {
      for (const language of course.languages ?? []) {
        if (!tenant.locales.includes(language)) {
          ctx.addIssue({
            code: "custom",
            path: ["courses", index, "languages"],
            message: `Language "${language}" is not enabled for this tenant`,
          });
        }
      }
    });

    if (tenant.features.levels && !tenant.features.paths) {
      ctx.addIssue({
        code: "custom",
        path: ["tenant", "features", "levels"],
        message: "Levels count progress within a path: enable the paths feature too",
      });
    }

    for (const check of wordingChecks(manifest)) {
      for (const finding of check.findings.filter((f) => f.severity === "error")) {
        ctx.addIssue({ code: "custom", path: check.path, message: describeFinding(finding) });
      }
    }
  });

export type TenantManifestInput = z.input<typeof tenantManifestSchema>;
export type TenantManifest = z.output<typeof tenantManifestSchema>;

/** Non-blocking findings: things that are valid but probably not what the author wants. */
export function manifestWarnings(manifest: TenantManifest): string[] {
  const warnings: string[] = [];
  const { tenant } = manifest;
  const theme = manifest.theme ?? DEFAULT_THEME;

  if (tenant.features.paths && manifest.paths.length === 0)
    warnings.push("The paths feature is on, but no paths are defined.");
  if (!tenant.features.paths && manifest.paths.length > 0)
    warnings.push("Paths are defined, but the paths feature is off.");
  if (tenant.features.levels && manifest.levels.length === 0)
    warnings.push("The levels feature is on, but no levels are defined.");
  if (!tenant.features.levels && manifest.levels.length > 0)
    warnings.push("Levels are defined, but the levels feature is off.");
  if (tenant.features.cohorts)
    warnings.push("Cohorts are a phase 2 feature and are not available yet.");
  if (tenant.features.showcase)
    warnings.push("Showcase is a phase 2 feature and is not available yet.");
  if (!tenant.email_sender)
    warnings.push("No email_sender set: mail goes out from the platform address.");

  const legal = Object.values(tenant.legal_links);
  if (new Set(legal).size < legal.length || legal.some((url) => new URL(url).pathname === "/")) {
    warnings.push(
      "Legal links look like placeholders (shared or pointing at a home page): set the exact pages before go-live.",
    );
  }

  for (const family of new Set([theme.fonts.display, theme.fonts.body])) {
    if (!isBundledFont(family) && theme.fonts.source_urls.length === 0) {
      warnings.push(
        `Font "${family}" is not bundled and no source_urls are given: browsers will fall back.`,
      );
    }
  }

  for (const course of manifest.courses) {
    for (const issue of checkDeliveryMode({ deliveryMode: course.delivery_mode })) {
      warnings.push(
        `Course "${course.slug}": ${issue.message} It can be set up but not published.`,
      );
    }
  }

  return warnings;
}

export type ManifestValidation =
  { ok: true; manifest: TenantManifest; warnings: string[] } | { ok: false; errors: string[] };

export function validateTenantManifest(input: unknown): ManifestValidation {
  const result = tenantManifestSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    };
  }
  return { ok: true, manifest: result.data, warnings: manifestWarnings(result.data) };
}

export function parseTenantManifestYaml(source: string): ManifestValidation {
  let data: unknown;
  try {
    data = parseYaml(source);
  } catch (error) {
    return { ok: false, errors: [`Invalid YAML: ${(error as Error).message}`] };
  }
  return validateTenantManifest(data);
}

/** The academy's primary domain: the first one listed. */
export function primaryDomain(tenant: Pick<TenantSettings, "domains">): string {
  const [first] = tenant.domains;
  if (!first) throw new Error("Tenant has no domains");
  return first;
}

export function tenantLocales(tenant: Pick<TenantSettings, "locales">): Locale[] {
  return [...tenant.locales];
}

/**
 * Target of the verification page's call to action. Without a configured URL
 * it is the academy's own entry link for the same course, tagged so the
 * funnel can attribute sign-ups to shared credentials.
 */
export function buildVerificationCtaUrl(
  cta: TenantSettings["verification_cta"],
  context: {
    academyOrigin: string;
    courseSlug: string;
    pathSlug?: string | null;
    publicId: string;
  },
): string {
  if (!cta.url) {
    const params = new URLSearchParams({ course: context.courseSlug });
    if (context.pathSlug) params.set("path", context.pathSlug);
    params.set("utm_source", "verification");
    params.set("utm_medium", "credential");
    params.set("utm_content", context.publicId);
    return `${context.academyOrigin}/start?${params.toString()}`;
  }
  const filled = cta.url
    .replaceAll("{course}", encodeURIComponent(context.courseSlug))
    .replaceAll("{path}", encodeURIComponent(context.pathSlug ?? ""));
  return filled.startsWith("/") ? `${context.academyOrigin}${filled}` : filled;
}

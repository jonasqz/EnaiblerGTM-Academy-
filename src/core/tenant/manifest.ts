import { parse as parseYaml } from "yaml";
import { z } from "zod";

import {
  checkDeliveryMode,
  deliveryModeSchema,
  type DeliveryModeIssue,
} from "@/core/compliance/delivery-mode";
import {
  describeFinding,
  lintLocalizedWording,
  lintWording,
  type WordingContext,
  type WordingFinding,
} from "@/core/compliance/wording-lint";
import { COMPLETION_MODES } from "@/core/courses/completion";
import { shareAttribution, type ShareChannel } from "@/core/credentials/share";
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
import { themeContrastIssues, type ContrastIssue } from "@/core/theme/contrast";
import { isBundledFont, uploadedFamilies } from "@/core/theme/fonts";
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

/** A LinkedIn hashtag, stored without "#": letters, digits and underscores. */
const hashtagSchema = z
  .string()
  .trim()
  .regex(/^#?[\p{L}\p{N}_]{1,40}$/u, "A hashtag is one word: letters, digits and _")
  .transform((tag) => tag.replace(/^#/, ""));

/**
 * What learners are offered to post about their credential (brief §6). The
 * text is a suggestion they can change; {course}, {academy}, {proof},
 * {artifact} and {url} are filled in. Without it, a text per completion mode.
 */
const sharingSchema = z.strictObject({
  post_text: z
    .partialRecord(localeSchema, z.string().trim().min(1).max(1200))
    .refine((value) => Object.keys(value).length > 0, "Write it in at least one language")
    .refine(
      (value) =>
        Object.values(value).every(
          (text) => !/\{(?!(course|academy|proof|artifact|url)\})[^}]*\}/.test(text ?? ""),
        ),
      "Only {course}, {academy}, {proof}, {artifact} and {url} are filled in",
    )
    .optional(),
  hashtags: z.array(hashtagSchema).max(5).default([]),
});

export const FEATURE_KEYS = ["paths", "levels", "cohorts", "ai_review", "showcase"] as const;

export const featuresSchema = z.strictObject({
  paths: z.boolean().default(false),
  levels: z.boolean().default(false),
  cohorts: z.boolean().default(false),
  ai_review: z.boolean().default(true),
  showcase: z.boolean().default(false),
});
export type Features = z.output<typeof featuresSchema>;

/**
 * Each part falls back: the name to the academy's name, the address to the
 * platform sender (a custom address needs the relay to sign for its domain).
 * Self-serve academies set only where replies go.
 */
export const emailSenderSchema = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  address: z.email().optional(),
  reply_to: z.email().optional(),
});

export const tenantSettingsSchema = z.strictObject({
  slug: slugSchema,
  domains: z.array(domainSchema).min(1).max(20),
  locales: z.array(localeSchema).min(1),
  default_locale: localeSchema,
  /** A brand, never a person ("Scaling Product Academy"). */
  author_display_name: z.string().trim().min(2).max(80),
  /**
   * The academy's own legal pages. Self-serve academies start without them;
   * publishing a course requires the imprint and privacy page (see publish-check).
   */
  legal_links: z
    .strictObject({
      imprint: httpsUrlSchema.optional(),
      privacy: httpsUrlSchema.optional(),
      terms: httpsUrlSchema.optional(),
    })
    .prefault({}),
  /** The academy's own website (brand import, links back). */
  website: httpsUrlSchema.optional(),
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
  sharing: sharingSchema.prefault({}),
  review_tone: z.enum(REVIEW_TONES).default("warm"),
});
export type TenantSettings = z.output<typeof tenantSettingsSchema>;

export const terminologySchema = z.strictObject({
  path: termOverrideSchema.optional(),
  course: termOverrideSchema.optional(),
  lesson: termOverrideSchema.optional(),
  assignment: termOverrideSchema.optional(),
  artifact: termOverrideSchema.optional(),
  test: termOverrideSchema.optional(),
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
  /**
   * How learners finish: `work` (the default for new courses), `test` or
   * `work_and_test`. Left out, re-applying keeps what authors chose in the Studio.
   */
  completion: z.enum(COMPLETION_MODES).optional(),
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
  // What learners post about their credential is held to the credential's own wording.
  if (manifest.tenant.sharing.post_text) {
    add(
      ["tenant", "sharing", "post_text"],
      lintLocalizedWording(manifest.tenant.sharing.post_text, "credential_template"),
    );
  }
  add(
    ["tenant", "sharing", "hashtags"],
    text(manifest.tenant.sharing.hashtags.join(" "), "credential_template"),
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
        // Marked, so the Studio can word blocked words itself (it lints them in its own check).
        ctx.addIssue({
          code: "custom",
          path: check.path,
          message: describeFinding(finding),
          params: { wording: true },
        });
      }
    }

    for (const issue of manifest.theme ? themeContrastIssues(manifest.theme) : []) {
      if (issue.severity === "error") {
        ctx.addIssue({ code: "custom", path: ["theme", "colors"], message: issue.message });
      }
    }
  });

export type TenantManifestInput = z.input<typeof tenantManifestSchema>;
export type TenantManifest = z.output<typeof tenantManifestSchema>;

/**
 * Non-blocking findings: things that are valid but probably not what the
 * author wants. By code, so the Studio can word them; the command line uses
 * `describeManifestWarning`.
 */
export type ManifestWarning =
  | { code: "paths_unused" | "paths_off" | "levels_unused" | "levels_off" }
  | { code: "no_sender" | "legal_placeholders" | "legal_missing" }
  | { code: "contrast"; issue: ContrastIssue }
  | { code: "font_unavailable"; family: string }
  | { code: "course_not_publishable"; course: string; issue: DeliveryModeIssue };

export function manifestWarningList(manifest: TenantManifest): ManifestWarning[] {
  const warnings: ManifestWarning[] = [];
  const { tenant } = manifest;
  const theme = manifest.theme ?? DEFAULT_THEME;

  if (tenant.features.paths && manifest.paths.length === 0) warnings.push({ code: "paths_unused" });
  if (!tenant.features.paths && manifest.paths.length > 0) warnings.push({ code: "paths_off" });
  if (tenant.features.levels && manifest.levels.length === 0)
    warnings.push({ code: "levels_unused" });
  if (!tenant.features.levels && manifest.levels.length > 0) warnings.push({ code: "levels_off" });
  if (!tenant.email_sender?.address) warnings.push({ code: "no_sender" });

  const legal = Object.values(tenant.legal_links).filter((url): url is string => Boolean(url));
  if (new Set(legal).size < legal.length || legal.some((url) => new URL(url).pathname === "/")) {
    warnings.push({ code: "legal_placeholders" });
  }
  if (!tenant.legal_links.imprint || !tenant.legal_links.privacy) {
    warnings.push({ code: "legal_missing" });
  }

  for (const issue of themeContrastIssues(theme)) {
    if (issue.severity === "warning") warnings.push({ code: "contrast", issue });
  }

  const uploaded = uploadedFamilies(theme.fonts.files);
  for (const family of new Set([theme.fonts.display, theme.fonts.body])) {
    if (!isBundledFont(family) && !uploaded.includes(family) && !theme.fonts.source_urls.length) {
      warnings.push({ code: "font_unavailable", family });
    }
  }

  for (const course of manifest.courses) {
    for (const issue of checkDeliveryMode({ deliveryMode: course.delivery_mode })) {
      warnings.push({ code: "course_not_publishable", course: course.slug, issue });
    }
  }

  return warnings;
}

/** The English wording, for `tenant:apply` and logs. */
export function describeManifestWarning(warning: ManifestWarning): string {
  switch (warning.code) {
    case "paths_unused":
      return "The paths feature is on, but no paths are defined.";
    case "paths_off":
      return "Paths are defined, but the paths feature is off.";
    case "levels_unused":
      return "The levels feature is on, but no levels are defined.";
    case "levels_off":
      return "Levels are defined, but the levels feature is off.";
    case "no_sender":
      return "No email_sender address set: mail goes out from the platform address.";
    case "legal_placeholders":
      return "Legal links look like placeholders (shared or pointing at a home page): set the exact pages before go-live.";
    case "legal_missing":
      return "No imprint or privacy page yet: courses cannot be published until both are set.";
    case "contrast":
      return warning.issue.message;
    case "font_unavailable":
      return `Font "${warning.family}" is neither bundled nor uploaded and no source_urls are given: browsers will fall back.`;
    case "course_not_publishable":
      return `Course "${warning.course}": ${warning.issue.message} It can be set up but not published.`;
  }
}

export function manifestWarnings(manifest: TenantManifest): string[] {
  return manifestWarningList(manifest).map(describeManifestWarning);
}

export type ManifestValidation =
  | { ok: true; manifest: TenantManifest; warnings: string[]; findings: ManifestWarning[] }
  | { ok: false; errors: string[] };

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
  const findings = manifestWarningList(result.data);
  return {
    ok: true,
    manifest: result.data,
    warnings: findings.map(describeManifestWarning),
    findings,
  };
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
 * it is the academy's own entry link for the same course. Either way it is
 * tagged with the credential and the LinkedIn channel it was shared on, so
 * the funnel (or the academy's own analytics) can attribute new learners.
 */
export function buildVerificationCtaUrl(
  cta: TenantSettings["verification_cta"],
  context: {
    academyOrigin: string;
    courseSlug: string;
    pathSlug?: string | null;
    publicId: string;
    via?: ShareChannel | null;
  },
): string {
  const attribution = shareAttribution(context.publicId, context.via ?? null);
  if (!cta.url) {
    const params = new URLSearchParams({ course: context.courseSlug });
    if (context.pathSlug) params.set("path", context.pathSlug);
    for (const [key, value] of Object.entries(attribution)) params.set(key, value);
    return `${context.academyOrigin}/start?${params.toString()}`;
  }
  const filled = cta.url
    .replaceAll("{course}", encodeURIComponent(context.courseSlug))
    .replaceAll("{path}", encodeURIComponent(context.pathSlug ?? ""));
  const target = new URL(filled, context.academyOrigin);
  // The academy's own tags stay; ours fill in what it left out.
  for (const [key, value] of Object.entries(attribution)) {
    if (!target.searchParams.has(key)) target.searchParams.set(key, value);
  }
  return target.toString();
}

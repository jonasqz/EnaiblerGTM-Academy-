import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildVerificationCtaUrl,
  parseTenantManifestYaml,
  validateTenantManifest,
  type TenantManifestInput,
} from "@/core/tenant/manifest";
import { themeToCssVariables } from "@/core/theme/css";

const root = join(__dirname, "../../..");

/** The YAML block of Appendix A, read straight from the brief. */
function appendixA(): string {
  const brief = readFileSync(join(root, "docs/product-brief-v2.md"), "utf8");
  const section = brief.slice(brief.indexOf("## Appendix A"));
  const match = /```yaml\n([\s\S]*?)```/.exec(section);
  if (!match?.[1]) throw new Error("Appendix A YAML block not found in the brief");
  return match[1];
}

function baseManifest(overrides: Partial<TenantManifestInput["tenant"]> = {}): TenantManifestInput {
  return {
    tenant: {
      slug: "acme",
      domains: ["academy.acme.example"],
      locales: ["en"],
      default_locale: "en",
      author_display_name: "Acme Academy",
      legal_links: {
        imprint: "https://acme.example/imprint",
        privacy: "https://acme.example/privacy",
        terms: "https://acme.example/terms",
      },
      verification_cta: { label: "Start this course" },
      ...overrides,
    },
  };
}

function errorsOf(input: unknown): string[] {
  const result = validateTenantManifest(input);
  return result.ok ? [] : result.errors;
}

describe("Appendix A: tenant 0 is pure configuration", () => {
  it("validates the brief's YAML with only the <tenant URL> placeholders filled in", () => {
    const yaml = appendixA().replaceAll('"<tenant URL>"', '"https://scaling-product.com/"');
    const result = parseTenantManifestYaml(yaml);
    if (!result.ok) throw new Error(result.errors.join("\n"));
    const { manifest } = result;

    expect(manifest.tenant.slug).toBe("scaling-product");
    expect(manifest.tenant.features).toEqual({
      paths: true,
      levels: true,
      cohorts: false,
      ai_review: true,
      showcase: false,
    });
    expect(manifest.paths.map((path) => path.slug)).toEqual([
      "validator",
      "builder",
      "scaler",
      "navigator",
    ]);
    expect(manifest.paths[0]?.title).toEqual({ de: "Validator", en: "Validator" });
    expect(manifest.levels.map((level) => level.rule)).toEqual([
      { type: "courses_completed_in_path", min: 1 },
      { type: "courses_completed_in_path", min: 2 },
      { type: "path_complete" },
      { type: "manual_grant" },
    ]);
    expect(manifest.courses).toEqual([
      { slug: "validation-lab", delivery_mode: "free_async", launch: "2027-01" },
      { slug: "market-sizing-with-ai", delivery_mode: "free_async", launch: "2027-03" },
    ]);
    expect(manifest.terminology.path).toEqual({ en: "Character", de: "Charakter" });
  });

  it("expresses tenant 0's square, outlined look through theme tokens", () => {
    const yaml = appendixA().replaceAll('"<tenant URL>"', '"https://scaling-product.com/"');
    const result = parseTenantManifestYaml(yaml);
    if (!result.ok || !result.manifest.theme) throw new Error("expected a theme");
    const css = themeToCssVariables(result.manifest.theme);
    expect(css["--tenant-radius"]).toBe("0px");
    expect(css["--tenant-border-width"]).toBe("3px");
    expect(css["--tenant-shadow"]).toBe("4px 4px 0px #2E2A36");
    expect(css["--tenant-font-display"]).toMatch(/^"Bungee",/);
    expect(css["--tenant-accent-4"]).toBe("#3B3553");
  });
});

describe("tenant manifests in config/tenants", () => {
  const dir = join(root, "config/tenants");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".yaml"))) {
    it(`${file} is valid`, () => {
      const result = parseTenantManifestYaml(readFileSync(join(dir, file), "utf8"));
      if (!result.ok) throw new Error(result.errors.join("\n"));
      expect(result.manifest.tenant.slug).toBe(file.replace(/\.yaml$/, ""));
    });
  }

  it("flags the placeholder legal links of tenant 0 until they are set", () => {
    const result = parseTenantManifestYaml(readFileSync(join(dir, "scaling-product.yaml"), "utf8"));
    if (!result.ok) throw new Error(result.errors.join("\n"));
    expect(
      result.warnings.some((warning) => warning.startsWith("Legal links look like placeholders")),
    ).toBe(true);
  });
});

describe("manifest validation", () => {
  it("accepts a minimal manifest and applies defaults", () => {
    const result = validateTenantManifest(baseManifest());
    if (!result.ok) throw new Error(result.errors.join("\n"));
    expect(result.manifest.tenant.features).toEqual({
      paths: false,
      levels: false,
      cohorts: false,
      ai_review: true,
      showcase: false,
    });
    expect(result.manifest.tenant.anonymity_mode).toBe(true);
    expect(result.manifest.theme).toBeUndefined();
    expect(result.manifest.paths).toEqual([]);
  });

  it("requires default_locale to be one of the locales", () => {
    expect(errorsOf(baseManifest({ default_locale: "de" }))).toContain(
      "tenant.default_locale: default_locale must be one of locales",
    );
  });

  it("rejects levels without the paths feature", () => {
    const errors = errorsOf(baseManifest({ features: { levels: true } }));
    expect(errors.join("\n")).toMatch(/enable the paths feature/);
  });

  it("rejects paths that reference unknown courses", () => {
    const errors = errorsOf({
      ...baseManifest(),
      paths: [{ title: "Builder", courses: ["nope"] }],
    });
    expect(errors).toContain('paths.0.courses: Unknown course "nope"');
  });

  it("rejects domains with scheme or path", () => {
    expect(
      errorsOf(baseManifest({ domains: ["https://academy.acme.example"] })).length,
    ).toBeGreaterThan(0);
    expect(errorsOf(baseManifest({ domains: ["academy.acme.example/x"] })).length).toBeGreaterThan(
      0,
    );
  });

  it("requires https legal links", () => {
    const errors = errorsOf(
      baseManifest({
        legal_links: {
          imprint: "http://acme.example/i",
          privacy: "https://acme.example/p",
          terms: "https://acme.example/t",
        },
      }),
    );
    expect(errors.join("\n")).toMatch(/imprint/);
  });

  it("blocks 'certified' wording in names that appear on credentials", () => {
    const errors = errorsOf({
      ...baseManifest({ author_display_name: "Acme Certified Academy" }),
      terminology: { credential: { en: "Certification" } },
      courses: [
        {
          slug: "pm",
          delivery_mode: "free_async",
          title: { en: "Certified Product Manager", de: "Zertifizierter PM" },
        },
      ],
    });
    const joined = errors.join("\n");
    expect(joined).toMatch(/tenant\.author_display_name/);
    expect(joined).toMatch(/terminology\.credential\.en/);
    expect(joined).toMatch(/courses\.0\.title/);
    expect(errors.filter((error) => error.startsWith("courses.0.title"))).toHaveLength(2);
  });

  it("rejects fonts loaded from Google's CDN", () => {
    const errors = errorsOf({
      ...baseManifest(),
      theme: {
        colors: { ink: "#000000", surface: "#FFFFFF", card: "#FFFFFF", primary: "#0055FF" },
        fonts: {
          display: "Lobster",
          body: "Lobster",
          source_urls: ["https://fonts.googleapis.com/css2?family=Lobster"],
        },
        radius: 8,
        border_width: 1,
        shadow: { x: 0, y: 2, blur: 8, color: "#00000022" },
      },
    });
    expect(errors.join("\n")).toMatch(/Self-host fonts/);
  });

  it("warns about paid courses and unbundled fonts instead of failing", () => {
    const result = validateTenantManifest({
      ...baseManifest(),
      theme: {
        colors: { ink: "#000000", surface: "#FFFFFF", card: "#FFFFFF", primary: "#0055FF" },
        fonts: { display: "Lobster", body: "Inter" },
        radius: 8,
        border_width: 1,
        shadow: { x: 0, y: 2, blur: 8, color: "#00000022" },
      },
      courses: [{ slug: "live", delivery_mode: "paid_live" }],
    });
    if (!result.ok) throw new Error(result.errors.join("\n"));
    expect(result.warnings.join("\n")).toMatch(/Paid courses stay blocked/);
    expect(result.warnings.join("\n")).toMatch(/Font "Lobster" is neither bundled nor uploaded/);
  });

  it("lets a course say how learners finish it, and leaves it to the Studio otherwise", () => {
    const result = validateTenantManifest({
      ...baseManifest(),
      courses: [
        { slug: "quiz", delivery_mode: "free_async", completion: "test" },
        { slug: "both", delivery_mode: "free_async", completion: "work_and_test" },
        { slug: "plain", delivery_mode: "free_async" },
      ],
    });
    if (!result.ok) throw new Error(result.errors.join("\n"));
    expect(result.manifest.courses.map((course) => course.completion)).toEqual([
      "test",
      "work_and_test",
      undefined,
    ]);
    expect(
      errorsOf({
        ...baseManifest(),
        courses: [{ slug: "exam", delivery_mode: "free_async", completion: "exam" }],
      }).join("\n"),
    ).toMatch(/courses\.0\.completion/);
  });

  it("rejects unknown keys so typos do not pass silently", () => {
    const errors = errorsOf({ ...baseManifest(), terminology: { paths: { en: "Characters" } } });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("verification call to action", () => {
  const context = {
    academyOrigin: "https://academy.scaling-product.com",
    courseSlug: "validation-lab",
    pathSlug: "validator",
    publicId: "ABCD2345EFGH6789",
  };

  it("defaults to the academy's own entry link for the same course", () => {
    const url = new URL(buildVerificationCtaUrl({ label: { en: "Start" } }, context));
    expect(url.origin + url.pathname).toBe("https://academy.scaling-product.com/start");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      course: "validation-lab",
      path: "validator",
      utm_source: "verification",
      utm_medium: "credential",
      utm_content: "ABCD2345EFGH6789",
    });
  });

  it("fills {course} and {path} placeholders in configured URLs and tags them too", () => {
    expect(
      buildVerificationCtaUrl(
        { label: { en: "Go" }, url: "https://scaling-product.com/c/{course}?utm_source=academy" },
        context,
      ),
    ).toBe(
      "https://scaling-product.com/c/validation-lab?utm_source=academy&utm_medium=credential&utm_content=ABCD2345EFGH6789",
    );
    expect(buildVerificationCtaUrl({ label: { en: "Go" }, url: "/paths/{path}" }, context)).toBe(
      "https://academy.scaling-product.com/paths/validator?utm_source=verification&utm_medium=credential&utm_content=ABCD2345EFGH6789",
    );
  });

  it("says which LinkedIn channel a visitor came from", () => {
    const url = new URL(
      buildVerificationCtaUrl({ label: { en: "Start" } }, { ...context, via: "post" }),
    );
    expect(url.searchParams.get("utm_source")).toBe("linkedin");
    expect(url.searchParams.get("utm_medium")).toBe("post");
    expect(url.searchParams.get("utm_content")).toBe("ABCD2345EFGH6789");
  });

  it("takes a suggested post and hashtags, held to the credential's wording", () => {
    const valid = validateTenantManifest(
      baseManifest({
        sharing: {
          post_text: { en: "Finished {course} at {academy}: {url}" },
          hashtags: ["#Freelancing", "invoices"],
        },
      }),
    );
    if (!valid.ok) throw new Error(valid.errors.join("\n"));
    expect(valid.manifest.tenant.sharing.hashtags).toEqual(["Freelancing", "invoices"]);
    expect(
      errorsOf(baseManifest({ sharing: { post_text: { en: "Now certified! {url}" } } })).length,
    ).toBeGreaterThan(0);
    expect(errorsOf(baseManifest({ sharing: { hashtags: ["certified"] } })).length).toBeGreaterThan(
      0,
    );
    expect(errorsOf(baseManifest({ sharing: { post_text: { en: "Hi {name}" } } })).length).toBe(1);
    expect(errorsOf(baseManifest({ sharing: { hashtags: ["two words"] } })).length).toBe(1);
  });

  it("rejects CTA URLs with unknown placeholders or other schemes", () => {
    expect(
      errorsOf(baseManifest({ verification_cta: { label: "Go", url: "https://x.example/{user}" } }))
        .length,
    ).toBe(1);
    expect(
      errorsOf(baseManifest({ verification_cta: { label: "Go", url: "javascript:alert(1)" } }))
        .length,
    ).toBe(1);
  });
});

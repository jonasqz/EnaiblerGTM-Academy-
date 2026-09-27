import { describe, expect, it } from "vitest";

import {
  CTA_PLACEHOLDERS,
  ctaAddress,
  linkedInPageId,
  MAX_HASHTAGS,
  parseHashtags,
  POST_MAX_LENGTH,
  POST_PLACEHOLDERS,
  postsWithoutUrl,
  sharingIssues,
  sharingWording,
  unknownPlaceholders,
  type SharingInput,
} from "@/core/credentials/share-settings";
import { suggestedPost } from "@/core/credentials/share";
import { postWithoutUrlText, sharingIssueText } from "@/core/i18n/studio/helpers";
import { studioText } from "@/core/i18n/studio/translator";
import { createTranslator } from "@/core/i18n/translator";
import { CTA_URL_PLACEHOLDERS, tenantManifestSchema } from "@/core/tenant/manifest";

const input = (overrides: Partial<SharingInput> = {}): SharingInput => ({
  linkedinOrganizationId: null,
  postText: {},
  hashtags: [],
  ctaLabel: { en: "Start this course" },
  ctaUrl: null,
  ...overrides,
});

/** The sharing settings inside a whole manifest, as the Studio saves them. */
function manifestIssues(settings: SharingInput) {
  const result = tenantManifestSchema.safeParse({
    tenant: {
      slug: "acme",
      domains: ["academy.acme.example"],
      locales: ["en", "de"],
      default_locale: "en",
      author_display_name: "Acme Academy",
      linkedin_organization_id: settings.linkedinOrganizationId ?? undefined,
      sharing: {
        ...(Object.keys(settings.postText).length ? { post_text: settings.postText } : {}),
        hashtags: settings.hashtags,
      },
      verification_cta: {
        label: settings.ctaLabel,
        ...(settings.ctaUrl ? { url: settings.ctaUrl } : {}),
      },
    },
  });
  return result.success ? [] : sharingIssues(result.error.issues, settings);
}

describe("sharing settings in the Studio", () => {
  it("knows the same placeholders as the post and the call to action", () => {
    const template = POST_PLACEHOLDERS.map((name) => `{${name}}`).join(" ");
    const post = suggestedPost(
      createTranslator({ locale: "en" }),
      {
        basis: "work",
        course: "C",
        academy: "A",
        artifact: "X",
        proof: "P",
        url: "https://academy.example/verify/ABCD",
      },
      { template, hashtags: [] },
    );
    expect(post).not.toMatch(/[{}]/);
    expect(unknownPlaceholders(template)).toEqual([]);
    expect(CTA_PLACEHOLDERS).toEqual(CTA_URL_PLACEHOLDERS);
  });

  it("finds what a post has in braces that would stay as typed", () => {
    expect(unknownPlaceholders("Hi {name}, {course} {Course} {name} {{url}}")).toEqual([
      "{name}",
      "{Course}",
      "{{url}",
    ]);
    expect(postsWithoutUrl({ en: "Done: {url}", de: "Fertig mit {course}" })).toEqual(["de"]);
  });

  it("takes the LinkedIn page id or the page's admin address", () => {
    expect(linkedInPageId(" 12345678 ")).toBe("12345678");
    expect(linkedInPageId("https://www.linkedin.com/company/12345678/admin/dashboard/")).toBe(
      "12345678",
    );
    expect(linkedInPageId("linkedin.com/showcase/998877/admin")).toBe("998877");
    // A page name is not its id: left as typed, so the manifest refuses it.
    expect(linkedInPageId("https://www.linkedin.com/company/acme-gmbh/")).toBe(
      "https://www.linkedin.com/company/acme-gmbh/",
    );
    expect(linkedInPageId("  ")).toBeNull();
  });

  it("completes the button's own address the way admins type it", () => {
    expect(ctaAddress("your-company.com/courses/{course}")).toBe(
      "https://your-company.com/courses/{course}",
    );
    expect(ctaAddress("http://your-company.com")).toBe("https://your-company.com");
    expect(ctaAddress(" /paths/{path} ")).toBe("/paths/{path}");
    // Other schemes stay as typed, for the manifest to refuse.
    expect(ctaAddress("javascript:alert(1)")).toBe("javascript:alert(1)");
    expect(ctaAddress("")).toBeNull();
  });

  it("reads hashtags as typed, one per word, without repeats", () => {
    expect(parseHashtags("#Freelancing, invoices;#freelancing  #Cash_flow")).toEqual([
      "#Freelancing",
      "invoices",
      "#Cash_flow",
    ]);
    expect(parseHashtags("  ")).toEqual([]);
  });

  it("holds the post, its hashtags and the button to the credential's wording", () => {
    const findings = sharingWording(
      input({
        postText: { en: "I am certified!", de: "Kurs geschafft" },
        hashtags: ["#Zertifizierung"],
        ctaLabel: { en: "Get certified" },
      }),
    );
    expect(findings.map((finding) => [finding.match, finding.context])).toEqual([
      ["certified", "credential_template"],
      ["Zertifizierung", "credential_template"],
      ["certified", "cta_label"],
    ]);
    expect(sharingWording(input({ postText: { en: "Finished {course}: {url}" } }))).toEqual([]);
  });

  it("names what the manifest refused, by code", () => {
    expect(manifestIssues(input({ postText: { en: "Finished {course}: {url}" } }))).toEqual([]);
    expect(
      manifestIssues(input({ postText: { en: "Hi {name}: {url}", de: "Fertig: {url}" } })),
    ).toEqual([{ code: "placeholder", locale: "en", placeholders: ["{name}"] }]);
    expect(manifestIssues(input({ postText: { de: "x".repeat(POST_MAX_LENGTH + 1) } }))).toEqual([
      { code: "post_too_long", locale: "de", max: POST_MAX_LENGTH },
    ]);
    expect(manifestIssues(input({ postText: { de: "x".repeat(POST_MAX_LENGTH) } }))).toEqual([]);
    expect(manifestIssues(input({ hashtags: ["#ok", "c++"] }))).toEqual([
      { code: "hashtag", tag: "c++" },
    ]);
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `tag${i}`);
    expect(manifestIssues(input({ hashtags: tags(MAX_HASHTAGS) }))).toEqual([]);
    expect(manifestIssues(input({ hashtags: tags(MAX_HASHTAGS + 1) }))).toEqual([
      { code: "hashtag_count", max: MAX_HASHTAGS },
    ]);
    expect(manifestIssues(input({ linkedinOrganizationId: "acme-gmbh" }))).toEqual([
      { code: "linkedin_id" },
    ]);
    expect(manifestIssues(input({ ctaUrl: "https://acme.example/{user}" }))).toEqual([
      { code: "cta_url" },
    ]);
    expect(manifestIssues(input({ ctaUrl: "/courses/{course}?from={path}" }))).toEqual([]);
    expect(
      sharingIssues([{ path: ["theme", "colors"], message: "Too little contrast" }], input()),
    ).toEqual([{ code: "other", message: "theme.colors: Too little contrast" }]);
  });

  it("is worded in the team member's language, placeholders as typed", () => {
    const en = studioText("en");
    expect(
      sharingIssueText(en, { code: "placeholder", locale: "de", placeholders: ["{name}", "{x}"] }),
    ).toBe(
      "The post in German contains {name} and {x}, which cannot be filled in. Use {course}, {academy}, {proof}, {artifact} and {url}.",
    );
    expect(sharingIssueText(en, { code: "cta_url" })).toContain("only {course} and {path}");
    expect(sharingIssueText(en, { code: "hashtag_count", max: MAX_HASHTAGS })).toBe(
      "Use up to 5 hashtags.",
    );
    expect(postWithoutUrlText(studioText("de"), "en")).toMatch(
      /^Der Beitrag auf Englisch enthält kein \{url\}:/,
    );
  });
});

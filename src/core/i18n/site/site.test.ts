import { describe, expect, it } from "vitest";

import { lintWording } from "@/core/compliance/wording-lint";
import { SUPPORTED_LOCALES } from "@/core/i18n/locales";
import {
  isSitePage,
  SITE_COPY,
  SITE_PAGES,
  SITE_PATHS,
  siteMeta,
  sitePreview,
} from "@/core/i18n/site";

/** Keys, array lengths and where the strings are: what German and English must share. */
function shape(value: unknown): unknown {
  if (typeof value === "string") return "text";
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, key === "key" ? inner : shape(inner)]),
    );
  }
  return typeof value;
}

function strings(value: unknown, path = ""): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((inner, i) => strings(inner, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, inner]) => strings(inner, `${path}.${key}`));
  }
  return [];
}

describe("enaibler's website copy", () => {
  it("says the same things in German and English", () => {
    for (const [page, copy] of Object.entries(SITE_COPY)) {
      expect({ page, shape: shape(copy.de) }).toEqual({ page, shape: shape(copy.en) });
    }
  });

  it("never claims a certification, in any language (brief §9)", () => {
    for (const [page, copy] of Object.entries(SITE_COPY)) {
      for (const locale of SUPPORTED_LOCALES) {
        for (const [path, text] of strings(copy[locale])) {
          const where = `${page}.${locale}${path}`;
          expect({ where, findings: lintWording(text, "credential_template") }).toEqual({
            where,
            findings: [],
          });
          // The German credential is an "Abschlussbescheinigung", never a "Zertifikat".
          expect({ where, text: /zertifikat/i.test(text) }).toEqual({ where, text: false });
        }
      }
    }
  });

  it("gives every page a title and description that fit a search result", () => {
    for (const page of SITE_PAGES) {
      for (const locale of SUPPORTED_LOCALES) {
        const { title, description } = siteMeta(page, locale);
        expect({ page, locale, title: title.length <= 70 }).toEqual({ page, locale, title: true });
        expect({ page, locale, description: description.length <= 170 }).toEqual({
          page,
          locale,
          description: true,
        });
        expect(sitePreview(page, locale).title.length).toBeGreaterThan(10);
      }
    }
  });

  it("links the home page's audiences to their pages", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const item of SITE_COPY.home[locale].audiences.items) {
        expect(isSitePage(item.key)).toBe(true);
      }
    }
    expect(new Set(Object.values(SITE_PATHS)).size).toBe(SITE_PAGES.length);
  });
});

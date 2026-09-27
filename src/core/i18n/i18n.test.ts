import { describe, expect, it } from "vitest";

import { lintWording } from "@/core/compliance/wording-lint";
import { localize, localizedTextInputSchema, resolveLocale } from "@/core/i18n/locales";
import { MESSAGES, MESSAGE_KEYS } from "@/core/i18n/messages";
import { createTranslator } from "@/core/i18n/translator";

describe("localized text", () => {
  it("expands the plain-string shorthand to all locales", () => {
    expect(localizedTextInputSchema.parse("Loot")).toEqual({ de: "Loot", en: "Loot" });
  });

  it("rejects empty localized text", () => {
    expect(localizedTextInputSchema.safeParse({}).success).toBe(false);
    expect(localizedTextInputSchema.safeParse({ en: "  " }).success).toBe(false);
  });

  it("falls back through the given locales, then any available text", () => {
    expect(localize({ en: "Course" }, "de", ["en"])).toBe("Course");
    expect(localize({ de: "Kurs" }, "en")).toBe("Kurs");
    expect(localize(null, "en")).toBe("");
  });
});

describe("resolveLocale", () => {
  const tenant = { tenantLocales: ["de", "en"] as const, defaultLocale: "de" as const };

  it("prefers an explicit, enabled choice", () => {
    expect(resolveLocale({ ...tenant, requested: "en", acceptLanguage: "de-DE" })).toBe("en");
  });

  it("ignores locales the tenant does not offer", () => {
    expect(resolveLocale({ tenantLocales: ["de"], defaultLocale: "de", requested: "en" })).toBe(
      "de",
    );
  });

  it("uses Accept-Language by quality", () => {
    expect(resolveLocale({ ...tenant, acceptLanguage: "fr-FR, en-GB;q=0.8, de;q=0.5" })).toBe("en");
    expect(resolveLocale({ ...tenant, acceptLanguage: "fr" })).toBe("de");
  });
});

describe("translator", () => {
  it("has a German string for every English key", () => {
    for (const key of MESSAGE_KEYS) {
      expect(MESSAGES.de[key], key).toBeTruthy();
    }
  });

  it("uses platform terminology by default", () => {
    const en = createTranslator({ locale: "en" });
    expect(en.t("home.choosePath")).toBe("Choose your Track");
    expect(en.term("credential")).toBe("Certificate of Completion");
    const de = createTranslator({ locale: "de" });
    expect(de.t("home.choosePath")).toBe("Lernpfad wählen");
  });

  it("applies tenant terminology, including plurals", () => {
    const t = createTranslator({
      locale: "en",
      termOverrides: {
        path: { en: { one: "Character", other: "Characters" } },
        artifact: { en: "Loot", de: "Loot" },
      },
    });
    expect(t.t("home.choosePath")).toBe("Choose your Character");
    expect(t.term("path", { plural: true })).toBe("Characters");
    expect(t.t("verify.artifact", { name: "Validated idea brief" })).toBe(
      "Loot: Validated idea brief",
    );
    expect(t.term("artifact", { plural: true })).toBe("Loot");
  });

  it("applies per-key string overrides only for the locales they define", () => {
    const overrides = { "home.start": { en: "Play" } };
    expect(createTranslator({ locale: "en", messageOverrides: overrides }).t("home.start")).toBe(
      "Play",
    );
    expect(createTranslator({ locale: "de", messageOverrides: overrides }).t("home.start")).toBe(
      "Starten",
    );
  });

  it("interpolates variables and leaves unknown placeholders visible", () => {
    const t = createTranslator({ locale: "en" });
    expect(t.t("verify.level", { n: 2, name: "Practitioner" })).toBe("Level 2 · Practitioner");
    expect(t.t("signIn.title")).toBe("Sign in to {academy}");
  });
});

describe("UI copy", () => {
  it("never claims a certification, in any locale (brief §9)", () => {
    for (const messages of Object.values(MESSAGES)) {
      for (const [key, text] of Object.entries(messages)) {
        expect({ key, findings: lintWording(text, "credential_template") }).toEqual({
          key,
          findings: [],
        });
      }
    }
  });
});

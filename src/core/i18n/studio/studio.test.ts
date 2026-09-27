import { describe, expect, it } from "vitest";

import { checkDeliveryMode } from "@/core/compliance/delivery-mode";
import { lintWording } from "@/core/compliance/wording-lint";
import { checkCoursePublishable } from "@/core/courses/publish-check";
import { STUDIO_AREAS, STUDIO_MESSAGES } from "@/core/i18n/studio/index";
import {
  cohortDates,
  manifestWarningText,
  publishIssueText,
  wordingText,
} from "@/core/i18n/studio/helpers";
import { studioText } from "@/core/i18n/studio/translator";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("Studio catalogue", () => {
  it("keeps every key in one area", () => {
    const seen = new Map<string, string>();
    for (const [area, messages] of Object.entries(STUDIO_AREAS)) {
      for (const key of Object.keys(messages.en)) {
        expect(seen.get(key), `${key} in ${area}`).toBeUndefined();
        seen.set(key, area);
      }
    }
  });

  it("says the same in German, with the same placeholders", () => {
    for (const [key, english] of Object.entries(STUDIO_MESSAGES.en)) {
      const german = STUDIO_MESSAGES.de[key as keyof typeof STUDIO_MESSAGES.de];
      expect(german, key).toBeTruthy();
      expect(placeholders(german), key).toEqual(placeholders(english));
    }
  });

  it("has both plural forms wherever it has one", () => {
    const keys = new Set(Object.keys(STUDIO_MESSAGES.en));
    for (const key of keys) {
      if (key.endsWith(".one")) expect(keys.has(key.replace(/\.one$/, ".other")), key).toBe(true);
      if (key.endsWith(".other")) expect(keys.has(key.replace(/\.other$/, ".one")), key).toBe(true);
    }
  });

  it("never claims a certification (brief §9), except where it explains the rule", () => {
    const explaining = new Set(["common.wording.hint.accredited", "common.wording.hint.state"]);
    for (const messages of Object.values(STUDIO_MESSAGES)) {
      for (const [key, text] of Object.entries(messages)) {
        if (explaining.has(key)) continue;
        expect({ key, findings: lintWording(text, "credential_template") }).toEqual({
          key,
          findings: [],
        });
      }
    }
  });
});

describe("Studio translator", () => {
  it("fills in values, counts and dates in the team member's language", () => {
    const de = studioText("de");
    expect(de.n("common.lesson", 1)).toBe("1 Lektion");
    expect(de.n("common.lesson", 3)).toBe("3 Lektionen");
    expect(de.t("overview.courseStats", { started: 1200, completed: 3 })).toBe(
      "1.200 begonnen · 3 abgeschlossen",
    );
    // Berlin time, not the server's.
    expect(de.date(new Date("2026-09-27T08:45:00Z"), "time")).toBe("10:45");
    expect(studioText("en").date(new Date("2026-09-27T08:45:00Z"), "dateTime")).toBe(
      "27 Sept 2026, 10:45",
    );
    expect(de.date(new Date("2026-03-15T12:00:00Z"), "month")).toBe("März 2026");
  });

  it("words what the core rules report by code", () => {
    const de = studioText("de");
    const check = checkCoursePublishable({
      course: {
        title: { de: "Zertifizierter Pitch" },
        summary: null,
        languages: ["de", "en"],
        deliveryMode: "free_async",
        estMinutes: null,
      },
      lessons: [],
      assignment: null,
      rubric: null,
    } as unknown as Parameters<typeof checkCoursePublishable>[0]);
    const texts = [...check.errors, ...check.warnings].map((issue) => publishIssueText(de, issue));
    expect(texts).toContain("Ergänze den Kurstitel auf Englisch.");
    expect(texts).toContain(
      "„Zertifizierter“ ist in Kurstiteln nicht erlaubt. Sprich von „Abschlussbescheinigung“ oder beschreibe, was gebaut wurde.",
    );
    expect(texts).toContain("Gib eine geschätzte Dauer für den Katalog an.");
    expect(
      wordingText(studioText("en"), {
        ruleId: "en.accredited",
        label: "",
        match: "accredited",
        index: 0,
        severity: "warning",
        context: "lesson_text",
        hint: "",
      }),
    ).toBe(
      "“accredited” should be avoided in lesson text. Only use accreditation wording for an actual accreditation, confirmed by counsel.",
    );
  });

  it("words what saving the settings found", () => {
    const de = studioText("de");
    const [paid] = checkDeliveryMode({ deliveryMode: "paid_live" });
    const texts = [
      manifestWarningText(de, { code: "paths_unused" }),
      manifestWarningText(de, { code: "font_unavailable", family: "Lobster" }),
      manifestWarningText(de, { code: "course_not_publishable", course: "live", issue: paid! }),
    ];
    expect(texts[0]).toBe("Das Modul Lernpfade ist an, aber es gibt noch keine Lernpfade.");
    expect(texts[1]).toContain("„Lobster“");
    expect(texts[2]).toMatch(
      /^Kurs „live“: .+ Er kann eingerichtet, aber nicht veröffentlicht werden\.$/,
    );
    for (const text of texts) expect(text).not.toMatch(/[{}]/);
  });

  it("writes cohort dates", () => {
    expect(cohortDates(studioText("de"), "2026-10-05", "2026-11-02")).toBe(
      "05.10.2026 – 02.11.2026",
    );
    expect(cohortDates(studioText("en"), null, null)).toBe("no dates");
  });
});

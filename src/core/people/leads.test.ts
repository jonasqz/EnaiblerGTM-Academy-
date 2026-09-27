import { describe, expect, it } from "vitest";

import { localize } from "@/core/i18n/locales";
import { CONTACT_COLUMNS, LEAD_COLUMNS, leadCsvRow, type Lead } from "@/core/people/leads";
import { toCsv } from "@/core/shared/csv";

const lead: Lead = {
  userId: "u1",
  alias: "L-7F3K",
  name: "=Lea",
  email: "lea@example.com",
  locale: "de",
  wording: "Acme Academy darf mich zu ihren Angeboten kontaktieren.",
  requestedAt: new Date("2026-09-20T08:00:00Z"),
  agreedAt: new Date("2026-09-20T08:00:00Z"),
  completed: [
    {
      courseId: "c1",
      title: { en: "Get paid on time", de: "Pünktlich bezahlt werden" },
      completedAt: new Date("2026-09-12T15:30:00Z"),
      basis: "work",
      visibility: "public",
      sharedOn: ["post", "profile"],
    },
    {
      courseId: "c2",
      title: { en: "Price with confidence" },
      completedAt: new Date("2026-09-18T09:00:00Z"),
      basis: "test",
      visibility: "private",
      sharedOn: [],
    },
  ],
  inProgress: [],
  source: {
    utm: { source: "linkedin", medium: "post" },
    viaCertificate: { courseTitle: { en: "Get paid on time", de: "Pünktlich bezahlt werden" } },
  },
};

describe("leads for a CRM (brief §9, lead handoff)", () => {
  it("keeps the contact columns first", () => {
    expect(LEAD_COLUMNS.slice(0, CONTACT_COLUMNS.length)).toEqual([...CONTACT_COLUMNS]);
  });

  it("says what they completed, how, and where they came from", () => {
    const row = leadCsvRow(lead, (title) => localize(title, "de"));
    expect(row).toEqual([
      "lea@example.com",
      "=Lea",
      "de",
      lead.wording,
      "2026-09-20T08:00:00.000Z",
      "2026-09-20T08:00:00.000Z",
      "Pünktlich bezahlt werden (2026-09-12, work, public, linkedin_post, linkedin_profile) | Price with confidence (2026-09-18, test, private)",
      "linkedin",
      "post",
      null,
      true,
      "Pünktlich bezahlt werden",
    ]);
    // A name typed as a formula stays text in a spreadsheet.
    expect(toCsv([row])).toContain(",'=Lea,");
  });

  it("leaves the source empty until they start a course", () => {
    const row = leadCsvRow({ ...lead, completed: [], source: null }, (title) =>
      localize(title, "en"),
    );
    expect(row.slice(6)).toEqual(["", null, null, null, false, null]);
  });
});

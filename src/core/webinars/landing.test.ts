import { describe, expect, it } from "vitest";

import {
  DEFAULT_LANDING_BLOCKS,
  DEFAULT_REGISTRATION_FORM,
  fieldId,
  formFieldSchema,
  landingBlocksSchema,
  lintWebinarContent,
  presentersSchema,
  registrationFormSchema,
  shownPresenters,
  validateAnswers,
  type RegistrationForm,
} from "@/core/webinars/landing";

const issues = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

describe("landing page blocks", () => {
  it("start with the hero and always have the form", () => {
    expect(landingBlocksSchema.safeParse(DEFAULT_LANDING_BLOCKS).success).toBe(true);
    expect(issues(landingBlocksSchema.safeParse([{ type: "register" }]))).toEqual(["hero_first"]);
    expect(issues(landingBlocksSchema.safeParse([{ type: "hero" }]))).toEqual(["register_missing"]);
    expect(
      issues(
        landingBlocksSchema.safeParse([
          { type: "hero" },
          { type: "register" },
          { type: "register" },
        ]),
      ),
    ).toEqual(["register_twice"]);
  });

  it("accept what learners will learn, the agenda and questions, and nothing unknown", () => {
    const blocks = [
      { type: "hero" },
      { type: "learn", heading: "Was du lernst", items: ["Preise testen", "Pakete schnüren"] },
      { type: "agenda", items: [{ minute: 0, title: "Intro" }, { title: "Q&A" }] },
      { type: "faq", items: [{ question: "Kostet es etwas?", answer: "Nein." }] },
      { type: "build", body: "Du baust deine Preisseite." },
      { type: "register" },
    ];
    expect(landingBlocksSchema.safeParse(blocks).success).toBe(true);
    expect(
      landingBlocksSchema.safeParse([{ type: "hero", extra: 1 }, { type: "register" }]).success,
    ).toBe(false);
    expect(
      landingBlocksSchema.safeParse([
        { type: "hero" },
        { type: "learn", items: [] },
        { type: "register" },
      ]).success,
    ).toBe(false);
    expect(
      landingBlocksSchema.safeParse([{ type: "hero" }, { type: "video" }, { type: "register" }])
        .success,
    ).toBe(false);
  });
});

describe("registration form", () => {
  it("asks for name and address by default, and offers the news unticked", () => {
    expect(DEFAULT_REGISTRATION_FORM).toEqual({
      name: "required",
      fields: [],
      consents: { marketing: true, lead_handoff: false },
    });
  });

  it("needs options for a choice, and unique field ids", () => {
    expect(
      formFieldSchema.safeParse({ id: "size", kind: "select", label: "Size", options: ["1-10"] })
        .success,
    ).toBe(false);
    expect(
      formFieldSchema.safeParse({ id: "company", kind: "text", label: "Company", options: ["x"] })
        .success,
    ).toBe(false);
    expect(
      registrationFormSchema.safeParse({
        fields: [
          { id: "a", kind: "text", label: "A" },
          { id: "a", kind: "text", label: "B" },
        ],
      }).success,
    ).toBe(false);
    expect(fieldId("Company size", [])).toBe("company_size");
    expect(fieldId("Größe", ["groesse"])).not.toBe("groesse");
    expect(fieldId("2 Fragen", [])).toBe("f_2_fragen");
    expect(fieldId("!!!", [])).toBe("field");
  });

  it("checks answers against the form", () => {
    const form: RegistrationForm = registrationFormSchema.parse({
      name: "optional",
      fields: [
        { id: "company", kind: "text", label: "Company", required: true },
        { id: "size", kind: "select", label: "Size", options: ["1-10", "11-50"] },
        { id: "question", kind: "textarea", label: "Your question" },
      ],
    });
    expect(
      validateAnswers(form, { company: " Acme ", size: "11-50", question: "Why?\r\nHow?", x: "1" }),
    ).toEqual({ ok: true, answers: { company: "Acme", size: "11-50", question: "Why?\nHow?" } });
    expect(validateAnswers(form, { size: "huge", question: "x".repeat(2001) })).toEqual({
      ok: false,
      issues: [
        { field: "company", code: "required" },
        { field: "size", code: "not_an_option" },
        { field: "question", code: "too_long" },
      ],
    });
    const named = validateAnswers(DEFAULT_REGISTRATION_FORM, { name: "" });
    expect(named).toEqual({ ok: false, issues: [{ field: "name", code: "required" }] });
    const off = registrationFormSchema.parse({ name: "off" });
    expect(validateAnswers(off, { name: "Ada" })).toEqual({ ok: true, answers: {} });
  });
});

describe("presenters", () => {
  const people = presentersSchema.parse([
    { name: "Ada Lovelace", role: "Founder", photo: "/files/0b5c2f9e-2a44-4f6c-9d1e-6a8b3c2d1e0f" },
  ]);

  it("are the brand alone in anonymity mode or when nobody is named", () => {
    expect(shownPresenters(people, true)).toEqual({ kind: "brand" });
    expect(shownPresenters([], false)).toEqual({ kind: "brand" });
    expect(shownPresenters(people, false)).toEqual({ kind: "people", people });
  });

  it("take photos only from the academy's own files", () => {
    expect(
      presentersSchema.safeParse([{ name: "A", photo: "https://cdn.example.com/a.png" }]).success,
    ).toBe(false);
  });
});

describe("landing page wording", () => {
  const content = {
    title: "Pricing live",
    description: "We build a pricing page together.",
    blocks: DEFAULT_LANDING_BLOCKS,
    form: DEFAULT_REGISTRATION_FORM,
    presenters: [],
    recordingNotice: null,
  };

  it("finds nothing in plain copy", () => {
    expect(lintWebinarContent(content)).toEqual([]);
  });

  it("blocks certification promises in titles and headings, warns in running text", () => {
    const findings = lintWebinarContent({
      ...content,
      title: "Zertifizierter Pricing-Workshop",
      description: "Unlike certification programmes, you build something real.",
      blocks: [
        { type: "hero" },
        { type: "learn", heading: "Get certified", items: ["Become accredited"] },
        { type: "faq", items: [{ question: "Is it certified?", answer: "No." }] },
        { type: "register" },
      ],
      form: registrationFormSchema.parse({
        fields: [{ id: "cert", kind: "text", label: "Your certification" }],
      }),
    });
    expect(findings.map((finding) => [finding.match, finding.severity])).toEqual([
      ["Zertifizierter", "error"],
      ["certified", "error"],
      ["accredited", "error"],
      ["certification", "warning"],
      ["certified", "warning"],
      ["certification", "warning"],
    ]);
  });
});

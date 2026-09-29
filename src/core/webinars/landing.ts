import { z } from "zod";

import { lintWording, type WordingFinding } from "@/core/compliance/wording-lint";

/*
 * A webinar's landing page, registration form and presenters (webinar brief
 * §2.2, §4). All of it is written in the webinar's own language: a webinar
 * is held in one language, while the page around it follows the viewer's.
 */

const line = z.string().trim().min(1).max(160);
const paragraph = z.string().trim().min(1).max(2000);
const heading = line.optional();

export const LANDING_BLOCK_TYPES = [
  "hero",
  "learn",
  "build",
  "agenda",
  "presenters",
  "faq",
  "register",
] as const;
export type LandingBlockType = (typeof LANDING_BLOCK_TYPES)[number];

export const landingBlockSchema = z.discriminatedUnion("type", [
  /** Title, description, date and time, seats and the way to the form. */
  z.strictObject({ type: z.literal("hero") }),
  z.strictObject({ type: z.literal("learn"), heading, items: z.array(line).min(1).max(12) }),
  /** What participants build: the linked course's artifact, with an optional note. */
  z.strictObject({ type: z.literal("build"), heading, body: paragraph.optional() }),
  z.strictObject({
    type: z.literal("agenda"),
    heading,
    items: z
      .array(
        z.strictObject({
          /** Minutes after the start. */
          minute: z.number().int().min(0).max(1440).optional(),
          title: line,
        }),
      )
      .min(1)
      .max(20),
  }),
  z.strictObject({ type: z.literal("presenters"), heading }),
  z.strictObject({
    type: z.literal("faq"),
    heading,
    items: z
      .array(z.strictObject({ question: line, answer: paragraph }))
      .min(1)
      .max(20),
  }),
  z.strictObject({ type: z.literal("register"), heading }),
]);
export type LandingBlock = z.infer<typeof landingBlockSchema>;

/** Blocks that make sense once per page. */
const SINGLE: readonly LandingBlockType[] = ["hero", "build", "presenters", "register"];

export const landingBlocksSchema = z
  .array(landingBlockSchema)
  .max(20)
  .superRefine((blocks, context) => {
    if (blocks[0]?.type !== "hero") {
      context.addIssue({ code: "custom", message: "hero_first" });
    }
    if (!blocks.some((block) => block.type === "register")) {
      context.addIssue({ code: "custom", message: "register_missing" });
    }
    for (const type of SINGLE) {
      if (blocks.filter((block) => block.type === type).length > 1) {
        context.addIssue({ code: "custom", message: `${type}_twice` });
      }
    }
  });

/** A new webinar's page: the essentials, then what the author adds. */
export const DEFAULT_LANDING_BLOCKS: LandingBlock[] = [
  { type: "hero" },
  { type: "presenters" },
  { type: "register" },
];

export const FORM_FIELD_KINDS = ["text", "select", "textarea"] as const;
export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number];

export const FORM_FIELD_MAX = { text: 200, textarea: 2000 } as const;

/**
 * Custom fields beyond name and e-mail (webinar brief §2.2): short text
 * (company, role), a choice (company size) or free text (a question for the
 * host, shown to the team only as an anonymous digest).
 */
export const formFieldSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
    kind: z.enum(FORM_FIELD_KINDS),
    label: line,
    required: z.boolean().default(false),
    options: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  })
  .superRefine((field, context) => {
    const options = field.options ?? [];
    if (field.kind === "select" && options.length < 2) {
      context.addIssue({ code: "custom", message: "options_few", path: ["options"] });
    }
    if (field.kind === "select" && new Set(options).size !== options.length) {
      context.addIssue({ code: "custom", message: "options_twice", path: ["options"] });
    }
    if (field.kind !== "select" && options.length > 0) {
      context.addIssue({ code: "custom", message: "options_unused", path: ["options"] });
    }
  });
export type FormField = z.infer<typeof formFieldSchema>;

/** The optional consents the form offers, each unticked (webinar brief §5: consent per purpose). */
export const OPTIONAL_CONSENTS = ["marketing", "lead_handoff"] as const;
export type OptionalConsent = (typeof OPTIONAL_CONSENTS)[number];

export const registrationFormSchema = z
  .strictObject({
    /** The name field: asked for (required or not) or left out; the e-mail address always is. */
    name: z.enum(["required", "optional", "off"]).default("required"),
    fields: z.array(formFieldSchema).max(10).default([]),
    consents: z
      .strictObject({
        /** The academy's news, by double opt-in. */
        marketing: z.boolean().default(true),
        /** "May contact me": the academy's lead handoff. */
        lead_handoff: z.boolean().default(false),
      })
      .prefault({}),
  })
  .superRefine((form, context) => {
    const ids = form.fields.map((field) => field.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "field_ids_twice", path: ["fields"] });
    }
  });
export type RegistrationForm = z.output<typeof registrationFormSchema>;

export const DEFAULT_REGISTRATION_FORM: RegistrationForm = registrationFormSchema.parse({});

/** Field ids from labels: "Company size" → "company_size", unique within the form. */
export function fieldId(label: string, taken: readonly string[]): string {
  const base =
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(\d)/, "f_$1")
      .slice(0, 24) || "field";
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}_${n}`;
  return id;
}

export type Answers = Record<string, string>;

export type AnswerIssue = { field: string; code: "required" | "too_long" | "not_an_option" };

/**
 * The answers someone gave, checked against the form: only its fields, the
 * required ones filled, choices from the list, lengths within bounds. The
 * name travels as the answer "name".
 */
export function validateAnswers(
  form: RegistrationForm,
  input: Record<string, string>,
): { ok: true; answers: Answers } | { ok: false; issues: AnswerIssue[] } {
  const answers: Answers = {};
  const issues: AnswerIssue[] = [];
  if (form.name !== "off") {
    const name = (input.name ?? "").trim();
    if (!name && form.name === "required") issues.push({ field: "name", code: "required" });
    else if (name.length > 120) issues.push({ field: "name", code: "too_long" });
    else if (name) answers.name = name;
  }
  for (const field of form.fields) {
    const value = (input[field.id] ?? "").replace(/\r\n?/g, "\n").trim();
    if (!value) {
      if (field.required) issues.push({ field: field.id, code: "required" });
      continue;
    }
    if (field.kind === "select") {
      if (!field.options?.includes(value)) issues.push({ field: field.id, code: "not_an_option" });
      else answers[field.id] = value;
      continue;
    }
    if (value.length > FORM_FIELD_MAX[field.kind])
      issues.push({ field: field.id, code: "too_long" });
    else answers[field.id] = value;
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, answers };
}

/** A photo from the academy's storage, as /files/<id> (optionally with its extension). */
const photoSchema = z.string().regex(/^\/files\/[0-9a-f-]{36}(\.[a-z0-9]{2,5})?$/);

export const presenterSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  role: z.string().trim().max(120).optional(),
  photo: photoSchema.optional(),
});
export type Presenter = z.infer<typeof presenterSchema>;

export const presentersSchema = z.array(presenterSchema).max(6);

/**
 * Who the page shows as presenting. With the academy's anonymity mode on
 * (brief §9, on by default) that is its brand alone, never a person; the
 * same when nobody is named.
 */
export function shownPresenters(
  presenters: readonly Presenter[],
  anonymityMode: boolean,
): { kind: "brand" } | { kind: "people"; people: readonly Presenter[] } {
  return anonymityMode || presenters.length === 0
    ? { kind: "brand" }
    : { kind: "people", people: presenters };
}

export interface WebinarContent {
  title: string;
  description: string;
  blocks: readonly LandingBlock[];
  form: RegistrationForm;
  presenters: readonly Presenter[];
  recordingNotice: string | null;
}

/**
 * Wording lint over everything the landing page says (webinar brief §5):
 * the title and headings promise, so certification wording blocks there;
 * running text gets a warning, as lesson text does.
 */
export function lintWebinarContent(content: WebinarContent): WordingFinding[] {
  const promises: string[] = [content.title];
  const running: string[] = [content.description];
  for (const block of content.blocks) {
    if ("heading" in block && block.heading) promises.push(block.heading);
    switch (block.type) {
      case "learn":
        promises.push(...block.items);
        break;
      case "build":
        if (block.body) running.push(block.body);
        break;
      case "agenda":
        running.push(...block.items.map((item) => item.title));
        break;
      case "faq":
        running.push(...block.items.flatMap((item) => [item.question, item.answer]));
        break;
    }
  }
  for (const field of content.form.fields) running.push(field.label, ...(field.options ?? []));
  for (const presenter of content.presenters) {
    running.push(presenter.name, presenter.role ?? "");
  }
  if (content.recordingNotice) running.push(content.recordingNotice);
  return [
    ...promises.flatMap((text) => lintWording(text, "webinar_title")),
    ...running.filter(Boolean).flatMap((text) => lintWording(text, "landing_text")),
  ];
}

import { z } from "zod";

/**
 * How learners may hand in the one required artifact of a course (brief §4):
 * a file (PDF, image, Markdown), a structured template form (JSON schema) or a URL.
 */
export const FILE_KINDS = ["pdf", "image", "md"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const FILE_KIND_MIME_TYPES: Record<FileKind, readonly string[]> = {
  pdf: ["application/pdf"],
  image: ["image/png", "image/jpeg", "image/webp"],
  md: ["text/markdown", "text/plain"],
};

export const submissionTypeSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("file"),
    accept: z.array(z.enum(FILE_KINDS)).min(1),
    max_mb: z.number().positive().max(50).default(15),
  }),
  z.strictObject({
    type: z.literal("template_form"),
    /** JSON schema of the form; rendered as fields and passed to the review as structured data. */
    schema: z.record(z.string(), z.unknown()),
  }),
  z.strictObject({ type: z.literal("url") }),
]);

export const submissionTypesSchema = z.array(submissionTypeSchema).min(1).max(3);
export type SubmissionType = z.output<typeof submissionTypeSchema>;

/** Resolves an uploaded file's MIME type to an accepted kind, or null if not allowed. */
export function acceptedFileKind(
  types: readonly SubmissionType[],
  mimeType: string,
): FileKind | null {
  for (const type of types) {
    if (type.type !== "file") continue;
    for (const kind of type.accept) {
      if (FILE_KIND_MIME_TYPES[kind].includes(mimeType)) return kind;
    }
  }
  return null;
}

/** Markdown files can also be written or pasted directly in the browser. */
export function acceptsText(types: readonly SubmissionType[]): boolean {
  return types.some((type) => type.type === "file" && type.accept.includes("md"));
}

export function acceptsUrl(types: readonly SubmissionType[]): boolean {
  return types.some((type) => type.type === "url");
}

export interface FormField {
  key: string;
  title: string;
  description?: string;
  required: boolean;
  multiline: boolean;
  maxLength: number;
}

const fieldKey = /^[a-z][a-z0-9_]{0,39}$/;

/**
 * Template forms use a small JSON-schema subset: an object whose properties
 * are strings with optional title, description and maxLength. Anything else
 * returns null so the editor can say so instead of guessing.
 */
export function formFieldsFromSchema(schema: Record<string, unknown>): FormField[] | null {
  if (
    schema.type !== "object" ||
    typeof schema.properties !== "object" ||
    schema.properties === null
  ) {
    return null;
  }
  const required = Array.isArray(schema.required)
    ? schema.required.filter((k) => typeof k === "string")
    : [];
  const fields: FormField[] = [];
  for (const [key, raw] of Object.entries(schema.properties as Record<string, unknown>)) {
    if (!fieldKey.test(key) || typeof raw !== "object" || raw === null) return null;
    const property = raw as Record<string, unknown>;
    if (property.type !== "string") return null;
    const maxLength =
      typeof property.maxLength === "number" ? Math.min(property.maxLength, 20_000) : 5_000;
    fields.push({
      key,
      title: typeof property.title === "string" ? property.title : key,
      ...(typeof property.description === "string" ? { description: property.description } : {}),
      required: required.includes(key),
      multiline: maxLength > 200,
      maxLength,
    });
  }
  return fields.length > 0 ? fields : null;
}

/** Checks submitted form values against the fields; returns cleaned values or errors. */
export function validateFormValues(
  fields: readonly FormField[],
  values: Readonly<Record<string, string>>,
): { ok: true; data: Record<string, string> } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const data: Record<string, string> = {};
  for (const field of fields) {
    const value = (values[field.key] ?? "").trim();
    if (field.required && !value) errors[field.key] = "required";
    else if (value.length > field.maxLength) errors[field.key] = "too_long";
    else if (value) data[field.key] = value;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, data };
}

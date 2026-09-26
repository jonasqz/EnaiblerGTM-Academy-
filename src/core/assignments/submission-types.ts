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

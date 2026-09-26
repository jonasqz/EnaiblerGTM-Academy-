import { z } from "zod";

import { normalizePublicId } from "@/core/credentials/public-id";
import { slugSchema } from "@/core/shared/slug";

/**
 * Credential import (brief §6, §13): a tenant may launch a course on another
 * platform first and migrate later. Imported credentials keep their issue
 * date and show `source: imported`; they are private unless the source
 * system recorded that the learner had made them public.
 */
export const credentialImportItemSchema = z.strictObject({
  /** Id in the source platform; makes re-running an import idempotent. */
  external_id: z.string().trim().min(1).max(200),
  source_platform: z.string().trim().min(1).max(60),
  learner_email: z.email(),
  /** Exactly as the learner entered it in the source system. */
  display_name: z.string().trim().min(1).max(120),
  course_slug: slugSchema,
  path_slug: slugSchema.optional(),
  level_at_issue: z.number().int().min(1).max(20).optional(),
  artifact_name: z.string().trim().min(1).max(200),
  issued_at: z.union([z.iso.datetime({ offset: true }), z.iso.date()]),
  visibility: z.enum(["private", "public"]).default("private"),
  /** Keep an existing enaibler-format id so already shared links keep working. */
  public_id: z
    .string()
    .transform((value, ctx) => {
      const normalized = normalizePublicId(value);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: "Not a valid credential id" });
        return z.NEVER;
      }
      return normalized;
    })
    .optional(),
});

export const credentialImportSchema = z.strictObject({
  credentials: z.array(credentialImportItemSchema).min(1).max(1_000),
});

export type CredentialImportItem = z.output<typeof credentialImportItemSchema>;

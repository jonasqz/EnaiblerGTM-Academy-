import { randomUUID } from "node:crypto";

import {
  ASSIGNMENT_DRAFT_PROMPT_VERSION,
  assignmentDraftJsonSchema,
  buildAssignmentDraftPrompt,
  parseAssignmentDraft,
} from "@/core/authoring/assignment-draft";
import type { JobError } from "@/core/authoring/job-errors";
import { sectionLabel, sectionsWithinBudget } from "@/core/authoring/sections";
import type { Locale, LocalizedText } from "@/core/i18n/locales";
import type { Rubric } from "@/core/review/rubric";
import type { Database } from "@/db/client";
import { askForJson, draftFailure, loadSourceSections } from "@/server/authoring/drafting";
import { meteredModel, type AuthoringModel } from "@/server/authoring/model";

/*
 * The assignment and its rubric drafted from the course's sources. Nothing
 * is saved: the outcome form shows the draft, like the rubric drafted from an
 * example, and the author's save keeps what they kept.
 */

const SECTION_BUDGET = { total: 40_000, each: 2_000 };

export type AssignmentDraft =
  | {
      ok: true;
      artifactName: LocalizedText;
      prompt: LocalizedText;
      rubric: Rubric;
      notes: string[];
    }
  | { ok: false; error: JobError };

export async function draftAssignmentFromSources(
  db: Database,
  tenantId: string,
  courseId: string,
  input: {
    languages: readonly Locale[];
    courseTitle: string;
    current: { artifactName: string; prompt: string };
  },
  model: AuthoringModel | null,
): Promise<AssignmentDraft> {
  if (!model) return { ok: false, error: "gateway_missing" };
  if (input.languages.length === 0) return { ok: false, error: "no_assignment" };
  const sections = sectionsWithinBudget(
    await loadSourceSections(db, tenantId, courseId),
    SECTION_BUDGET,
  ).map((section, index) => ({
    ref: `C${index + 1}`,
    label: sectionLabel(section),
    text: section.text,
  }));
  if (sections.length === 0) return { ok: false, error: "no_sources" };
  try {
    const drafted = await askForJson(
      // The rubric is the heart of it: counted with the rubric drafts.
      meteredModel(db, model, { tenantId, kind: "rubric_draft", courseId }),
      {
        prompt: buildAssignmentDraftPrompt({ ...input, sections, nonce: randomUUID() }),
        jsonSchema: assignmentDraftJsonSchema(input.languages),
        purpose: "assignment-draft",
        promptVersion: ASSIGNMENT_DRAFT_PROMPT_VERSION,
        temperature: 0.3,
        maxTokens: 6_000,
        parse: (content) => {
          const result = parseAssignmentDraft(content, input.languages);
          return result.ok ? result : null;
        },
      },
    );
    return drafted ?? { ok: false, error: "invalid_drafts" };
  } catch (error) {
    return { ok: false, error: draftFailure(error, "assignment-draft") };
  }
}

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import {
  buildFaqPrompt,
  FAQ_JSON_SCHEMA,
  FAQ_PROMPT_VERSION,
  faqFromPairs,
  faqMarkdown,
  parseFaqDraft,
  type FaqDraft,
} from "@/core/authoring/faq";
import type { JobError } from "@/core/authoring/job-errors";
import { qaPairs } from "@/core/authoring/qa";
import { sectionLabel } from "@/core/authoring/sections";
import { rankChunks } from "@/core/authoring/text";
import { lessonKeyFor } from "@/core/courses/lessons";
import { localize, type Locale } from "@/core/i18n/locales";
import type { Database } from "@/db/client";
import { courses, lessons, lessonVersions, sources } from "@/db/schema";
import type { LessonBlock } from "@/db/schema/catalog";
import { withTenant } from "@/db/tenant-scope";
import { askForJson, draftFailure, loadSourceSections } from "@/server/authoring/drafting";
import { meteredModel, type AuthoringModel } from "@/server/authoring/model";

/*
 * "Q&A reuse" (webinar brief §2.1): a live Q&A source becomes an FAQ lesson
 * draft, added to the course like any drafted lesson (version 1, linked to
 * the Q&A so a change to it flags the lesson). Questions nobody answered
 * come back to the author instead of into the lesson.
 */

export type FaqResult =
  | {
      ok: true;
      lessonId: string;
      /** Questions left out because nobody answered them, live or in the sources. */
      open: string[];
      notes: string[];
      /** Why the questions went in as asked instead of through the AI; null when the AI wrote it. */
      fallback: JobError | null;
    }
  | { ok: false; error: JobError };

const PASSAGES = 8;

export async function draftFaqLesson(
  db: Database,
  tenantId: string,
  input: { sourceId: string; locale: Locale; requestedBy: string },
  model: AuthoringModel | null,
): Promise<FaqResult> {
  const context = await withTenant(db, tenantId, async (tx) => {
    const [source] = await tx.select().from(sources).where(eq(sources.id, input.sourceId));
    if (!source || source.kind !== "qa") return null;
    const [course] = await tx.select().from(courses).where(eq(courses.id, source.courseId));
    return course ? { source, course } : null;
  });
  if (!context) return { ok: false, error: "file_missing" };
  const { source, course } = context;
  const pairs = qaPairs(source.content ?? "");
  if (pairs.length === 0) return { ok: false, error: "no_questions" };

  let draft: (FaqDraft & { notes?: string[] }) | null = null;
  let fallback: JobError | null = model ? null : "gateway_missing";
  if (model) {
    try {
      const passages = await passagesFor(db, tenantId, source.courseId, source.id, pairs);
      const prompt = buildFaqPrompt({
        locale: input.locale,
        courseTitle: localize(course.title, input.locale),
        pairs,
        passages,
        nonce: randomUUID(),
      });
      draft = await askForJson(
        meteredModel(db, model, {
          tenantId,
          kind: "lesson_draft",
          courseId: source.courseId,
          refId: source.id,
        }),
        {
          prompt,
          jsonSchema: { ...FAQ_JSON_SCHEMA, schema: { ...FAQ_JSON_SCHEMA.schema } },
          purpose: "faq-lesson",
          promptVersion: FAQ_PROMPT_VERSION,
          temperature: 0.3,
          maxTokens: 6_000,
          parse: (content) => parseFaqDraft(content, pairs, input.locale),
        },
      );
      if (!draft) fallback = "invalid_drafts";
    } catch (error) {
      fallback = draftFailure(error, "faq-lesson");
    }
  }
  draft ??= faqFromPairs(pairs, input.locale);
  if (draft.entries.length === 0) return { ok: false, error: "no_answers" };
  const markdown = faqMarkdown(draft);
  const title = draft.title;

  const lessonId = await withTenant(db, tenantId, async (tx) => {
    const existing = await tx
      .select({ key: lessons.key, position: lessons.position })
      .from(lessons)
      .where(eq(lessons.courseId, source.courseId));
    const keys = new Set(existing.map((row) => row.key));
    const blocks: LessonBlock[] = [{ type: "markdown", markdown }];
    const [row] = await tx
      .insert(lessons)
      .values({
        tenantId,
        courseId: source.courseId,
        locale: input.locale,
        key: lessonKeyFor(title, keys),
        position: existing.reduce((highest, lesson) => Math.max(highest, lesson.position + 1), 0),
        title,
        blocks,
        sourceIds: [source.id],
      })
      .returning({ id: lessons.id });
    await tx.insert(lessonVersions).values({
      tenantId,
      lessonId: row!.id,
      version: 1,
      title,
      blocks,
      createdBy: input.requestedBy,
    });
    await tx.update(courses).set({ updatedAt: new Date() }).where(eq(courses.id, source.courseId));
    return row!.id;
  });
  return { ok: true, lessonId, open: draft.open, notes: draft.notes ?? [], fallback };
}

/** Sections of the course's other sources, ranked against what nobody answered live. */
async function passagesFor(
  db: Database,
  tenantId: string,
  courseId: string,
  qaSourceId: string,
  pairs: ReturnType<typeof qaPairs>,
): Promise<Array<{ ref: string; source: string; text: string }>> {
  const unanswered = pairs.filter((pair) => !pair.answer).map((pair) => pair.question);
  if (unanswered.length === 0) return [];
  const sections = (await loadSourceSections(db, tenantId, courseId))
    .filter((section) => section.sourceId !== qaSourceId)
    .map((section) => ({ section, content: section.text }));
  return rankChunks(unanswered.join(" "), sections)
    .slice(0, PASSAGES)
    .map(({ section }, index) => ({
      ref: `S${index + 1}`,
      source: sectionLabel(section),
      text: section.text.slice(0, 1_500),
    }));
}

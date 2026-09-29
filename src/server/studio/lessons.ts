import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";

import { lessonKeyFor } from "@/core/courses/lessons";
import type { Locale } from "@/core/i18n/locales";
import type { CheckQuestion } from "@/core/questions/questions";
import { sameJson } from "@/core/shared/json";
import type { Database, Transaction } from "@/db/client";
import {
  assignments,
  courses,
  lessons,
  lessonVersions,
  mediaAssets,
  rubrics,
  sources,
} from "@/db/schema";
import type { LessonBlock } from "@/db/schema/catalog";
import { withTenant } from "@/db/tenant-scope";

/*
 * Lessons (brief §4, §7 step 4): per locale, linked across translations by
 * `key`, Markdown content, full version history.
 */

export function markdownOf(blocks: readonly LessonBlock[]): string {
  return blocks
    .filter(
      (block): block is Extract<LessonBlock, { type: "markdown" }> => block.type === "markdown",
    )
    .map((block) => block.markdown)
    .join("\n\n");
}

/** The lesson's knowledge check questions (none when it has no check). */
export function checkQuestionsOf(blocks: readonly LessonBlock[]): CheckQuestion[] {
  return blocks.flatMap((block) => (block.type === "check" ? block.questions : []));
}

/** Only this academy's videos, once each, in the order given (a deleted one is left out). */
async function libraryVideos(tx: Transaction, ids: readonly string[]): Promise<string[]> {
  const wanted = [...new Set(ids.filter((id) => UUID.test(id)))];
  if (wanted.length === 0) return [];
  const found = new Set(
    (
      await tx
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(inArray(mediaAssets.id, wanted))
    ).map((row) => row.id),
  );
  return wanted.filter((id) => found.has(id));
}

/** Videos of the media library the lesson shows, in order. */
export function mediaAssetIdsOf(blocks: readonly LessonBlock[]): string[] {
  return blocks.flatMap((block) => (block.type === "media" ? [block.assetId] : []));
}

/**
 * The video first (a re-live lesson opens with it), then the text, then the
 * knowledge check at the end; a lesson without questions has no check.
 */
function lessonBlocks(
  markdown: string,
  questions: CheckQuestion[],
  mediaAssetIds: readonly string[] = [],
): LessonBlock[] {
  return [
    ...mediaAssetIds.map((assetId) => ({ type: "media" as const, assetId })),
    { type: "markdown", markdown },
    ...(questions.length > 0 ? [{ type: "check" as const, questions }] : []),
  ];
}

export async function createLesson(
  db: Database,
  tenantId: string,
  courseId: string,
  input: { locale: Locale; title: string; translationOf?: string; userId: string },
): Promise<string> {
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .select({
        key: lessons.key,
        locale: lessons.locale,
        position: lessons.position,
        criterionIds: lessons.criterionIds,
      })
      .from(lessons)
      .where(eq(lessons.courseId, courseId));

    let key: string;
    let position: number;
    let criterionIds: string[] = [];
    const source = input.translationOf
      ? rows.find((row) => row.key === input.translationOf)
      : undefined;
    if (source) {
      if (rows.some((row) => row.key === source.key && row.locale === input.locale)) {
        throw new Error("This lesson already exists in that language");
      }
      key = source.key;
      position = source.position;
      // A translation teaches the same criteria; its text starts empty, never as a copy.
      criterionIds = source.criterionIds;
    } else {
      key = lessonKeyFor(
        input.title,
        rows.map((row) => row.key),
      );
      position = rows.reduce((highest, row) => Math.max(highest, row.position + 1), 0);
    }

    const blocks: LessonBlock[] = [{ type: "markdown", markdown: "" }];
    const [lesson] = await tx
      .insert(lessons)
      .values({
        tenantId,
        courseId,
        locale: input.locale,
        key,
        position,
        title: input.title,
        blocks,
        criterionIds,
      })
      .returning({ id: lessons.id });
    await tx.insert(lessonVersions).values({
      tenantId,
      lessonId: lesson!.id,
      version: 1,
      title: input.title,
      blocks,
      createdBy: input.userId,
    });
    await tx.update(courses).set({ updatedAt: new Date() }).where(eq(courses.id, courseId));
    return lesson!.id;
  });
}

export async function loadLessonEditor(db: Database, tenantId: string, lessonId: string) {
  return withTenant(db, tenantId, async (tx) => {
    const [lesson] = await tx.select().from(lessons).where(eq(lessons.id, lessonId));
    if (!lesson) return null;
    const [course] = await tx.select().from(courses).where(eq(courses.id, lesson.courseId));
    const [assignment] = await tx
      .select()
      .from(assignments)
      .where(eq(assignments.courseId, lesson.courseId));
    const [rubric] = assignment
      ? await tx.select().from(rubrics).where(eq(rubrics.id, assignment.rubricId))
      : [];
    const versions = await tx
      .select({
        version: lessonVersions.version,
        title: lessonVersions.title,
        createdAt: lessonVersions.createdAt,
      })
      .from(lessonVersions)
      .where(eq(lessonVersions.lessonId, lessonId))
      .orderBy(desc(lessonVersions.version));
    const translations = await tx
      .select({
        id: lessons.id,
        locale: lessons.locale,
        title: lessons.title,
        blocks: lessons.blocks,
      })
      .from(lessons)
      .where(and(eq(lessons.courseId, lesson.courseId), eq(lessons.key, lesson.key)));
    const courseSources = await tx
      .select({
        id: sources.id,
        title: sources.title,
        kind: sources.kind,
        changedAt: sources.changedAt,
      })
      .from(sources)
      .where(eq(sources.courseId, lesson.courseId))
      .orderBy(asc(sources.createdAt));
    return {
      lesson,
      questions: checkQuestionsOf(lesson.blocks),
      course: course!,
      rubric: rubric ?? null,
      versions,
      // With their questions: a translation is written next to the original's check.
      translations: translations.map((row) => ({
        ...row,
        questions: checkQuestionsOf(row.blocks),
      })),
      sources: courseSources,
    };
  });
}

/** The author checked a flagged lesson against its changed source (auto-update, brief §7). */
export async function markLessonReviewed(
  db: Database,
  tenantId: string,
  lessonId: string,
): Promise<void> {
  await withTenant(db, tenantId, (tx) =>
    tx.update(lessons).set({ flaggedAt: null, flagReason: null }).where(eq(lessons.id, lessonId)),
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The sources a lesson is based on: when one of them changes, the lesson is flagged. */
export async function setLessonSources(
  db: Database,
  tenantId: string,
  lessonId: string,
  sourceIds: string[],
): Promise<void> {
  const wanted = [...new Set(sourceIds.filter((id) => UUID.test(id)))];
  await withTenant(db, tenantId, async (tx) => {
    const [lesson] = await tx
      .select({ courseId: lessons.courseId })
      .from(lessons)
      .where(eq(lessons.id, lessonId));
    if (!lesson) return;
    // Only this course's sources.
    const valid = wanted.length
      ? await tx
          .select({ id: sources.id })
          .from(sources)
          .where(and(eq(sources.courseId, lesson.courseId), inArray(sources.id, wanted)))
      : [];
    await tx
      .update(lessons)
      .set({ sourceIds: valid.map((row) => row.id) })
      .where(eq(lessons.id, lessonId));
  });
}

/**
 * Saves a new version; unchanged content saves nothing. The knowledge check
 * and the video are part of the content (versions keep them); left out, they
 * stay as they are.
 */
export async function updateLesson(
  db: Database,
  tenantId: string,
  lessonId: string,
  input: {
    title: string;
    markdown: string;
    criterionIds: string[];
    questions?: CheckQuestion[];
    /** The media library's videos the lesson shows ([] for none). */
    mediaAssetIds?: string[];
    userId: string;
  },
): Promise<{ version: number; changed: boolean }> {
  return withTenant(db, tenantId, async (tx) => {
    const [lesson] = await tx.select().from(lessons).where(eq(lessons.id, lessonId));
    if (!lesson) throw new Error("Lesson not found");
    const questions = input.questions ?? checkQuestionsOf(lesson.blocks);
    const media = input.mediaAssetIds
      ? await libraryVideos(tx, input.mediaAssetIds)
      : mediaAssetIdsOf(lesson.blocks);
    const blocks = lessonBlocks(input.markdown, questions, media);
    const unchanged =
      lesson.title === input.title &&
      markdownOf(lesson.blocks) === input.markdown &&
      sameJson(checkQuestionsOf(lesson.blocks), questions) &&
      mediaAssetIdsOf(lesson.blocks).join() === media.join() &&
      JSON.stringify([...lesson.criterionIds].sort()) ===
        JSON.stringify([...input.criterionIds].sort());
    if (unchanged) return { version: lesson.version, changed: false };

    const version = lesson.version + 1;
    await tx
      .update(lessons)
      .set({ title: input.title, blocks, criterionIds: input.criterionIds, version })
      .where(eq(lessons.id, lessonId));
    await tx
      .insert(lessonVersions)
      .values({ tenantId, lessonId, version, title: input.title, blocks, createdBy: input.userId });
    await tx.update(courses).set({ updatedAt: new Date() }).where(eq(courses.id, lesson.courseId));
    return { version, changed: true };
  });
}

/** Restoring copies an old version forward as the newest one; history is never rewritten. */
export async function restoreLessonVersion(
  db: Database,
  tenantId: string,
  lessonId: string,
  version: number,
  userId: string,
): Promise<{ version: number; changed: boolean }> {
  const snapshot = await withTenant(db, tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(lessonVersions)
      .where(and(eq(lessonVersions.lessonId, lessonId), eq(lessonVersions.version, version)));
    const [lesson] = await tx
      .select({ criterionIds: lessons.criterionIds })
      .from(lessons)
      .where(eq(lessons.id, lessonId));
    return row && lesson
      ? {
          title: row.title,
          markdown: markdownOf(row.blocks),
          // The check as it was then: restoring a version without one removes today's.
          questions: checkQuestionsOf(row.blocks),
          mediaAssetIds: mediaAssetIdsOf(row.blocks),
          criterionIds: lesson.criterionIds,
        }
      : null;
  });
  if (!snapshot) throw new Error("Version not found");
  return updateLesson(db, tenantId, lessonId, { ...snapshot, userId });
}

/** Moves a lesson (all its translations) one place up or down. */
export async function moveLesson(
  db: Database,
  tenantId: string,
  courseId: string,
  key: string,
  direction: "up" | "down",
): Promise<void> {
  await withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .select({ key: lessons.key, position: max(lessons.position) })
      .from(lessons)
      .where(eq(lessons.courseId, courseId))
      .groupBy(lessons.key)
      .orderBy(asc(max(lessons.position)), asc(lessons.key));
    const ordered = rows.map((row) => row.key);
    const index = ordered.indexOf(key);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= ordered.length) return;
    [ordered[index], ordered[swapWith]] = [ordered[swapWith]!, ordered[index]!];
    // Renumber densely so positions stay unique per key.
    for (const [position, lessonKey] of ordered.entries()) {
      await tx
        .update(lessons)
        .set({ position })
        .where(and(eq(lessons.courseId, courseId), eq(lessons.key, lessonKey)));
    }
  });
}

export async function deleteLesson(
  db: Database,
  tenantId: string,
  courseId: string,
  key: string,
): Promise<void> {
  await withTenant(db, tenantId, async (tx) => {
    const ids = (
      await tx
        .select({ id: lessons.id })
        .from(lessons)
        .where(and(eq(lessons.courseId, courseId), eq(lessons.key, key)))
    ).map((row) => row.id);
    if (ids.length > 0) await tx.delete(lessons).where(inArray(lessons.id, ids));
    await tx
      .update(courses)
      .set({ updatedAt: sql`now()` })
      .where(eq(courses.id, courseId));
  });
}

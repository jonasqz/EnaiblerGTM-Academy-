import { randomUUID } from "node:crypto";

import { and, asc, cosineDistance, desc, eq, inArray, isNotNull } from "drizzle-orm";

import {
  buildLessonDraftPrompt,
  LESSON_DRAFT_JSON_SCHEMA,
  LESSON_DRAFT_PROMPT_VERSION,
  parseLessonDraft,
  placeKeyframes,
  type DraftPassage,
} from "@/core/authoring/lesson-draft";
import { rankChunks } from "@/core/authoring/text";
import { lessonKeyFor } from "@/core/courses/lessons";
import { isLocale, localize, type Locale } from "@/core/i18n/locales";
import { rubricSchema } from "@/core/review/rubric";
import type { JobError } from "@/core/authoring/job-errors";
import type { Database } from "@/db/client";
import {
  assignments,
  courses,
  EMBEDDING_DIMENSIONS,
  files,
  lessonDrafts,
  lessons,
  lessonVersions,
  rubrics,
  sourceChunks,
  sources,
} from "@/db/schema";
import type { LessonBlock } from "@/db/schema/catalog";
import { withTenant } from "@/db/tenant-scope";
import { meteredLlm, usageRecorder, type UsageCallback } from "@/server/ai-usage";
import type { AuthoringModel } from "@/server/authoring/model";
import { embed, type EmbeddingConfig } from "@/server/authoring/speech";
import type { Enqueue } from "@/server/jobs/producer";
import { QUEUES } from "@/server/jobs/queues";

/*
 * "Draft lessons with AI" (brief §7, step 3). The author asks for drafts in
 * one course language; the worker picks the source passages that fit each
 * criterion, asks the model for lessons that cover the rubric, and adds them
 * to the course as new lessons (version 1) for the author to edit.
 */

const MAX_LESSONS = 6;
const PASSAGE_BUDGET = 60_000;
const PASSAGE_LIMIT = 2_500;

export type LessonDraftRun = typeof lessonDrafts.$inferSelect;

export async function requestLessonDraft(
  db: Database,
  tenantId: string,
  input: { courseId: string; locale: Locale; requestedBy: string },
  enqueue: Enqueue,
): Promise<string> {
  return withTenant(db, tenantId, async (tx) => {
    const [run] = await tx
      .insert(lessonDrafts)
      .values({
        tenantId,
        courseId: input.courseId,
        locale: input.locale,
        requestedBy: input.requestedBy,
      })
      .returning({ id: lessonDrafts.id });
    await enqueue(tx, QUEUES.lessonDraft, { tenantId, draftId: run!.id }, { id: run!.id });
    return run!.id;
  });
}

export async function listLessonDrafts(
  db: Database,
  tenantId: string,
  courseId: string,
  limit = 5,
): Promise<LessonDraftRun[]> {
  return withTenant(db, tenantId, (tx) =>
    tx
      .select()
      .from(lessonDrafts)
      .where(eq(lessonDrafts.courseId, courseId))
      .orderBy(desc(lessonDrafts.createdAt))
      .limit(limit),
  );
}

interface Material {
  passages: DraftPassage[];
  /** Passage ref → source id. */
  sourceOf: Map<string, string>;
  /** Keyframe ref → file. */
  keyframes: Map<string, { fileId: string; caption: string }>;
}

/** Source passages for the prompt: recording topics as they are, other sources by relevance. */
async function gatherMaterial(
  db: Database,
  tenantId: string,
  courseId: string,
  criteria: ReadonlyArray<{ label: string; description: string }>,
  embeddings: EmbeddingConfig | null,
  onUsage: UsageCallback,
): Promise<Material> {
  const material: Material = { passages: [], sourceOf: new Map(), keyframes: new Map() };
  let budget = PASSAGE_BUDGET;
  const add = (
    sourceId: string,
    source: string,
    text: string,
    keyframe?: { fileId: string; caption: string },
  ) => {
    const clipped = text.slice(0, PASSAGE_LIMIT);
    if (budget - clipped.length < 0) return;
    budget -= clipped.length;
    const ref = `S${material.passages.length + 1}`;
    let keyframeRef: DraftPassage["keyframe"];
    if (keyframe) {
      const k = `K${material.keyframes.size + 1}`;
      material.keyframes.set(k, keyframe);
      keyframeRef = { ref: k, caption: keyframe.caption };
    }
    material.passages.push({
      ref,
      source,
      text: clipped,
      ...(keyframeRef ? { keyframe: keyframeRef } : {}),
    });
    material.sourceOf.set(ref, sourceId);
  };

  const ready = await withTenant(db, tenantId, (tx) =>
    tx
      .select()
      .from(sources)
      .where(and(eq(sources.courseId, courseId), eq(sources.status, "ready")))
      .orderBy(asc(sources.createdAt)),
  );

  for (const source of ready.filter((row) => row.kind === "recording")) {
    for (const topic of source.transcript ?? []) {
      add(
        source.id,
        `${source.title}${topic.title ? ` · ${topic.title}` : ""}`,
        topic.text,
        topic.keyframeFileId
          ? { fileId: topic.keyframeFileId, caption: topic.title ?? source.title }
          : undefined,
      );
    }
  }

  const others = ready.filter((row) => row.kind !== "recording");
  if (others.length === 0) return material;
  const chunks = await withTenant(db, tenantId, (tx) =>
    tx
      .select({
        id: sourceChunks.id,
        sourceId: sourceChunks.sourceId,
        content: sourceChunks.content,
      })
      .from(sourceChunks)
      .where(
        inArray(
          sourceChunks.sourceId,
          others.map((row) => row.id),
        ),
      )
      .orderBy(asc(sourceChunks.sourceId), asc(sourceChunks.position)),
  );
  const title = new Map(others.map((row) => [row.id, row.title]));
  const picked = new Set<string>();
  const pick = (chunk: { id: string; sourceId: string; content: string }) => {
    if (picked.has(chunk.id)) return;
    picked.add(chunk.id);
    add(chunk.sourceId, title.get(chunk.sourceId) ?? "Source", chunk.content);
  };

  // Interviews are short and first-hand: all of them.
  for (const chunk of chunks.filter(
    (c) => others.find((s) => s.id === c.sourceId)?.kind === "interview",
  )) {
    pick(chunk);
  }
  for (const criterion of criteria) {
    const query = `${criterion.label}. ${criterion.description}`;
    let best: typeof chunks = [];
    if (embeddings) {
      const vector = (
        await embed(embeddings, [query], EMBEDDING_DIMENSIONS, onUsage).catch(() => null)
      )?.[0];
      if (vector) {
        best = await withTenant(db, tenantId, (tx) =>
          tx
            .select({
              id: sourceChunks.id,
              sourceId: sourceChunks.sourceId,
              content: sourceChunks.content,
            })
            .from(sourceChunks)
            .where(
              and(
                inArray(
                  sourceChunks.sourceId,
                  others.map((row) => row.id),
                ),
                isNotNull(sourceChunks.embedding),
              ),
            )
            .orderBy(cosineDistance(sourceChunks.embedding, vector))
            .limit(4),
        );
      }
    }
    if (best.length === 0) best = rankChunks(query, chunks).slice(0, 4);
    best.forEach(pick);
  }
  // The start of every source gives the model its context.
  for (const source of others) {
    chunks
      .filter((chunk) => chunk.sourceId === source.id)
      .slice(0, 2)
      .forEach(pick);
  }
  return material;
}

/** The `lessons.draft` job. */
export async function runLessonDraft(
  db: Database,
  tenantId: string,
  draftId: string,
  deps: { model: AuthoringModel | null; embeddings: EmbeddingConfig | null; finalAttempt: boolean },
): Promise<void> {
  const [run] = await withTenant(db, tenantId, (tx) =>
    tx.select().from(lessonDrafts).where(eq(lessonDrafts.id, draftId)),
  );
  if (!run || run.status === "done" || !isLocale(run.locale)) return;
  const locale: Locale = run.locale;
  const fail = (error: JobError) =>
    withTenant(db, tenantId, (tx) =>
      tx
        .update(lessonDrafts)
        .set({ status: "failed", error, finishedAt: new Date() })
        .where(eq(lessonDrafts.id, draftId)),
    );
  if (!deps.model) {
    await fail("gateway_missing");
    return;
  }

  const context = await withTenant(db, tenantId, async (tx) => {
    const [course] = await tx.select().from(courses).where(eq(courses.id, run.courseId));
    const [assignment] = await tx
      .select()
      .from(assignments)
      .where(eq(assignments.courseId, run.courseId));
    const [rubricRow] = assignment
      ? await tx.select().from(rubrics).where(eq(rubrics.id, assignment.rubricId))
      : [];
    const existing = await tx
      .select({
        key: lessons.key,
        title: lessons.title,
        locale: lessons.locale,
        position: lessons.position,
      })
      .from(lessons)
      .where(eq(lessons.courseId, run.courseId));
    return course && assignment && rubricRow ? { course, assignment, rubricRow, existing } : null;
  });
  if (!context) {
    await fail("no_assignment");
    return;
  }
  await withTenant(db, tenantId, (tx) =>
    tx
      .update(lessonDrafts)
      .set({ status: "running", error: null })
      .where(eq(lessonDrafts.id, draftId)),
  );

  const rubric = rubricSchema.parse(context.rubricRow.definition);
  const fallback = [context.course.languages[0] as Locale];
  const criteria = rubric.criteria.map((criterion) => ({
    id: criterion.id,
    label: localize(criterion.label, locale, fallback),
    description: localize(criterion.description, locale, fallback),
  }));
  const scope = { tenantId, courseId: run.courseId, refId: draftId };
  const material = await gatherMaterial(
    db,
    tenantId,
    run.courseId,
    criteria,
    deps.embeddings,
    usageRecorder(db, { ...scope, kind: "embedding" }),
  );
  const llm = meteredLlm(db, deps.model.llm, { ...scope, kind: "lesson_draft" });
  const prompt = buildLessonDraftPrompt({
    locale,
    artifactName: localize(context.assignment.artifactName, locale, fallback),
    assignmentPrompt: localize(context.assignment.prompt, locale, fallback),
    criteria,
    existingLessons: context.existing
      .filter((row) => row.locale === locale)
      .map((row) => row.title),
    passages: material.passages,
    maxLessons: MAX_LESSONS,
    nonce: randomUUID(),
  });

  let parsed: ReturnType<typeof parseLessonDraft> = { ok: false, error: "no answer" };
  let tokensIn = 0;
  let tokensOut = 0;
  let cost: number | null = 0;
  let model = deps.model.model;
  try {
    for (let attempt = 0; attempt < 2 && !parsed.ok; attempt++) {
      const call = await llm({
        model: deps.model.model,
        temperature: 0.4,
        maxTokens: 12_000,
        jsonSchema: { ...LESSON_DRAFT_JSON_SCHEMA, schema: { ...LESSON_DRAFT_JSON_SCHEMA.schema } },
        metadata: { purpose: "lesson-draft", prompt_version: LESSON_DRAFT_PROMPT_VERSION },
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      });
      tokensIn += call.tokensIn ?? 0;
      tokensOut += call.tokensOut ?? 0;
      cost = cost === null || call.cost === null ? null : cost + call.cost;
      model = call.model;
      parsed = parseLessonDraft(
        call.content,
        {
          criterionIds: criteria.map((criterion) => criterion.id),
          sourceRefs: [...material.sourceOf.keys()],
          keyframeRefs: [...material.keyframes.keys()],
        },
        MAX_LESSONS,
      );
    }
  } catch (error) {
    if (!deps.finalAttempt) throw error;
    await fail("gateway_failed");
    return;
  }
  if (!parsed.ok) {
    await fail("invalid_drafts");
    return;
  }
  const drafted = parsed;

  await withTenant(db, tenantId, async (tx) => {
    const keys = new Set(context.existing.map((row) => row.key));
    let position = context.existing.reduce(
      (highest, row) => Math.max(highest, row.position + 1),
      0,
    );
    const created: string[] = [];
    const usedKeyframes = new Set<string>();
    for (const lesson of drafted.lessons) {
      const key = lessonKeyFor(lesson.title, keys);
      keys.add(key);
      const images = new Map(
        lesson.keyframeRefs.flatMap((ref) => {
          const keyframe = material.keyframes.get(ref);
          if (!keyframe) return [];
          usedKeyframes.add(keyframe.fileId);
          return [
            [ref, { url: `/files/${keyframe.fileId}.jpg`, caption: keyframe.caption }] as const,
          ];
        }),
      );
      const blocks: LessonBlock[] = [
        { type: "markdown", markdown: placeKeyframes(lesson.markdown, images) },
      ];
      const [row] = await tx
        .insert(lessons)
        .values({
          tenantId,
          courseId: run.courseId,
          locale,
          key,
          position: position++,
          title: lesson.title,
          blocks,
          criterionIds: lesson.criterionIds,
          sourceIds: [
            ...new Set(lesson.sourceRefs.flatMap((ref) => material.sourceOf.get(ref) ?? [])),
          ],
        })
        .returning({ id: lessons.id });
      await tx.insert(lessonVersions).values({
        tenantId,
        lessonId: row!.id,
        version: 1,
        title: lesson.title,
        blocks,
        createdBy: run.requestedBy,
      });
      created.push(row!.id);
    }
    // Screenshots in a lesson are lesson media now: learners may load them.
    if (usedKeyframes.size > 0) {
      await tx
        .update(files)
        .set({ purpose: "lesson_media" })
        .where(and(inArray(files.id, [...usedKeyframes]), eq(files.purpose, "keyframe")));
    }
    await tx.update(courses).set({ updatedAt: new Date() }).where(eq(courses.id, run.courseId));
    await tx
      .update(lessonDrafts)
      .set({
        status: "done",
        lessonIds: created,
        notes: drafted.notes,
        model,
        promptVersion: LESSON_DRAFT_PROMPT_VERSION,
        tokensIn,
        tokensOut,
        costMicroUsd: cost === null ? null : Math.round(cost * 1_000_000),
        finishedAt: new Date(),
      })
      .where(eq(lessonDrafts.id, draftId));
  });
}

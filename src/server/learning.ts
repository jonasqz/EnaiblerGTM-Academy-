import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import {
  acceptedFileKind,
  acceptsText,
  acceptsUrl,
  fileRules,
  formFieldsFromSchema,
  MAX_FILES_PER_SUBMISSION,
  validateFormValues,
  type FormField,
} from "@/core/assignments/submission-types";
import { nextLessonKey, type LessonProgressMap } from "@/core/courses/lessons";
import type { Locale } from "@/core/i18n/locales";
import { canResubmit, effectiveOutcome, type Outcome } from "@/core/review/outcome";
import { rubricSchema, type Rubric } from "@/core/review/rubric";
import type { TenantContext } from "@/core/tenant/context";
import type { Database } from "@/db/client";
import {
  assignments,
  courses,
  credentials,
  enrollments,
  lessons,
  reviews,
  rubrics,
  submissions,
} from "@/db/schema";
import type { ReviewCriterionResult, ReviewOverall, SubmittedFile } from "@/db/schema/learning";
import { withTenant } from "@/db/tenant-scope";
import { trackEvent } from "@/server/events";
import { attachFiles } from "@/server/files";
import type { Enqueue } from "@/server/jobs/producer";
import { QUEUES } from "@/server/jobs/queues";

/*
 * The learner's side of the core loop (brief §2, §5): lessons → assignment →
 * review → revise. Learners only ever see released reviews: an AI result held
 * for a human is not shown until the human decides.
 */

export interface LearnerAttempt {
  id: string;
  attemptNo: number;
  submittedAt: Date;
  outcome: Outcome;
  text: string | null;
  form: Record<string, unknown> | null;
  url: string | null;
  files: SubmittedFile[];
  feedback: {
    criteria: ReviewCriterionResult[];
    overall: ReviewOverall;
    reviewer: "ai" | "human";
  } | null;
  /** A decided result the learner has not looked at yet (its mail is still due). */
  unseen: boolean;
}

export async function loadLearnerCourse(
  db: Database,
  tenant: TenantContext,
  slug: string,
  userId: string | null,
  preferredLocale: Locale,
) {
  return withTenant(db, tenant.id, async (tx) => {
    const [course] = await tx
      .select()
      .from(courses)
      .where(and(eq(courses.slug, slug), eq(courses.status, "published")));
    if (!course) return null;

    const [enrollment] = userId
      ? await tx
          .select()
          .from(enrollments)
          .where(and(eq(enrollments.courseId, course.id), eq(enrollments.userId, userId)))
      : [];
    const languages = course.languages as Locale[];
    const locale: Locale =
      (enrollment?.locale as Locale | undefined) ??
      (languages.includes(preferredLocale) ? preferredLocale : (languages[0] ?? preferredLocale));

    const lessonRows = await tx
      .select({
        id: lessons.id,
        key: lessons.key,
        title: lessons.title,
        blocks: lessons.blocks,
        criterionIds: lessons.criterionIds,
      })
      .from(lessons)
      .where(and(eq(lessons.courseId, course.id), eq(lessons.locale, locale)))
      .orderBy(asc(lessons.position));

    const [assignment] = await tx
      .select()
      .from(assignments)
      .where(eq(assignments.courseId, course.id));
    const [rubricRow] = assignment
      ? await tx.select().from(rubrics).where(eq(rubrics.id, assignment.rubricId))
      : [];
    const rubric: Rubric | null = rubricRow ? rubricSchema.parse(rubricRow.definition) : null;

    const attempts: LearnerAttempt[] = [];
    if (userId && assignment) {
      const rows = await tx
        .select()
        .from(submissions)
        .where(and(eq(submissions.assignmentId, assignment.id), eq(submissions.userId, userId)))
        .orderBy(desc(submissions.attemptNo));
      const reviewRows = rows.length
        ? await tx
            .select()
            .from(reviews)
            .where(
              inArray(
                reviews.submissionId,
                rows.map((row) => row.id),
              ),
            )
            .orderBy(desc(reviews.createdAt))
        : [];
      for (const row of rows) {
        const human = reviewRows.find(
          (review) => review.submissionId === row.id && review.reviewerType === "human",
        );
        const ai = reviewRows.find(
          (review) =>
            review.submissionId === row.id &&
            review.reviewerType === "ai" &&
            review.routing?.release,
        );
        const outcome = effectiveOutcome(row.status, human ? human.overall.pass : null);
        const shown = outcome === "pending" ? null : (human ?? ai ?? null);
        attempts.push({
          id: row.id,
          attemptNo: row.attemptNo,
          submittedAt: row.submittedAt,
          outcome,
          text: row.extractedText,
          form: row.formData,
          url: row.url,
          files: row.files,
          feedback: shown
            ? { criteria: shown.criteria, overall: shown.overall, reviewer: shown.reviewerType }
            : null,
          unseen:
            outcome !== "pending" &&
            row.decidedAt !== null &&
            (row.resultSeenAt === null || row.resultSeenAt < row.decidedAt),
        });
      }
    }

    const [credential] = userId
      ? await tx
          .select({
            publicId: credentials.publicId,
            visibility: credentials.visibility,
            displayName: credentials.displayName,
          })
          .from(credentials)
          .where(
            and(
              eq(credentials.courseId, course.id),
              eq(credentials.userId, userId),
              sql`${credentials.revokedAt} is null`,
            ),
          )
      : [];

    return {
      course,
      locale,
      lessons: lessonRows,
      enrollment: enrollment ?? null,
      assignment: assignment ?? null,
      rubric,
      formFields: assignment
        ? (assignment.submissionTypes
            .flatMap((type) =>
              type.type === "template_form" ? [formFieldsFromSchema(type.schema)] : [],
            )
            .find((fields): fields is FormField[] => fields !== null) ?? null)
        : null,
      acceptsText: assignment ? acceptsText(assignment.submissionTypes) : false,
      acceptsUrl: assignment ? acceptsUrl(assignment.submissionTypes) : false,
      fileRules: assignment ? fileRules(assignment.submissionTypes) : null,
      attempts,
      credential: credential ?? null,
    };
  });
}

export type LearnerCourse = NonNullable<Awaited<ReturnType<typeof loadLearnerCourse>>>;

/** Marks a lesson done (idempotent) and returns where to go next. */
export async function completeLesson(
  db: Database,
  tenant: TenantContext,
  userId: string,
  input: { courseSlug: string; key: string },
): Promise<{ nextKey: string | null } | null> {
  return withTenant(db, tenant.id, async (tx) => {
    const [row] = await tx
      .select({ enrollment: enrollments, courseId: courses.id })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .where(and(eq(courses.slug, input.courseSlug), eq(enrollments.userId, userId)));
    if (!row) return null;
    const keys = (
      await tx
        .select({ key: lessons.key })
        .from(lessons)
        .where(and(eq(lessons.courseId, row.courseId), eq(lessons.locale, row.enrollment.locale)))
        .orderBy(asc(lessons.position))
    ).map((lesson) => lesson.key);
    if (!keys.includes(input.key)) return null;

    const progress = row.enrollment.lessonProgress as LessonProgressMap;
    if (!progress[input.key]) {
      await tx
        .update(enrollments)
        .set({
          lessonProgress: sql`${enrollments.lessonProgress} || ${JSON.stringify({ [input.key]: { completedAt: new Date().toISOString() } })}::jsonb`,
          lastLessonKey: input.key,
        })
        .where(eq(enrollments.id, row.enrollment.id));
      await trackEvent(tx, {
        tenantId: tenant.id,
        name: "lesson_completed",
        userId,
        courseId: row.courseId,
        pathId: row.enrollment.pathId,
        locale: row.enrollment.locale,
        entry: row.enrollment.entryContext,
        props: { lesson: input.key },
      });
    }
    const updated = { ...progress, [input.key]: { completedAt: "now" } };
    return { nextKey: nextLessonKey(keys, updated, input.key) };
  });
}

export type SubmissionInput = {
  text?: string;
  form?: Record<string, string>;
  url?: string;
  /** Uploads made for this attempt (pending files of this learner). */
  fileIds?: string[];
};

export type SubmitResult =
  | { ok: true; submissionId: string; attemptNo: number }
  | {
      ok: false;
      error: "not_enrolled" | "not_allowed" | "empty" | "invalid";
      fieldErrors?: Record<string, string>;
    };

const MAX_TEXT = 60_000;

class Refused extends Error {
  constructor(readonly result: SubmitResult) {
    super("Submission refused");
  }
}

/**
 * Hands in the artifact. One open attempt at a time; a new attempt is only
 * possible after "needs revision". The review job is enqueued in the same
 * transaction (idempotent by submission id).
 */
export async function submitAssignment(
  db: Database,
  tenant: TenantContext,
  userId: string,
  courseSlug: string,
  input: SubmissionInput,
  enqueue: Enqueue,
): Promise<SubmitResult> {
  try {
    return await withTenant(db, tenant.id, async (tx) => {
      const [row] = await tx
        .select({ enrollment: enrollments, assignment: assignments, courseId: courses.id })
        .from(enrollments)
        .innerJoin(courses, eq(courses.id, enrollments.courseId))
        .innerJoin(assignments, eq(assignments.courseId, courses.id))
        .where(
          and(
            eq(courses.slug, courseSlug),
            eq(courses.status, "published"),
            eq(enrollments.userId, userId),
          ),
        );
      if (!row) return { ok: false, error: "not_enrolled" };

      const previous = await tx
        .select({
          id: submissions.id,
          status: submissions.status,
          attemptNo: submissions.attemptNo,
        })
        .from(submissions)
        .where(and(eq(submissions.assignmentId, row.assignment.id), eq(submissions.userId, userId)))
        .orderBy(desc(submissions.attemptNo))
        .limit(1);
      const last = previous[0];
      if (last) {
        const [human] = await tx
          .select({ overall: reviews.overall })
          .from(reviews)
          .where(and(eq(reviews.submissionId, last.id), eq(reviews.reviewerType, "human")))
          .orderBy(desc(reviews.createdAt))
          .limit(1);
        if (!canResubmit(effectiveOutcome(last.status, human ? human.overall.pass : null))) {
          return { ok: false, error: "not_allowed" };
        }
      }

      const types = row.assignment.submissionTypes;
      const text = input.text?.trim() ?? "";
      const url = input.url?.trim() ?? "";
      let formData: Record<string, string> | null = null;
      const fields = types
        .flatMap((type) =>
          type.type === "template_form" ? [formFieldsFromSchema(type.schema)] : [],
        )
        .find((found): found is FormField[] => found !== null);
      if (fields && input.form) {
        const checked = validateFormValues(fields, input.form);
        if (!checked.ok) return { ok: false, error: "invalid", fieldErrors: checked.errors };
        formData = Object.keys(checked.data).length > 0 ? checked.data : null;
      }
      if (text && (!acceptsText(types) || text.length > MAX_TEXT))
        return { ok: false, error: "invalid" };
      if (url) {
        let valid = acceptsUrl(types);
        try {
          valid &&= ["https:", "http:"].includes(new URL(url).protocol);
        } catch {
          valid = false;
        }
        if (!valid) return { ok: false, error: "invalid" };
      }
      const fileIds = [...new Set(input.fileIds ?? [])];
      let handedIn: SubmittedFile[] = [];
      if (fileIds.length > 0) {
        if (!fileRules(types) || fileIds.length > MAX_FILES_PER_SUBMISSION) {
          return { ok: false, error: "invalid" };
        }
        // Throwing rolls the claim back, so a refused attempt leaves the uploads pending.
        const claimed = await attachFiles(tx, {
          ids: fileIds,
          purpose: "submission",
          ownerUserId: userId,
        }).catch(() => {
          throw new Refused({ ok: false, error: "invalid" });
        });
        handedIn = claimed.map((file) => ({
          fileId: file.id,
          name: file.name,
          mimeType: file.contentType,
          size: file.sizeBytes,
          kind: acceptedFileKind(types, file.contentType)!,
        }));
        if (handedIn.some((file) => !file.kind)) throw new Refused({ ok: false, error: "invalid" });
      }
      if (!text && !url && !formData && handedIn.length === 0) return { ok: false, error: "empty" };

      const attemptNo = (last?.attemptNo ?? 0) + 1;
      const [submission] = await tx
        .insert(submissions)
        .values({
          tenantId: tenant.id,
          assignmentId: row.assignment.id,
          userId,
          attemptNo,
          extractedText: text || null,
          formData,
          url: url || null,
          files: handedIn,
        })
        .returning({ id: submissions.id });
      await trackEvent(tx, {
        tenantId: tenant.id,
        name: "assignment_submitted",
        userId,
        courseId: row.courseId,
        pathId: row.enrollment.pathId,
        locale: row.enrollment.locale,
        entry: row.enrollment.entryContext,
        props: { attempt: attemptNo },
      });
      await enqueue(
        tx,
        QUEUES.review,
        { tenantId: tenant.id, submissionId: submission!.id },
        { id: submission!.id },
      );
      return { ok: true, submissionId: submission!.id, attemptNo };
    });
  } catch (error) {
    if (error instanceof Refused) return error.result;
    throw error;
  }
}

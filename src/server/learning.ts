import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { handInDecision } from "@/core/assignments/deadline";
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
import { requiresTest, requiresWork, type CompletionMode } from "@/core/courses/completion";
import { nextLessonKey, type LessonProgressMap } from "@/core/courses/lessons";
import type { Locale } from "@/core/i18n/locales";
import {
  summarizeAttempts,
  unansweredQuestions,
  type TestAttempts,
} from "@/core/questions/attempts";
import {
  answersFromForm,
  gradeAnswers,
  gradePercent,
  passesTest,
  publicTestQuestions,
  type PublicQuestion,
} from "@/core/questions/questions";
import {
  attemptSeed,
  attemptsLeft,
  questionsAsServed,
  seededRandom,
  servedCount,
  serveQuestions,
  variesByAttempt,
  type ServedQuestion,
} from "@/core/questions/quiz";
import { canResubmit, effectiveOutcome, type Outcome } from "@/core/review/outcome";
import { rubricSchema, type Rubric } from "@/core/review/rubric";
import type { TenantContext } from "@/core/tenant/context";
import type { Database, Transaction } from "@/db/client";
import {
  assignments,
  courses,
  courseTests,
  credentials,
  enrollments,
  lessons,
  reviews,
  rubrics,
  submissions,
  testAttempts,
} from "@/db/schema";
import type { ReviewCriterionResult, ReviewOverall, SubmittedFile } from "@/db/schema/learning";
import { withTenant } from "@/db/tenant-scope";
import { completeCourse, type CompletionResult } from "@/server/courses/completion";
import { learnerSessions, webinarIdOf } from "@/server/courses/sessions";
import { trackEvent } from "@/server/events";
import { attachFiles } from "@/server/files";
import type { Enqueue } from "@/server/jobs/producer";
import { QUEUES } from "@/server/jobs/queues";
import { queueLevelUp } from "@/server/notifications";

/*
 * The learner's side of the core loop (brief §2, §5): lessons → assignment →
 * review → revise, or the final test where the authors chose one
 * (core/courses/completion). Learners only ever see released reviews: an AI
 * result held for a human is not shown until the human decides. Test
 * questions reach them without the answer key; grading happens here.
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

/** A course's final test as learners get it: the questions without their answer key. */
export interface LearnerTest {
  /** Handed in with the answers, so a test edited in the meantime is not graded blind. */
  version: number;
  /** The attempt these questions are served for; handed in with the answers too. */
  attemptNo: number;
  /** As the next attempt serves them: a draw from the pool, shuffled where the authors chose. */
  questions: PublicQuestion[];
  /** Each attempt draws its questions from a larger pool. */
  drawn: boolean;
  passPercent: number;
  /** After an attempt, learners see which questions were wrong (never the right answers). */
  showMistakes: boolean;
  /** The authors' limit on attempts; null for unlimited. */
  maxAttempts: number | null;
  /** Attempts the learner has left; null without a limit. */
  attemptsLeft: number | null;
  /** The learner's own attempts; none for visitors. */
  attempts: TestAttempts;
}

type CourseTestRow = typeof courseTests.$inferSelect;

/** What one attempt of this learner serves (core/questions/quiz): the same on every page load. */
function serveAttempt(test: CourseTestRow, userId: string, attemptNo: number): ServedQuestion[] {
  return serveQuestions(
    test.questions,
    test,
    seededRandom(attemptSeed({ testId: test.id, userId, attemptNo, version: test.version })),
  );
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

    const [testRow] = requiresTest(course.completionMode)
      ? await tx.select().from(courseTests).where(eq(courseTests.courseId, course.id))
      : [];
    const attemptRows =
      testRow && userId
        ? await tx
            .select({
              attemptNo: testAttempts.attemptNo,
              correct: testAttempts.correct,
              total: testAttempts.total,
              passed: testAttempts.passed,
              createdAt: testAttempts.createdAt,
            })
            .from(testAttempts)
            .where(and(eq(testAttempts.courseId, course.id), eq(testAttempts.userId, userId)))
        : [];
    // Field by field: the stored questions carry the answer key.
    let test: LearnerTest | null = null;
    if (testRow && testRow.questions.length > 0) {
      const attempts = summarizeAttempts(attemptRows);
      // Attempts are numbered without gaps, so the next one follows the count.
      const attemptNo = attempts.count + 1;
      test = {
        version: testRow.version,
        attemptNo,
        questions: publicTestQuestions(
          questionsAsServed(testRow.questions, serveAttempt(testRow, userId ?? "", attemptNo)),
          locale,
          [tenant.settings.default_locale],
        ),
        drawn: servedCount(testRow.questions.length, testRow.poolSize) < testRow.questions.length,
        passPercent: testRow.passPercent,
        showMistakes: testRow.showMistakes,
        maxAttempts: testRow.maxAttempts,
        attemptsLeft: attemptsLeft(testRow.maxAttempts, attempts.count),
        attempts,
      };
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

    const requirement = { rule: course.sessionRule, catchUpDays: course.catchUpDays };
    return {
      course,
      /** How learners finish: the work, the final test or both. */
      completionMode: course.completionMode,
      /** What a series asks of its sessions (core/courses/sessions). */
      sessionRequirement: requirement,
      /** Its live sessions, with where the learner stands with each (server/courses/sessions). */
      sessions: await learnerSessions(tx, {
        courseId: course.id,
        userId: enrollment ? userId : null,
        requirement,
        now: new Date(),
      }),
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
      /** The latest hand-in passed. With a final test too, the credential can still wait. */
      workPassed: attempts[0]?.outcome === "passed",
      /** Null unless the course ends with a test that has questions. */
      test,
      credential: credential ?? null,
    };
  });
}

export type LearnerCourse = NonNullable<Awaited<ReturnType<typeof loadLearnerCourse>>>;

/** Per course: the outcome of the learner's latest hand-in, a human's decision first. */
export async function workOutcomes(
  tx: Transaction,
  userId: string,
  courseIds: readonly string[],
): Promise<Map<string, Outcome>> {
  if (courseIds.length === 0) return new Map();
  const rows = await tx
    .select({
      courseId: assignments.courseId,
      id: submissions.id,
      status: submissions.status,
    })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .where(and(eq(submissions.userId, userId), inArray(assignments.courseId, [...courseIds])))
    .orderBy(desc(submissions.attemptNo));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!latest.has(row.courseId)) latest.set(row.courseId, row);
  const overridden = [...latest.values()]
    .filter((row) => row.status === "overridden")
    .map((row) => row.id);
  const humans = overridden.length
    ? await tx
        .select({ submissionId: reviews.submissionId, overall: reviews.overall })
        .from(reviews)
        .where(and(inArray(reviews.submissionId, overridden), eq(reviews.reviewerType, "human")))
        .orderBy(desc(reviews.createdAt))
    : [];
  return new Map(
    [...latest].map(([courseId, row]) => {
      const human = humans.find((review) => review.submissionId === row.id);
      return [courseId, effectiveOutcome(row.status, human ? human.overall.pass : null)];
    }),
  );
}

/** Per course with attempts: whether the learner's final test passed. */
export async function testStates(
  tx: Transaction,
  userId: string,
  courseIds: readonly string[],
): Promise<Map<string, { taken: boolean; passed: boolean }>> {
  if (courseIds.length === 0) return new Map();
  const rows = await tx
    .select({
      courseId: testAttempts.courseId,
      passed: sql<boolean>`bool_or(${testAttempts.passed})`,
    })
    .from(testAttempts)
    .where(and(eq(testAttempts.userId, userId), inArray(testAttempts.courseId, [...courseIds])))
    .groupBy(testAttempts.courseId);
  return new Map(rows.map((row) => [row.courseId, { taken: true, passed: row.passed }]));
}

/**
 * Marks a lesson done (idempotent) and returns where to go next: the next
 * lesson, or after the last one whatever the course ends with.
 */
export async function completeLesson(
  db: Database,
  tenant: TenantContext,
  userId: string,
  input: { courseSlug: string; key: string },
): Promise<{ nextKey: string | null; completionMode: CompletionMode } | null> {
  return withTenant(db, tenant.id, async (tx) => {
    const [row] = await tx
      .select({
        enrollment: enrollments,
        courseId: courses.id,
        completionMode: courses.completionMode,
      })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .where(and(eq(courses.slug, input.courseSlug), eq(enrollments.userId, userId)));
    if (!row) return null;
    const rows = await tx
      .select({ key: lessons.key, blocks: lessons.blocks })
      .from(lessons)
      .where(and(eq(lessons.courseId, row.courseId), eq(lessons.locale, row.enrollment.locale)))
      .orderBy(asc(lessons.position));
    const keys = rows.map((lesson) => lesson.key);
    if (!keys.includes(input.key)) return null;
    // A session is done by being there or watching it (server/courses/sessions), never by a click.
    const session = rows.some((lesson) => lesson.key === input.key && webinarIdOf(lesson.blocks));

    const progress = row.enrollment.lessonProgress as LessonProgressMap;
    if (!progress[input.key] && !session) {
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
    const updated = session ? progress : { ...progress, [input.key]: { completedAt: "now" } };
    return {
      nextKey: nextLessonKey(keys, updated, input.key),
      completionMode: row.completionMode,
    };
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
      /** `late`: past the deadline, and the academy takes no late hand-ins. */
      error: "not_enrolled" | "not_allowed" | "empty" | "invalid" | "late";
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
        .select({
          enrollment: enrollments,
          assignment: assignments,
          courseId: courses.id,
          completionMode: courses.completionMode,
        })
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
      // A course that switched to a test alone keeps its assignment, but takes no more work.
      if (!requiresWork(row.completionMode)) return { ok: false, error: "not_allowed" };

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
      // The deadline holds the first hand-in; a revision of work already in stays open.
      const timing = handInDecision({
        dueAt: row.assignment.dueAt,
        policy: tenant.settings.assignments.late_submissions,
        revision: last !== undefined,
        now: new Date(),
      });
      if (timing === "refused") return { ok: false, error: "late" };

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
        props: { attempt: attemptNo, ...(timing === "late" ? { late: true } : {}) },
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

export type TestSubmitError =
  | "not_enrolled"
  | "no_test"
  | "changed"
  | "unanswered"
  | "passed"
  | "completed"
  | "no_attempts_left";

export type TestSubmitResult =
  | {
      ok: true;
      attemptNo: number;
      correct: number;
      total: number;
      percent: number;
      passed: boolean;
      passPercent: number;
      /** Questions answered wrong, only where the course shows mistakes; never the right answers. */
      wrong: string[] | null;
      /** Attempts left after this one; null without a limit. */
      attemptsLeft: number | null;
      /** After a pass: the credential, or the parts it still waits for. */
      completion: CompletionResult | null;
    }
  | { ok: false; error: TestSubmitError; unanswered?: string[] };

/**
 * Grades an attempt at the course's final test and records it. Retakes are
 * allowed until one passes, up to the authors' limit if they set one; a pass
 * completes the course once every part it asks for is passed, in either
 * order (server/courses/completion). An attempt is graded on the questions it
 * served (core/questions/quiz) and records them. A learner's attempts queue
 * on their enrollment row, so numbers never collide and nothing follows a pass.
 */
export async function submitTest(
  db: Database,
  tenant: TenantContext,
  userId: string,
  courseSlug: string,
  input: {
    /** Form fields `answer.<question id>`, one per chosen option. */
    entries: Iterable<[string, unknown]>;
    /** The version the learner answered; another current version is refused. */
    version?: number;
    /** The attempt the questions were served for; where attempts differ, another is refused. */
    attempt?: number;
  },
): Promise<TestSubmitResult> {
  return withTenant(db, tenant.id, async (tx) => {
    const [row] = await tx
      .select({
        enrollment: enrollments,
        courseId: courses.id,
        completionMode: courses.completionMode,
      })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .where(
        and(
          eq(courses.slug, courseSlug),
          eq(courses.status, "published"),
          eq(enrollments.userId, userId),
        ),
      )
      .for("update", { of: enrollments });
    if (!row) return { ok: false, error: "not_enrolled" };
    const [test] = requiresTest(row.completionMode)
      ? await tx.select().from(courseTests).where(eq(courseTests.courseId, row.courseId))
      : [];
    if (!test || test.questions.length === 0) return { ok: false, error: "no_test" };

    const [prior] = await tx
      .select({
        last: sql<number | null>`max(${testAttempts.attemptNo})`,
        count: sql<number>`count(*)::int`,
        passed: sql<boolean>`coalesce(bool_or(${testAttempts.passed}), false)`,
      })
      .from(testAttempts)
      .where(and(eq(testAttempts.courseId, row.courseId), eq(testAttempts.userId, userId)));
    if (prior?.passed) return { ok: false, error: "passed" };
    const [credential] = await tx
      .select({ id: credentials.id })
      .from(credentials)
      .where(
        and(
          eq(credentials.courseId, row.courseId),
          eq(credentials.userId, userId),
          isNull(credentials.revokedAt),
        ),
      );
    // Earned before the course asked for a test: a pass now would rewrite how it was earned.
    if (credential) return { ok: false, error: "completed" };
    const taken = prior?.count ?? 0;
    if (attemptsLeft(test.maxAttempts, taken) === 0)
      return { ok: false, error: "no_attempts_left" };
    if (input.version !== undefined && input.version !== test.version) {
      return { ok: false, error: "changed" };
    }
    const attemptNo = (prior?.last ?? 0) + 1;
    // Answers to another attempt's draw (e.g. from a second tab) would be graded on the wrong questions.
    if (
      input.attempt !== undefined &&
      input.attempt !== attemptNo &&
      variesByAttempt(test, test.questions.length)
    ) {
      return { ok: false, error: "changed" };
    }

    const served = serveAttempt(test, userId, attemptNo);
    const questions = questionsAsServed(test.questions, served);
    const answers = answersFromForm(input.entries, questions);
    const unanswered = unansweredQuestions(questions, answers);
    if (unanswered.length > 0) return { ok: false, error: "unanswered", unanswered };

    const grade = gradeAnswers(questions, answers);
    const passed = passesTest(grade, test.passPercent);
    const percent = gradePercent(grade);
    await tx.insert(testAttempts).values({
      tenantId: tenant.id,
      courseId: row.courseId,
      userId,
      attemptNo,
      testVersion: test.version,
      locale: row.enrollment.locale,
      answers,
      served,
      correct: grade.correct,
      total: grade.total,
      passed,
    });
    const event = {
      tenantId: tenant.id,
      userId,
      courseId: row.courseId,
      pathId: row.enrollment.pathId,
      locale: row.enrollment.locale,
      entry: row.enrollment.entryContext,
    };
    await trackEvent(tx, {
      ...event,
      name: "test_submitted",
      props: { attempt: attemptNo, percent, passed },
    });

    let completion: CompletionResult | null = null;
    if (passed) {
      await trackEvent(tx, { ...event, name: "test_passed", props: { attempt: attemptNo } });
      completion = await completeCourse(tx, tenant, { userId, courseId: row.courseId });
      if (completion.issued && completion.levelUp) {
        // A test result has no review mail to carry the level, so it gets its own.
        const [issued] = await tx
          .select({ pathId: credentials.pathId })
          .from(credentials)
          .where(eq(credentials.publicId, completion.publicId));
        if (issued?.pathId) {
          await queueLevelUp(tx, tenant.id, {
            userId,
            pathId: issued.pathId,
            level: completion.levelUp.n,
          });
        }
      }
    }
    return {
      ok: true,
      attemptNo,
      correct: grade.correct,
      total: grade.total,
      percent,
      passed,
      passPercent: test.passPercent,
      wrong: test.showMistakes ? grade.wrong : null,
      attemptsLeft: attemptsLeft(test.maxAttempts, taken + 1),
      completion,
    };
  });
}

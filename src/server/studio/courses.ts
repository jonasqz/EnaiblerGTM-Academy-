import { and, asc, desc, eq, isNull, ne, or, sql } from "drizzle-orm";

import type { SubmissionType } from "@/core/assignments/submission-types";
import {
  PLATFORM_CAPABILITIES,
  type DeliveryMode,
  type PlatformCapabilities,
} from "@/core/compliance/delivery-mode";
import { requiresTest, requiresWork, type CompletionMode } from "@/core/courses/completion";
import { checkCoursePublishable, type PublishCheck } from "@/core/courses/publish-check";
import { starterRubric } from "@/core/courses/starter-rubric";
import { isLocale, SUPPORTED_LOCALES, type Locale, type LocalizedText } from "@/core/i18n/locales";
import { rubricSchema, type Rubric } from "@/core/review/rubric";
import { sameJson } from "@/core/shared/json";
import { slugify } from "@/core/shared/slug";
import type { TenantContext } from "@/core/tenant/context";
import type { Database, Transaction } from "@/db/client";
import {
  assignments,
  calibrationRuns,
  courseTests,
  courses,
  credentials,
  enrollments,
  lessons,
  rubrics,
  submissions,
  testAttempts,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { completeCourse } from "@/server/courses/completion";
import { checkQuestionsOf, markdownOf } from "@/server/studio/lessons";

/*
 * Studio data for courses (brief §7). Everything runs inside withTenant:
 * RLS scopes every statement to the academy, callers check capabilities.
 */

export type CourseStatus = (typeof courses.$inferSelect)["status"];

export interface CourseListRow {
  id: string;
  slug: string;
  title: LocalizedText;
  status: CourseStatus;
  languages: string[];
  deliveryMode: DeliveryMode;
  version: number;
  updatedAt: Date;
  lessons: number;
  enrolled: number;
  completed: number;
  pendingReviews: number;
  credentials: number;
}

export async function listCourses(db: Database, tenantId: string): Promise<CourseListRow[]> {
  return withTenant(db, tenantId, (tx) =>
    tx
      .select({
        id: courses.id,
        slug: courses.slug,
        title: courses.title,
        status: courses.status,
        languages: courses.languages,
        deliveryMode: courses.deliveryMode,
        version: courses.version,
        updatedAt: courses.updatedAt,
        lessons: sql<number>`(select count(distinct l.key)::int from ${lessons} l where l.course_id = "courses"."id")`,
        enrolled: sql<number>`(select count(*)::int from ${enrollments} e where e.course_id = "courses"."id")`,
        completed: sql<number>`(select count(*)::int from ${enrollments} e where e.course_id = "courses"."id" and e.completed_at is not null)`,
        pendingReviews: sql<number>`(select count(*)::int from ${submissions} s join ${assignments} a on a.id = s.assignment_id where a.course_id = "courses"."id" and s.status in ('submitted', 'in_review'))`,
        credentials: sql<number>`(select count(*)::int from ${credentials} c where c.course_id = "courses"."id" and c.revoked_at is null)`,
      })
      .from(courses)
      .where(ne(courses.status, "archived"))
      .orderBy(desc(courses.updatedAt)),
  );
}

async function uniqueSlug(
  tx: Transaction,
  title: string,
  exceptCourseId?: string,
): Promise<string> {
  const base = slugify(title).slice(0, 56).replace(/-+$/, "") || "course";
  const taken = new Set(
    (await tx.select({ id: courses.id, slug: courses.slug }).from(courses))
      .filter((row) => row.id !== exceptCourseId)
      .map((row) => row.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** What an ending needed and the course did not have yet. */
export interface AddedParts {
  /** The assignment with a starter rubric (the work). */
  assignment: boolean;
  /** An empty final test. */
  test: boolean;
}

/**
 * Creates what the course's ending needs and it does not have yet: the
 * assignment with a starter rubric for work, an empty test for a test.
 * Nothing is ever removed, so switching back finds everything as it was.
 */
async function addMissingParts(
  tx: Transaction,
  tenantId: string,
  course: { id: string; languages: readonly string[] },
  mode: CompletionMode,
  texts: { prompt?: LocalizedText; artifactName?: LocalizedText } = {},
): Promise<AddedParts> {
  const added: AddedParts = { assignment: false, test: false };
  if (requiresWork(mode)) {
    const [assignment] = await tx
      .select({ id: assignments.id })
      .from(assignments)
      .where(eq(assignments.courseId, course.id));
    if (!assignment) {
      const languages = course.languages.filter(isLocale);
      const [rubric] = await tx
        .insert(rubrics)
        .values({
          tenantId,
          definition: starterRubric(languages.length > 0 ? languages : SUPPORTED_LOCALES),
        })
        .returning({ id: rubrics.id });
      // Empty texts are fine for a draft: the publish checklist asks for them per language.
      await tx.insert(assignments).values({
        tenantId,
        courseId: course.id,
        prompt: texts.prompt ?? {},
        artifactName: texts.artifactName ?? {},
        submissionTypes: [{ type: "file", accept: ["md"], max_mb: 15 }],
        rubricId: rubric!.id,
      });
      added.assignment = true;
    }
  }
  if (requiresTest(mode)) {
    const inserted = await tx
      .insert(courseTests)
      .values({ tenantId, courseId: course.id })
      .onConflictDoNothing()
      .returning({ id: courseTests.id });
    added.test = inserted.length > 0;
  }
  return added;
}

export interface NewCourseInput {
  languages: Locale[];
  title: string;
  deliveryMode: DeliveryMode;
  /** How learners finish; the work when left out. */
  completionMode?: CompletionMode;
  /** What learners build, when the course ends with work. */
  artifactName?: string;
  /** What the learner must produce; becomes the assignment prompt. */
  outcome?: string;
}

/**
 * Outcome-first creation (brief §7 step 1): the course starts from how
 * learners finish it. Work starts from the artifact the learner builds, with
 * a starter rubric to edit; a final test starts empty. Texts are in the first
 * course language; the publish checklist asks for the others.
 */
export async function createCourse(
  db: Database,
  tenantId: string,
  input: NewCourseInput,
): Promise<string> {
  const [primary] = input.languages;
  if (!primary) throw new Error("A course needs at least one language");
  const mode = input.completionMode ?? "work";
  return withTenant(db, tenantId, async (tx) => {
    const slug = await uniqueSlug(tx, input.title);
    const [course] = await tx
      .insert(courses)
      .values({
        tenantId,
        slug,
        title: { [primary]: input.title },
        languages: input.languages,
        deliveryMode: input.deliveryMode,
        completionMode: mode,
      })
      .returning({ id: courses.id });
    await addMissingParts(tx, tenantId, { id: course!.id, languages: input.languages }, mode, {
      ...(input.outcome ? { prompt: { [primary]: input.outcome } } : {}),
      ...(input.artifactName ? { artifactName: { [primary]: input.artifactName } } : {}),
    });
    return course!.id;
  });
}

/** What changing how a course ends did besides the change itself. */
export interface CompletionChange {
  added: AddedParts;
  /** Learners it finished: they had passed everything the course now asks for. */
  completed: number;
}

/**
 * Learners an ending that asks for less finishes: they had passed what it
 * still asks for (e.g. the work, while the test was also required) and hold
 * no credential yet. Issued through completeCourse like any other pass;
 * everyone else finishes as usual.
 */
async function completeFinishedLearners(
  tx: Transaction,
  tenant: TenantContext,
  courseId: string,
): Promise<number> {
  const candidates = await tx
    .select({ userId: enrollments.userId })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.courseId, courseId),
        isNull(enrollments.completedAt),
        or(
          sql`exists (select 1 from ${testAttempts} ta where ta.course_id = ${enrollments.courseId} and ta.user_id = ${enrollments.userId} and ta.passed)`,
          sql`exists (select 1 from ${submissions} s join ${assignments} a on a.id = s.assignment_id where a.course_id = ${enrollments.courseId} and s.user_id = ${enrollments.userId} and s.status in ('passed', 'overridden'))`,
        ),
      ),
    );
  let completed = 0;
  for (const { userId } of candidates) {
    if ((await completeCourse(tx, tenant, { userId, courseId })).issued) completed += 1;
  }
  return completed;
}

/** In the transaction that stored the new mode: what it needs, and whom it finishes. */
async function applyCompletionMode(
  tx: Transaction,
  tenant: TenantContext,
  course: { id: string; languages: readonly string[]; completionMode: CompletionMode },
  mode: CompletionMode,
): Promise<CompletionChange> {
  const added = await addMissingParts(tx, tenant.id, course, mode);
  const asksLess =
    (requiresWork(course.completionMode) && !requiresWork(mode)) ||
    (requiresTest(course.completionMode) && !requiresTest(mode));
  return { added, completed: asksLess ? await completeFinishedLearners(tx, tenant, course.id) : 0 };
}

/**
 * Sets how learners finish the course. Allowed on published courses: it
 * applies to everyone who has not finished yet, and credentials already
 * issued stay. The same mode again only adds what is missing (e.g. the
 * assignment of a course created from a manifest).
 */
export async function setCompletionMode(
  db: Database,
  tenant: TenantContext,
  courseId: string,
  mode: CompletionMode,
): Promise<CompletionChange> {
  return withTenant(db, tenant.id, async (tx) => {
    // Locked, so two saves cannot both add the missing assignment.
    const [course] = await tx.select().from(courses).where(eq(courses.id, courseId)).for("update");
    if (!course) throw new Error("Course not found");
    if (course.completionMode !== mode) {
      await tx.update(courses).set({ completionMode: mode }).where(eq(courses.id, courseId));
    }
    return applyCompletionMode(tx, tenant, course, mode);
  });
}

export async function loadCourseEditor(db: Database, tenantId: string, courseId: string) {
  return withTenant(db, tenantId, async (tx) => {
    const [course] = await tx.select().from(courses).where(eq(courses.id, courseId));
    if (!course) return null;
    const [assignment] = await tx
      .select()
      .from(assignments)
      .where(eq(assignments.courseId, courseId));
    const [rubric] = assignment
      ? await tx.select().from(rubrics).where(eq(rubrics.id, assignment.rubricId))
      : [];
    const lessonRows = await tx
      .select()
      .from(lessons)
      .where(eq(lessons.courseId, courseId))
      .orderBy(asc(lessons.position), asc(lessons.locale));
    const [test] = await tx.select().from(courseTests).where(eq(courseTests.courseId, courseId));
    const [calibration] = await tx
      .select({
        agreement: calibrationRuns.agreement,
        rubricVersion: calibrationRuns.rubricVersion,
      })
      .from(calibrationRuns)
      .where(and(eq(calibrationRuns.courseId, courseId), eq(calibrationRuns.status, "done")))
      .orderBy(desc(calibrationRuns.createdAt))
      .limit(1);
    return {
      course,
      assignment: assignment ?? null,
      rubric: rubric ?? null,
      lessons: lessonRows,
      /** The final test, kept even while the course ends with work only. */
      test: test ?? null,
      calibration: calibration ?? null,
    };
  });
}

export type CourseEditor = NonNullable<Awaited<ReturnType<typeof loadCourseEditor>>>;

export interface CourseSettingsInput {
  title: LocalizedText;
  summary: LocalizedText | null;
  languages: Locale[];
  estMinutes: number | null;
  deliveryMode: DeliveryMode;
  plannedLaunch: string | null;
  slug: string;
  completionMode: CompletionMode;
}

export async function updateCourseSettings(
  db: Database,
  tenant: TenantContext,
  courseId: string,
  input: CourseSettingsInput,
): Promise<CompletionChange> {
  return withTenant(db, tenant.id, async (tx) => {
    const [course] = await tx.select().from(courses).where(eq(courses.id, courseId)).for("update");
    if (!course) throw new Error("Course not found");
    // Shared links and credentials point at the slug: it is fixed once published.
    const slug = course.publishedAt
      ? course.slug
      : await uniqueSlug(tx, input.slug || course.slug, courseId);
    await tx
      .update(courses)
      .set({
        title: input.title,
        summary: input.summary,
        languages: input.languages,
        estMinutes: input.estMinutes,
        deliveryMode: input.deliveryMode,
        plannedLaunch: input.plannedLaunch,
        slug,
        completionMode: input.completionMode,
      })
      .where(eq(courses.id, courseId));
    return applyCompletionMode(
      tx,
      tenant,
      { id: course.id, languages: input.languages, completionMode: course.completionMode },
      input.completionMode,
    );
  });
}

export interface OutcomeInput {
  prompt: LocalizedText;
  artifactName: LocalizedText;
  submissionTypes: SubmissionType[];
  rubric: Rubric;
}

export async function updateOutcome(
  db: Database,
  tenantId: string,
  courseId: string,
  input: OutcomeInput,
): Promise<void> {
  const rubric = rubricSchema.parse(input.rubric);
  await withTenant(db, tenantId, async (tx) => {
    const [assignment] = await tx
      .select()
      .from(assignments)
      .where(eq(assignments.courseId, courseId));
    if (!assignment) throw new Error("Assignment not found");
    await tx
      .update(assignments)
      .set({
        prompt: input.prompt,
        artifactName: input.artifactName,
        submissionTypes: input.submissionTypes,
      })
      .where(eq(assignments.id, assignment.id));
    const [current] = await tx.select().from(rubrics).where(eq(rubrics.id, assignment.rubricId));
    if (current && !sameJson(current.definition, rubric)) {
      // A new version keeps earlier reviews comparable (reviews store rubric_version).
      await tx
        .update(rubrics)
        .set({ definition: rubric, version: current.version + 1 })
        .where(eq(rubrics.id, current.id));
    }
    await tx.update(courses).set({ updatedAt: new Date() }).where(eq(courses.id, courseId));
  });
}

/**
 * Replaces the rubric's exemplars (calibration examples). They are part of
 * the rubric: reviews see them, so a change is a new rubric version.
 */
export async function updateExemplars(
  db: Database,
  tenantId: string,
  courseId: string,
  exemplars: Rubric["exemplars"],
): Promise<void> {
  await withTenant(db, tenantId, async (tx) => {
    const [row] = await tx
      .select({ rubric: rubrics })
      .from(assignments)
      .innerJoin(rubrics, eq(rubrics.id, assignments.rubricId))
      .where(eq(assignments.courseId, courseId));
    if (!row) throw new Error("Rubric not found");
    const definition = rubricSchema.parse({ ...row.rubric.definition, exemplars });
    if (sameJson(row.rubric.definition, definition)) return;
    await tx
      .update(rubrics)
      .set({ definition, version: row.rubric.version + 1 })
      .where(eq(rubrics.id, row.rubric.id));
  });
}

function checkInput(editor: CourseEditor, platform: PlatformCapabilities) {
  return {
    course: {
      title: editor.course.title,
      summary: editor.course.summary,
      languages: editor.course.languages as Locale[],
      deliveryMode: editor.course.deliveryMode,
      offersRecordings: editor.course.offersRecordings,
      zfuApproval: editor.course.zfuApproval,
      estMinutes: editor.course.estMinutes,
      completionMode: editor.course.completionMode,
    },
    lessons: editor.lessons.map((lesson) => ({
      key: lesson.key,
      locale: lesson.locale as Locale,
      title: lesson.title,
      markdown: markdownOf(lesson.blocks),
      criterionIds: lesson.criterionIds,
      questions: checkQuestionsOf(lesson.blocks),
    })),
    assignment: editor.assignment
      ? {
          prompt: editor.assignment.prompt,
          artifactName: editor.assignment.artifactName,
          submissionTypes: editor.assignment.submissionTypes,
        }
      : null,
    rubric: editor.rubric ? rubricSchema.parse(editor.rubric.definition) : null,
    test: editor.test ? { questions: editor.test.questions } : null,
    platform,
  };
}

export interface PublishContext {
  /** The academy's legal pages; publishing is blocked without imprint and privacy. */
  legalLinks?: { imprint?: string; privacy?: string };
  /** Whether the academy uses AI review (features.ai_review); calibration is checked then. */
  aiReview?: boolean;
  platform?: PlatformCapabilities;
}

export function publishCheckFor(editor: CourseEditor, context: PublishContext = {}): PublishCheck {
  const rubric = editor.rubric ? rubricSchema.parse(editor.rubric.definition) : null;
  const usesAi = (context.aiReview ?? false) && rubric?.review_policy.mode !== "human_only";
  return checkCoursePublishable({
    ...checkInput(editor, context.platform ?? PLATFORM_CAPABILITIES),
    ...(context.legalLinks ? { academy: { legalLinks: context.legalLinks } } : {}),
    ...(usesAi
      ? {
          calibration: {
            latest: editor.calibration
              ? {
                  agreement: editor.calibration.agreement,
                  current: editor.calibration.rubricVersion === editor.rubric?.version,
                }
              : null,
          },
        }
      : {}),
  });
}

export async function publishCourse(
  db: Database,
  tenantId: string,
  courseId: string,
  context: PublishContext = {},
): Promise<PublishCheck> {
  const editor = await loadCourseEditor(db, tenantId, courseId);
  if (!editor) throw new Error("Course not found");
  const check = publishCheckFor(editor, context);
  if (!check.ok) return check;
  await withTenant(db, tenantId, (tx) =>
    tx
      .update(courses)
      .set({
        status: "published",
        version: editor.course.version + 1,
        publishedAt: new Date(),
      })
      .where(and(eq(courses.id, courseId), ne(courses.status, "archived"))),
  );
  return check;
}

export async function unpublishCourse(
  db: Database,
  tenantId: string,
  courseId: string,
): Promise<void> {
  await withTenant(db, tenantId, (tx) =>
    tx
      .update(courses)
      .set({ status: "unpublished" })
      .where(and(eq(courses.id, courseId), eq(courses.status, "published"))),
  );
}

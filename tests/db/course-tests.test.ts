import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CompletionMode } from "@/core/courses/completion";
import type { TestQuestion } from "@/core/questions/questions";
import type { TenantContext } from "@/core/tenant/context";
import { validateTenantManifest } from "@/core/tenant/manifest";
import {
  assignments,
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
import { applyTenantManifest, findTenantById } from "@/db/tenants";
import {
  createCourse,
  loadCourseEditor,
  publishCourse,
  setCompletionMode,
  updateCourseSettings,
} from "@/server/studio/courses";
import { courseLearners, courseStats } from "@/server/studio/insights";
import { saveCourseTest } from "@/server/studio/tests";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  testManifest,
  uniqueSlug,
  type TestDatabases,
} from "./helpers";

const LEGAL = { imprint: "https://example.com/imprint", privacy: "https://example.com/privacy" };

function question(n: number): TestQuestion {
  return {
    id: `q${n}`,
    prompt: { en: `Question ${n}: when is an invoice overdue?` },
    options: [
      { id: "a", text: { en: "After the due date" } },
      { id: "b", text: { en: "Never" } },
    ],
    correct: ["a"],
  };
}

describe.skipIf(!hasDatabase)("final tests and how a course ends, in the Studio", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;

  beforeAll(async () => {
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
  });

  afterAll(async () => {
    await dbs?.close();
  });

  async function newCourse(mode: CompletionMode) {
    return createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: `Get paid on time (${mode})`,
      deliveryMode: "free_async",
      completionMode: mode,
      ...(mode === "test"
        ? {}
        : {
            artifactName: "Reminder playbook",
            outcome: "Write the reminder sequence you will use for late invoices.",
          }),
    });
  }

  /** Rows of every part a course can have, to see that nothing goes away. */
  async function partsOf(courseId: string) {
    return withTenant(dbs.app.db, tenant.id, async (tx) => ({
      course: (await tx.select().from(courses).where(eq(courses.id, courseId)))[0]!,
      assignments: await tx.select().from(assignments).where(eq(assignments.courseId, courseId)),
      tests: await tx.select().from(courseTests).where(eq(courseTests.courseId, courseId)),
      rubrics: (await tx.select({ id: rubrics.id }).from(rubrics)).map((row) => row.id),
    }));
  }

  async function learnerIn(courseId: string) {
    const userId = await createUser(dbs.owner.db);
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.insert(enrollments).values({ tenantId: tenant.id, userId, courseId, locale: "en" }),
    );
    return userId;
  }

  async function attempt(
    courseId: string,
    userId: string,
    attemptNo: number,
    correct: number,
    total = 5,
  ) {
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.insert(testAttempts).values({
        tenantId: tenant.id,
        courseId,
        userId,
        attemptNo,
        testVersion: 1,
        locale: "en",
        answers: {},
        correct,
        total,
        passed: correct * 100 >= 80 * total,
      }),
    );
  }

  it("creates what each ending needs, and no work for a test-only course", async () => {
    const work = await partsOf(await newCourse("work"));
    expect(work.course.completionMode).toBe("work");
    expect(work.assignments).toHaveLength(1);
    expect(work.assignments[0]).toMatchObject({
      prompt: { en: "Write the reminder sequence you will use for late invoices." },
      artifactName: { en: "Reminder playbook" },
    });
    expect(work.rubrics).toContain(work.assignments[0]!.rubricId);
    expect(work.tests).toEqual([]);

    const test = await partsOf(await newCourse("test"));
    expect(test.course.completionMode).toBe("test");
    expect(test.assignments).toEqual([]);
    expect(test.tests).toHaveLength(1);
    expect(test.tests[0]).toMatchObject({
      questions: [],
      passPercent: 80,
      showMistakes: true,
      version: 1,
    });

    const both = await partsOf(await newCourse("work_and_test"));
    expect(both.course.completionMode).toBe("work_and_test");
    expect(both.assignments).toHaveLength(1);
    expect(both.tests).toHaveLength(1);
  });

  it("switches how a course ends without deleting anything", async () => {
    const courseId = await newCourse("test");
    const before = await partsOf(courseId);

    const toBoth = await setCompletionMode(dbs.app.db, tenant, courseId, "work_and_test");
    expect(toBoth).toEqual({ added: { assignment: true, test: false }, completed: 0 });
    const both = await partsOf(courseId);
    expect(both.course.completionMode).toBe("work_and_test");
    expect(both.tests.map((row) => row.id)).toEqual(before.tests.map((row) => row.id));
    // The new assignment starts empty, with a starter rubric to sharpen.
    expect(both.assignments[0]).toMatchObject({ prompt: {}, artifactName: {} });
    expect(both.rubrics).toContain(both.assignments[0]!.rubricId);

    expect(await setCompletionMode(dbs.app.db, tenant, courseId, "work")).toEqual({
      added: { assignment: false, test: false },
      completed: 0,
    });
    expect(await setCompletionMode(dbs.app.db, tenant, courseId, "test")).toEqual({
      added: { assignment: false, test: false },
      completed: 0,
    });
    const after = await partsOf(courseId);
    expect(after.course.completionMode).toBe("test");
    expect(after.assignments.map((row) => row.id)).toEqual(both.assignments.map((row) => row.id));
    expect(after.tests.map((row) => row.id)).toEqual(before.tests.map((row) => row.id));

    // Saving the details sets the mode too, with everything else in one go.
    const details = await updateCourseSettings(dbs.app.db, tenant, courseId, {
      title: { en: "Get paid on time" },
      summary: null,
      languages: ["en"],
      estMinutes: 30,
      deliveryMode: "free_async",
      plannedLaunch: null,
      slug: "",
      completionMode: "work_and_test",
    });
    expect(details.added).toEqual({ assignment: false, test: false });
    expect((await partsOf(courseId)).course).toMatchObject({
      completionMode: "work_and_test",
      estMinutes: 30,
    });
  });

  it("gives a course from a manifest its parts once authors set it up", async () => {
    const slug = uniqueSlug("m");
    const apply = async (completion?: CompletionMode) => {
      const result = validateTenantManifest(
        testManifest(slug, {
          courses: [
            { slug: "quiz", delivery_mode: "free_async", ...(completion ? { completion } : {}) },
          ],
        }),
      );
      if (!result.ok) throw new Error(result.errors.join("\n"));
      return (await applyTenantManifest(dbs.owner.db, result.manifest)).tenantId;
    };
    const academy = (await findTenantById(dbs.app.db, await apply("test")))!;
    const shell = async () =>
      (
        await withTenant(dbs.app.db, academy.id, (tx) =>
          tx.select().from(courses).where(eq(courses.slug, "quiz")),
        )
      )[0]!;
    const { id: courseId, completionMode } = await shell();
    expect(completionMode).toBe("test");

    // The same mode again adds only what is missing: the test here.
    expect(await setCompletionMode(dbs.app.db, academy, courseId, "test")).toEqual({
      added: { assignment: false, test: true },
      completed: 0,
    });
    // Authors choose work in the Studio: the assignment their outcome page needs appears.
    expect((await setCompletionMode(dbs.app.db, academy, courseId, "work")).added).toEqual({
      assignment: true,
      test: false,
    });
    const editor = await loadCourseEditor(dbs.app.db, academy.id, courseId);
    expect(editor?.assignment).not.toBeNull();
    expect(editor?.rubric).not.toBeNull();

    // Re-applying the manifest keeps the authors' choice unless it names one.
    await apply();
    expect((await shell()).completionMode).toBe("work");
    await apply("work_and_test");
    expect((await shell()).completionMode).toBe("work_and_test");
  });

  it("saves the test, bumping its version only when something changed", async () => {
    const courseId = await newCourse("test");
    const five = [1, 2, 3, 4, 5].map(question);
    expect(
      await saveCourseTest(dbs.app.db, tenant.id, courseId, {
        questions: five,
        passPercent: 80,
        showMistakes: true,
      }),
    ).toEqual({ changed: true, version: 2 });
    // The same test again, keys in another order: no new version.
    expect(
      await saveCourseTest(dbs.app.db, tenant.id, courseId, {
        showMistakes: true,
        passPercent: 80,
        questions: five.map((item) => ({
          correct: item.correct,
          options: item.options,
          prompt: item.prompt,
          id: item.id,
        })),
      }),
    ).toEqual({ changed: false, version: 2 });
    expect(
      await saveCourseTest(dbs.app.db, tenant.id, courseId, {
        questions: five,
        passPercent: 60,
        showMistakes: false,
      }),
    ).toEqual({ changed: true, version: 3 });

    await expect(
      saveCourseTest(dbs.app.db, tenant.id, courseId, {
        questions: [{ ...question(6), correct: [] }],
        passPercent: 80,
        showMistakes: true,
      }),
    ).rejects.toThrow();
    await expect(
      saveCourseTest(dbs.app.db, tenant.id, courseId, {
        questions: five,
        passPercent: 0,
        showMistakes: true,
      }),
    ).rejects.toThrow();
    const [stored] = (await partsOf(courseId)).tests;
    expect(stored).toMatchObject({ passPercent: 60, showMistakes: false, version: 3 });
    expect(stored?.questions).toHaveLength(5);

    // A work-only course keeps a test it never had: the first save creates it.
    const workOnly = await newCourse("work");
    expect(
      await saveCourseTest(dbs.app.db, tenant.id, workOnly, {
        questions: [question(1)],
        passPercent: 80,
        showMistakes: true,
      }),
    ).toEqual({ changed: true, version: 1 });
  });

  it("publishes a test-only course with lessons and questions, and blocks one without", async () => {
    async function withLesson(courseId: string) {
      await withTenant(dbs.app.db, tenant.id, (tx) =>
        tx.insert(lessons).values({
          tenantId: tenant.id,
          courseId,
          locale: "en",
          key: "late-fees",
          position: 0,
          title: "Late fees",
          blocks: [
            { type: "markdown", markdown: "Charge interest from the day after the due date." },
          ],
        }),
      );
      return courseId;
    }

    const ready = await withLesson(await newCourse("test"));
    await saveCourseTest(dbs.app.db, tenant.id, ready, {
      questions: [1, 2, 3, 4, 5].map(question),
      passPercent: 80,
      showMistakes: true,
    });
    const published = await publishCourse(dbs.app.db, tenant.id, ready, {
      legalLinks: LEGAL,
      aiReview: true,
    });
    expect(published.errors).toEqual([]);
    expect(published.ok).toBe(true);
    // No work, so no rubric and no coverage map to check.
    expect(published.coverage).toEqual([]);
    expect((await partsOf(ready)).course.status).toBe("published");

    const empty = await withLesson(await newCourse("test"));
    const blocked = await publishCourse(dbs.app.db, tenant.id, empty, {
      legalLinks: LEGAL,
      aiReview: true,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.errors.map((issue) => issue.code)).toEqual(["no_test"]);
    expect((await partsOf(empty)).course.status).toBe("draft");
  });

  it("shows the Studio how learners do on the test", async () => {
    const courseId = await newCourse("test");
    const passedLater = await learnerIn(courseId);
    const notYet = await learnerIn(courseId);
    const notStarted = await learnerIn(courseId);
    await attempt(courseId, passedLater, 1, 3);
    await attempt(courseId, passedLater, 2, 5);
    await attempt(courseId, notYet, 1, 2);

    expect((await courseStats(dbs.app.db, tenant.id, courseId)).test).toEqual({
      attempts: 3,
      takers: 2,
      passed: 1,
    });
    const rows = new Map(
      (await courseLearners(dbs.app.db, tenant.id, courseId)).map((row) => [row.userId, row.test]),
    );
    expect(rows.get(passedLater)).toEqual({ attempts: 2, passed: true, bestPercent: 100 });
    expect(rows.get(notYet)).toEqual({ attempts: 1, passed: false, bestPercent: 40 });
    expect(rows.get(notStarted)).toBeNull();
    // A cohort's view counts only its members.
    expect(
      (await courseLearners(dbs.app.db, tenant.id, courseId, [notYet])).map((row) => row.test),
    ).toEqual([{ attempts: 1, passed: false, bestPercent: 40 }]);
  });

  it("finishes learners who already passed everything a course that asks for less needs", async () => {
    const courseId = await newCourse("work_and_test");
    const editor = await loadCourseEditor(dbs.app.db, tenant.id, courseId);
    const workDone = await learnerIn(courseId);
    const nothingYet = await learnerIn(courseId);
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.insert(submissions).values({
        tenantId: tenant.id,
        assignmentId: editor!.assignment!.id,
        userId: workDone,
        attemptNo: 1,
        status: "passed",
        extractedText: "Day 1: friendly reminder …",
        decidedAt: new Date(),
      }),
    );
    // Asking for more finishes nobody.
    expect((await setCompletionMode(dbs.app.db, tenant, courseId, "work_and_test")).completed).toBe(
      0,
    );

    expect((await setCompletionMode(dbs.app.db, tenant, courseId, "work")).completed).toBe(1);
    const issued = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .select()
        .from(credentials)
        .where(and(eq(credentials.courseId, courseId), eq(credentials.userId, workDone))),
    );
    expect(issued[0]).toMatchObject({ basis: "work", visibility: "private" });
    const unfinished = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .select()
        .from(credentials)
        .where(and(eq(credentials.courseId, courseId), eq(credentials.userId, nothingYet))),
    );
    expect(unfinished).toEqual([]);
    // Switching again does not issue twice.
    expect((await setCompletionMode(dbs.app.db, tenant, courseId, "test")).completed).toBe(0);
  });
});

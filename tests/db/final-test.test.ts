import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CompletionMode } from "@/core/courses/completion";
import type { Locale } from "@/core/i18n/locales";
import type { TestQuestion } from "@/core/questions/questions";
import type { TenantContext } from "@/core/tenant/context";
import { validateTenantManifest } from "@/core/tenant/manifest";
import {
  courses,
  courseTests,
  credentials,
  enrollments,
  events,
  notifications,
  pathCourses,
  paths,
  submissions,
  testAttempts,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { applyTenantManifest, findTenantById } from "@/db/tenants";
import type { OutgoingEmail } from "@/server/email/mailer";
import type { Enqueue } from "@/server/jobs/producer";
import { loadLearnerCourse, submitAssignment, submitTest } from "@/server/learning";
import { ensureEnrollment, ensureLearner } from "@/server/learners";
import { dispatchNotifications } from "@/server/notifications";
import { deleteMyData, exportMyData, loadMe } from "@/server/profile";
import { recordDecision } from "@/server/review/process-submission";
import { createCourse, loadCourseEditor } from "@/server/studio/courses";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  testManifest,
  uniqueSlug,
  type TestDatabases,
} from "./helpers";

const text = (en: string, de?: string) => (de ? { en, de } : { en });

/** Five questions, 80 % to pass: four right answers. q2 has two right options. */
const QUESTIONS: TestQuestion[] = [
  {
    id: "q1",
    prompt: text("When does the first reminder go out?", "Wann geht die erste Erinnerung raus?"),
    options: [
      { id: "a", text: text("A day after the due date", "Einen Tag nach Fälligkeit") },
      { id: "b", text: text("A month later", "Einen Monat später") },
    ],
    correct: ["a"],
  },
  {
    id: "q2",
    prompt: text("What belongs in every reminder?", "Was gehört in jede Erinnerung?"),
    options: [
      { id: "a", text: text("The amount", "Der Betrag") },
      { id: "b", text: text("The due date", "Das Fälligkeitsdatum") },
      { id: "c", text: text("An apology", "Eine Entschuldigung") },
    ],
    correct: ["a", "b"],
  },
  {
    id: "q3",
    prompt: text("Who gets the reminder?", "Wer bekommt die Erinnerung?"),
    options: [
      { id: "a", text: text("Everyone in the company", "Alle in der Firma") },
      { id: "b", text: text("Whoever approves payments", "Wer Zahlungen freigibt") },
    ],
    correct: ["b"],
  },
  {
    id: "q4",
    prompt: text("How friendly is the first reminder?", "Wie freundlich ist die erste Erinnerung?"),
    options: [
      { id: "a", text: text("Friendly", "Freundlich") },
      { id: "b", text: text("Threatening", "Drohend") },
    ],
    correct: ["a"],
  },
  {
    // English only: German learners get the academy's default language.
    id: "q5",
    prompt: text("When do you call instead?"),
    options: [
      { id: "a", text: text("Never") },
      { id: "b", text: text("Before the first reminder") },
      { id: "c", text: text("After the second reminder") },
    ],
    correct: ["c"],
  },
];

const ALL_RIGHT = { q1: ["a"], q2: ["a", "b"], q3: ["b"], q4: ["a"], q5: ["c"] };

/** Form fields as the test page sends them: one `answer.<question>` per chosen option. */
function form(answers: Record<string, string[]>): Array<[string, string]> {
  return Object.entries(answers).flatMap(([question, ids]) =>
    ids.map((id): [string, string] => [`answer.${question}`, id]),
  );
}

describe.skipIf(!hasDatabase)("the final test for learners", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let pathId: string;
  const sent: OutgoingEmail[] = [];
  const enqueue: Enqueue = async () => undefined;

  beforeAll(async () => {
    dbs = await openTestDatabases();
    const manifest = testManifest(uniqueSlug("final"), {
      paths: [{ title: "Builder" }],
      levels: [{ n: 1, name: "Apprentice", rule: "courses_completed_in_path >= 1" }],
    });
    manifest.tenant.features = { paths: true, levels: true };
    const validated = validateTenantManifest(manifest);
    if (!validated.ok) throw new Error(validated.errors.join("\n"));
    const { tenantId } = await applyTenantManifest(dbs.owner.db, validated.manifest);
    tenant = (await findTenantById(dbs.app.db, tenantId))!;
    const [path] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select({ id: paths.id }).from(paths).where(eq(paths.slug, "builder")),
    );
    pathId = path!.id;
  });

  afterAll(async () => {
    await dbs?.close();
  });

  /** A published course in the Builder path; the test is stored whatever the mode. */
  async function course(
    mode: CompletionMode,
    options: { questions?: TestQuestion[]; showMistakes?: boolean } = {},
  ) {
    const courseId = await createCourse(dbs.app.db, tenant.id, {
      languages: ["en", "de"],
      title: `Get paid on time ${uniqueSlug("c")}`,
      artifactName: "Reminder playbook",
      outcome: "Write the reminder sequence you will use for late invoices.",
      deliveryMode: "free_async",
    });
    return withTenant(dbs.app.db, tenant.id, async (tx) => {
      const [row] = await tx
        .update(courses)
        .set({ completionMode: mode, status: "published", publishedAt: new Date() })
        .where(eq(courses.id, courseId))
        .returning({ slug: courses.slug });
      await tx.insert(courseTests).values({
        tenantId: tenant.id,
        courseId,
        questions: options.questions ?? QUESTIONS,
        passPercent: 80,
        showMistakes: options.showMistakes ?? true,
      });
      await tx.insert(pathCourses).values({ tenantId: tenant.id, pathId, courseId, position: 0 });
      return { courseId, slug: row!.slug };
    });
  }

  async function learnerIn(slug: string, locale: Locale = "en") {
    const userId = await createUser(dbs.owner.db);
    const entry = { path: "builder", utm: { source: "newsletter" } };
    await withTenant(dbs.app.db, tenant.id, async (tx) => {
      await ensureLearner(tx, tenant, userId, { locale, entry });
      await ensureEnrollment(tx, tenant, userId, { courseSlug: slug, locale, entry });
    });
    return userId;
  }

  const attemptsOf = (userId: string) =>
    withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(testAttempts).where(eq(testAttempts.userId, userId)),
    );

  const credentialOf = async (userId: string) =>
    (
      await withTenant(dbs.app.db, tenant.id, (tx) =>
        tx.select().from(credentials).where(eq(credentials.userId, userId)),
      )
    )[0];

  /** A released pass of the learner's work, as the review job records it. */
  async function passWork(userId: string, courseId: string) {
    const editor = await loadCourseEditor(dbs.app.db, tenant.id, courseId);
    return withTenant(dbs.app.db, tenant.id, async (tx) => {
      const [submission] = await tx
        .insert(submissions)
        .values({
          tenantId: tenant.id,
          assignmentId: editor!.assignment!.id,
          userId,
          attemptNo: 1,
          status: "passed",
          extractedText: "Day 1: friendly reminder …",
          decidedAt: new Date(),
        })
        .returning({ id: submissions.id });
      await recordDecision(tx, tenant, {
        userId,
        courseId,
        submissionId: submission!.id,
        pass: true,
        locale: "en",
      });
      return submission!.id;
    });
  }

  it("grades attempts, numbers them and issues a test-only credential with its level", async () => {
    const { courseId, slug } = await course("test");
    const learner = await learnerIn(slug);
    const submit = (entries: Array<[string, string]>, version?: number) =>
      submitTest(dbs.app.db, tenant, learner, slug, { entries, version });

    // A test is handed in complete, and against the version the learner saw.
    expect(await submit(form({ q1: ["a"] }))).toEqual({
      ok: false,
      error: "unanswered",
      unanswered: ["q2", "q3", "q4", "q5"],
    });
    expect(await submit(form(ALL_RIGHT), 7)).toEqual({ ok: false, error: "changed" });
    expect(await attemptsOf(learner)).toEqual([]);

    // Three of five: q2 needs both right options, q5 is wrong.
    const first = await submit(form({ ...ALL_RIGHT, q2: ["a"], q5: ["a"] }), 1);
    expect(first).toEqual({
      ok: true,
      attemptNo: 1,
      correct: 3,
      total: 5,
      percent: 60,
      passed: false,
      passPercent: 80,
      wrong: ["q2", "q5"],
      completion: null,
    });
    expect(await credentialOf(learner)).toBeUndefined();

    // Unknown questions and options from a tampered form do not count.
    const second = await submit([
      ...form({ ...ALL_RIGHT, q5: ["a"] }),
      ["answer.q1", "zzz"],
      ["answer.q9", "a"],
    ]);
    expect(second).toMatchObject({ ok: true, attemptNo: 2, correct: 4, percent: 80, passed: true });
    const completion = second.ok ? second.completion : null;
    expect(completion).toMatchObject({ issued: true, levelUp: { n: 1 } });

    // Nothing follows a pass.
    expect(await submit(form(ALL_RIGHT))).toEqual({ ok: false, error: "passed" });

    const attempts = (await attemptsOf(learner)).sort((a, b) => a.attemptNo - b.attemptNo);
    expect(
      attempts.map((row) => [row.attemptNo, row.correct, row.total, row.passed, row.testVersion]),
    ).toEqual([
      [1, 3, 5, false, 1],
      [2, 4, 5, true, 1],
    ]);
    expect(attempts[1]).toMatchObject({
      locale: "en",
      answers: { q1: ["a"], q2: ["a", "b"], q3: ["b"], q4: ["a"], q5: ["a"] },
    });

    expect(await credentialOf(learner)).toMatchObject({
      publicId: completion && completion.issued ? completion.publicId : "",
      basis: "test",
      artifactName: null,
      submissionId: null,
      testAttemptId: attempts[1]!.id,
      visibility: "private",
      levelAtIssue: 1,
    });

    const tracked = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .select()
        .from(events)
        .where(and(eq(events.userId, learner), eq(events.courseId, courseId))),
    );
    const named = (name: string) => tracked.filter((event) => event.name === name);
    expect(named("test_submitted").map((event) => event.props)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ attempt: 1, percent: 60, passed: false }),
        expect.objectContaining({ attempt: 2, percent: 80, passed: true }),
      ]),
    );
    expect(named("test_submitted")).toHaveLength(2);
    expect(named("test_passed").map((event) => event.props)).toEqual([
      expect.objectContaining({ attempt: 2 }),
    ]);
    // With the enrollment's path, locale and entry context, like a hand-in.
    expect(named("test_passed")[0]).toMatchObject({
      pathId,
      locale: "en",
      utm: { source: "newsletter" },
    });
    expect(named("course_completed")).toHaveLength(1);
    expect(named("level_up")).toHaveLength(1);

    // The level reached gets its own mail: no review mail carries it.
    await dispatchNotifications(dbs.app.db, tenant, {
      send: async (mail) => {
        sent.push(mail);
      },
    });
    const [mail] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(notifications).where(eq(notifications.userId, learner)),
    );
    expect(mail).toMatchObject({ kind: "level_up", payload: { pathId, level: 1 }, status: "sent" });
    expect(sent.at(-1)?.text).toContain("You reached the level “Apprentice” in Builder.");
    // It leads to the credential that brought the level, where sharing it starts.
    expect(sent.at(-1)?.html).toContain(
      `/verify/${completion && completion.issued ? completion.publicId : ""}#share`,
    );
  });

  it("gives learners the questions without the answer key, in their language", async () => {
    const { slug } = await course("test");
    const learner = await learnerIn(slug, "de");
    await submitTest(dbs.app.db, tenant, learner, slug, {
      entries: form({ ...ALL_RIGHT, q1: ["b"], q3: ["a"] }),
    });

    const data = await loadLearnerCourse(dbs.app.db, tenant, slug, learner, "de");
    expect(data?.completionMode).toBe("test");
    expect(JSON.stringify(data)).not.toMatch(/"correct":\[/);
    expect(data?.test).toMatchObject({
      version: 1,
      passPercent: 80,
      showMistakes: true,
      attempts: { count: 1, latest: { attemptNo: 1, percent: 60, passed: false }, passed: null },
    });
    expect(data?.test?.questions[1]).toEqual({
      id: "q2",
      prompt: "Was gehört in jede Erinnerung?",
      options: [
        { id: "a", text: "Der Betrag" },
        { id: "b", text: "Das Fälligkeitsdatum" },
        { id: "c", text: "Eine Entschuldigung" },
      ],
      several: true,
    });
    expect(data?.test?.questions[4]).toMatchObject({
      prompt: "When do you call instead?",
      several: false,
    });

    // Visitors see the test too, without anyone's attempts.
    const visitor = await loadLearnerCourse(dbs.app.db, tenant, slug, null, "en");
    expect(JSON.stringify(visitor)).not.toMatch(/"correct":\[/);
    expect(visitor?.test?.attempts).toEqual({ count: 0, latest: null, best: null, passed: null });
  });

  it("keeps mistakes to itself when the authors say so", async () => {
    const { slug } = await course("test", { showMistakes: false });
    const learner = await learnerIn(slug);
    expect(
      await submitTest(dbs.app.db, tenant, learner, slug, {
        entries: form({ ...ALL_RIGHT, q4: ["b"], q5: ["b"] }),
      }),
    ).toMatchObject({ ok: true, passed: false, percent: 60, wrong: null });
  });

  it("refuses courses without a test to take", async () => {
    const hidden = await course("test");
    const workOnly = await course("work");
    const empty = await course("test", { questions: [] });
    const answers = { entries: form(ALL_RIGHT) };

    // Enrolled before the course was taken offline.
    const inHidden = await learnerIn(hidden.slug);
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.update(courses).set({ status: "unpublished" }).where(eq(courses.id, hidden.courseId)),
    );
    expect(await submitTest(dbs.app.db, tenant, inHidden, hidden.slug, answers)).toEqual({
      ok: false,
      error: "not_enrolled",
    });

    // A work-only course keeps a test it had, but nobody takes it.
    const inWorkOnly = await learnerIn(workOnly.slug);
    expect(await submitTest(dbs.app.db, tenant, inWorkOnly, workOnly.slug, answers)).toEqual({
      ok: false,
      error: "no_test",
    });
    expect(
      (await loadLearnerCourse(dbs.app.db, tenant, workOnly.slug, inWorkOnly, "en"))?.test,
    ).toBeNull();

    const inEmpty = await learnerIn(empty.slug);
    expect(await submitTest(dbs.app.db, tenant, inEmpty, empty.slug, answers)).toEqual({
      ok: false,
      error: "no_test",
    });

    const stranger = await createUser(dbs.owner.db);
    expect(await submitTest(dbs.app.db, tenant, stranger, empty.slug, answers)).toEqual({
      ok: false,
      error: "not_enrolled",
    });
    expect([
      ...(await attemptsOf(inHidden)),
      ...(await attemptsOf(inWorkOnly)),
      ...(await attemptsOf(inEmpty)),
    ]).toEqual([]);
  });

  it("takes no work for a course that ends with a test alone", async () => {
    const testOnly = await course("test");
    const both = await course("work_and_test");
    const handIn = { text: "Day 1: friendly reminder …" };

    const inTestOnly = await learnerIn(testOnly.slug);
    expect(
      await submitAssignment(dbs.app.db, tenant, inTestOnly, testOnly.slug, handIn, enqueue),
    ).toEqual({ ok: false, error: "not_allowed" });
    const inBoth = await learnerIn(both.slug);
    expect(
      await submitAssignment(dbs.app.db, tenant, inBoth, both.slug, handIn, enqueue),
    ).toMatchObject({ ok: true, attemptNo: 1 });
  });

  it("holds the credential of a work-and-test course until the work passes too", async () => {
    const { courseId, slug } = await course("work_and_test");
    const learner = await learnerIn(slug);

    const passed = await submitTest(dbs.app.db, tenant, learner, slug, {
      entries: form(ALL_RIGHT),
    });
    expect(passed).toMatchObject({
      ok: true,
      passed: true,
      percent: 100,
      wrong: [],
      completion: { issued: false, missing: ["work"] },
    });
    expect(await credentialOf(learner)).toBeUndefined();
    const waiting = await loadLearnerCourse(dbs.app.db, tenant, slug, learner, "en");
    expect(waiting).toMatchObject({ completionMode: "work_and_test", workPassed: false });
    expect(waiting?.test?.attempts.passed).toMatchObject({ attemptNo: 1, percent: 100 });
    expect((await loadMe(dbs.app.db, tenant, learner)).courses[0]?.next).toEqual({
      kind: "work",
    });

    const submissionId = await passWork(learner, courseId);
    const [attempt] = await attemptsOf(learner);
    expect(await credentialOf(learner)).toMatchObject({
      basis: "work_and_test",
      artifactName: { en: "Reminder playbook" },
      submissionId,
      testAttemptId: attempt!.id,
    });
    const done = await loadLearnerCourse(dbs.app.db, tenant, slug, learner, "en");
    expect(done).toMatchObject({ workPassed: true, credential: { visibility: "private" } });
  });

  it("does not rewrite a credential earned before the course asked for a test", async () => {
    const { courseId, slug } = await course("work");
    const learner = await learnerIn(slug);
    await passWork(learner, courseId);
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.update(courses).set({ completionMode: "work_and_test" }).where(eq(courses.id, courseId)),
    );
    expect(
      await submitTest(dbs.app.db, tenant, learner, slug, { entries: form(ALL_RIGHT) }),
    ).toEqual({ ok: false, error: "completed" });
    expect(await credentialOf(learner)).toMatchObject({ basis: "work", testAttemptId: null });
  });

  it("queues a learner's hand-ins, so attempt numbers never collide", async () => {
    const { slug } = await course("test");
    const learner = await learnerIn(slug);
    const failing = { entries: form({ ...ALL_RIGHT, q1: ["b"], q2: ["c"] }) };

    // Another hand-in of the same learner is still being graded and holds their enrollment.
    let release = () => {};
    const holding = withTenant(dbs.app.db, tenant.id, async (tx) => {
      await tx
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(eq(enrollments.userId, learner))
        .for("update");
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    let finished = false;
    const waiting = submitTest(dbs.app.db, tenant, learner, slug, failing).finally(() => {
      finished = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(finished).toBe(false);
    release();
    await holding;
    expect(await waiting).toMatchObject({ ok: true, attemptNo: 1 });

    // Two at once: one waits for the other and takes the next number.
    const results = await Promise.all([
      submitTest(dbs.app.db, tenant, learner, slug, failing),
      submitTest(dbs.app.db, tenant, learner, slug, failing),
    ]);
    expect(results.map((result) => (result.ok ? result.attemptNo : 0)).sort()).toEqual([2, 3]);
    expect((await loadMe(dbs.app.db, tenant, learner)).courses[0]?.next).toEqual({
      kind: "test",
      retake: true,
    });
  });

  it("exports the learner's attempts and deletes them with their data", async () => {
    const { slug } = await course("test");
    const learner = await learnerIn(slug);
    await submitTest(dbs.app.db, tenant, learner, slug, {
      entries: form({ ...ALL_RIGHT, q5: ["b"] }),
    });

    const exported = await exportMyData(dbs.app.db, tenant, learner);
    expect(exported.testAttempts).toEqual([
      {
        course: slug,
        attempt: 1,
        takenAt: expect.any(Date),
        locale: "en",
        correct: 4,
        total: 5,
        percent: 80,
        passed: true,
        answers: { ...ALL_RIGHT, q5: ["b"] },
      },
    ]);

    // Another academy knows the learner, so the account stays: the attempts here go anyway.
    const otherId = await createTenant(dbs.owner.db);
    const other = (await findTenantById(dbs.app.db, otherId))!;
    await withTenant(dbs.app.db, other.id, (tx) =>
      ensureLearner(tx, other, learner, { locale: "en", entry: {} }),
    );
    expect(await deleteMyData(dbs.app.db, tenant, learner)).toEqual({ accountDeleted: false });
    expect(await attemptsOf(learner)).toEqual([]);
  });
});

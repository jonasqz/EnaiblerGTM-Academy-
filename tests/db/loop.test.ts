import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { rubricSchema } from "@/core/review/rubric";
import { validateTenantManifest } from "@/core/tenant/manifest";
import type { TenantContext } from "@/core/tenant/context";
import { credentials, enrollments, events, memberships, submissions, user } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { applyTenantManifest, findTenantById } from "@/db/tenants";
import type { Enqueue } from "@/server/jobs/producer";
import { completeLesson, loadLearnerCourse, submitAssignment } from "@/server/learning";
import { ensureEnrollment, ensureLearner } from "@/server/learners";
import type { LlmCaller } from "@/server/llm";
import { deleteMyData, exportMyData, setContactOptIn, setDisplayName } from "@/server/profile";
import { processSubmission } from "@/server/review/process-submission";
import {
  createCourse,
  listCourses,
  loadCourseEditor,
  publishCourse,
  updateOutcome,
} from "@/server/studio/courses";
import { courseLearners, courseStats, listPeople, studioOverview } from "@/server/studio/insights";
import {
  createLesson,
  loadLessonEditor,
  restoreLessonVersion,
  updateLesson,
} from "@/server/studio/lessons";
import { countHeldSubmissions, decideSubmission, listReviewQueue } from "@/server/studio/reviews";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  testManifest,
  uniqueSlug,
  type TestDatabases,
} from "./helpers";

function fakeLlm(score: number): LlmCaller {
  return async () => ({
    content: JSON.stringify({
      criteria: ["complete", "evidence", "clarity"].map((id) => ({
        criterion_id: id,
        score,
        evidence: [],
        improvement: "Tighten the conclusion.",
      })),
      summary: score >= 2 ? "Strong brief." : "Needs evidence.",
    }),
    model: "fake-model",
    tokensIn: 1200,
    tokensOut: 300,
    cost: 0.004,
    latencyMs: 3,
  });
}

describe.skipIf(!hasDatabase)("core loop: create → learn → submit → review → credential", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let courseId: string;
  let learner: string;
  const author = { id: "" };
  const jobs: Array<{ name: string; data: unknown; id?: string }> = [];
  const enqueue: Enqueue = async (_tx, name, data, options) => {
    jobs.push({ name, data, id: options?.id });
  };

  beforeAll(async () => {
    dbs = await openTestDatabases();
    const manifest = testManifest(uniqueSlug("loop"), {
      paths: [{ title: "Builder" }],
      levels: [{ n: 1, name: "Apprentice", rule: "courses_completed_in_path >= 1" }],
    });
    manifest.tenant.features = { paths: true, levels: true };
    const validated = validateTenantManifest(manifest);
    if (!validated.ok) throw new Error(validated.errors.join("\n"));
    const { tenantId } = await applyTenantManifest(dbs.owner.db, validated.manifest);
    tenant = (await findTenantById(dbs.app.db, tenantId))!;
    author.id = await createUser(dbs.owner.db);
    learner = await createUser(dbs.owner.db);
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("creates a course outcome-first and refuses to publish it empty", async () => {
    courseId = await createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: "Validation Lab",
      artifactName: "Validated idea brief",
      outcome: "Write a one-page brief backed by five interviews.",
      deliveryMode: "free_async",
    });
    const editor = await loadCourseEditor(dbs.app.db, tenant.id, courseId);
    expect(editor?.course.status).toBe("draft");
    expect(editor?.course.slug).toBe("validation-lab");
    expect(editor?.rubric?.definition.criteria.map((c) => c.id)).toEqual([
      "complete",
      "evidence",
      "clarity",
    ]);

    const check = await publishCourse(dbs.app.db, tenant.id, courseId);
    expect(check.ok).toBe(false);
    expect(check.errors.map((e) => e.code)).toContain("no_lessons");

    // Saving an unchanged rubric keeps its version (jsonb reorders keys); a change bumps it.
    const outcome = {
      prompt: editor!.assignment!.prompt,
      artifactName: editor!.assignment!.artifactName,
      submissionTypes: editor!.assignment!.submissionTypes,
      rubric: rubricSchema.parse(editor!.rubric!.definition),
    };
    await updateOutcome(dbs.app.db, tenant.id, courseId, outcome);
    expect((await loadCourseEditor(dbs.app.db, tenant.id, courseId))?.rubric?.version).toBe(1);
    await updateOutcome(dbs.app.db, tenant.id, courseId, {
      ...outcome,
      rubric: { ...outcome.rubric, pass_threshold: 65 },
    });
    expect((await loadCourseEditor(dbs.app.db, tenant.id, courseId))?.rubric?.version).toBe(2);
    await updateOutcome(dbs.app.db, tenant.id, courseId, outcome);
  });

  it("adds lessons with versions and publishes", async () => {
    const lessonId = await createLesson(dbs.app.db, tenant.id, courseId, {
      locale: "en",
      title: "Why ideas fail",
      userId: author.id,
    });
    const saved = await updateLesson(dbs.app.db, tenant.id, lessonId, {
      title: "Why ideas fail",
      markdown: "Most ideas die from **no customers**.",
      criterionIds: ["complete", "evidence", "clarity"],
      userId: author.id,
    });
    expect(saved).toEqual({ version: 2, changed: true });
    expect(
      await updateLesson(dbs.app.db, tenant.id, lessonId, {
        title: "Why ideas fail",
        markdown: "Most ideas die from **no customers**.",
        criterionIds: ["clarity", "evidence", "complete"],
        userId: author.id,
      }),
    ).toEqual({ version: 2, changed: false });

    // Restoring copies an old version forward; history is never rewritten.
    expect(await restoreLessonVersion(dbs.app.db, tenant.id, lessonId, 1, author.id)).toEqual({
      version: 3,
      changed: true,
    });
    expect(await restoreLessonVersion(dbs.app.db, tenant.id, lessonId, 2, author.id)).toEqual({
      version: 4,
      changed: true,
    });
    const edited = await loadLessonEditor(dbs.app.db, tenant.id, lessonId);
    expect(edited?.versions.map((row) => row.version)).toEqual([4, 3, 2, 1]);
    expect(edited?.lesson.criterionIds).toEqual(["complete", "evidence", "clarity"]);

    // A translation shares the key and the criteria, but starts without text.
    const translationId = await createLesson(dbs.app.db, tenant.id, courseId, {
      locale: "de",
      title: "Warum Ideen scheitern",
      translationOf: edited!.lesson.key,
      userId: author.id,
    });
    const translation = await loadLessonEditor(dbs.app.db, tenant.id, translationId);
    expect(translation?.lesson).toMatchObject({
      key: edited!.lesson.key,
      criterionIds: ["complete", "evidence", "clarity"],
    });
    expect(translation?.translations.map((row) => row.locale).sort()).toEqual(["de", "en"]);

    await createLesson(dbs.app.db, tenant.id, courseId, {
      locale: "en",
      title: "Interviews",
      userId: author.id,
    });

    const check = await publishCourse(dbs.app.db, tenant.id, courseId);
    expect(check.ok).toBe(true);
    const [row] = await listCourses(dbs.app.db, tenant.id);
    expect(row).toMatchObject({ status: "published", version: 1, lessons: 2 });
  });

  it("walks a learner from entry to submission", async () => {
    await withTenant(dbs.app.db, tenant.id, async (tx) => {
      // Put the course on the Builder path so the level rule can fire.
      await tx.execute(
        (await import("drizzle-orm"))
          .sql`insert into path_courses (tenant_id, path_id, course_id, position)
          select ${tenant.id}, p.id, ${courseId}, 0 from paths p where p.slug = 'builder'`,
      );
      const entry = { course: "validation-lab", path: "builder", utm: { source: "newsletter" } };
      await ensureLearner(tx, tenant, learner, { locale: "en", entry });
      expect(
        await ensureEnrollment(tx, tenant, learner, {
          courseSlug: "validation-lab",
          locale: "en",
          entry,
        }),
      ).toMatchObject({
        created: true,
      });
    });

    expect(
      await completeLesson(dbs.app.db, tenant, learner, {
        courseSlug: "validation-lab",
        key: "why-ideas-fail",
      }),
    ).toEqual({
      nextKey: "interviews",
    });

    const empty = await submitAssignment(
      dbs.app.db,
      tenant,
      learner,
      "validation-lab",
      {},
      enqueue,
    );
    expect(empty).toEqual({ ok: false, error: "empty" });

    const first = await submitAssignment(
      dbs.app.db,
      tenant,
      learner,
      "validation-lab",
      { text: "# Brief\nFreelancers lose four hours a month chasing invoices." },
      enqueue,
    );
    expect(first).toMatchObject({ ok: true, attemptNo: 1 });
    expect(jobs.at(-1)).toMatchObject({
      name: "review.run",
      id: first.ok ? first.submissionId : "",
    });

    const again = await submitAssignment(
      dbs.app.db,
      tenant,
      learner,
      "validation-lab",
      { text: "x" },
      enqueue,
    );
    expect(again).toEqual({ ok: false, error: "not_allowed" });
  });

  it("releases an AI pass, issues a private credential and levels up", async () => {
    const [submission] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(submissions),
    );
    const outcome = await processSubmission(
      dbs.app.db,
      { tenantId: tenant.id, submissionId: submission!.id },
      { llm: fakeLlm(3), model: "fake-model" },
    );
    // The first passes of a course are released but spot-checked (brief §8).
    expect(outcome).toEqual({
      status: "released",
      pass: true,
      percent: 100,
      audit: "initial_phase",
    });

    // Running the job again is harmless.
    expect(
      await processSubmission(
        dbs.app.db,
        { tenantId: tenant.id, submissionId: submission!.id },
        { llm: fakeLlm(0), model: "m" },
      ),
    ).toEqual({ status: "skipped" });

    const state = await withTenant(dbs.app.db, tenant.id, async (tx) => ({
      credential: (await tx.select().from(credentials))[0],
      enrollment: (await tx.select().from(enrollments))[0],
      eventNames: (await tx.select({ name: events.name }).from(events)).map((e) => e.name),
    }));
    expect(state.credential).toMatchObject({
      visibility: "private",
      levelAtIssue: 1,
      artifactName: "Validated idea brief",
    });
    expect(state.enrollment?.completedAt).not.toBeNull();
    expect(state.eventNames).toEqual(
      expect.arrayContaining([
        "assignment_submitted",
        "review_completed",
        "review_passed",
        "course_completed",
        "level_up",
      ]),
    );

    const course = await loadLearnerCourse(dbs.app.db, tenant, "validation-lab", learner, "en");
    expect(course?.attempts[0]).toMatchObject({ outcome: "passed", feedback: { reviewer: "ai" } });
  });

  it("lets a reviewer override a spot-checked pass, which revokes the credential", async () => {
    const queue = await listReviewQueue(dbs.app.db, tenant.id);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      kind: "spot_check",
      ai: { pass: true, audit: "initial_phase" },
    });

    const scores = { complete: 1, evidence: 0, clarity: 1 };
    const withoutReason = await decideSubmission(
      dbs.app.db,
      tenant,
      author.id,
      queue[0]!.submissionId,
      {
        scores,
        feedback: {},
        summary: "Evidence is missing.",
        reason: null,
      },
    );
    expect(withoutReason).toEqual({ ok: false, error: "reason_required" });

    const decided = await decideSubmission(dbs.app.db, tenant, author.id, queue[0]!.submissionId, {
      scores,
      feedback: { evidence: "Quote the interviews." },
      summary: "Evidence is missing.",
      reason: "No interview evidence at all.",
    });
    expect(decided).toEqual({ ok: true, pass: false, overridden: true });

    const after = await withTenant(dbs.app.db, tenant.id, async (tx) => ({
      submission: (await tx.select().from(submissions))[0],
      credential: (await tx.select().from(credentials))[0],
    }));
    expect(after.submission?.status).toBe("overridden");
    expect(after.credential?.revokedAt).not.toBeNull();
    expect(await listReviewQueue(dbs.app.db, tenant.id)).toEqual([]);

    const course = await loadLearnerCourse(dbs.app.db, tenant, "validation-lab", learner, "en");
    expect(course?.attempts[0]).toMatchObject({
      outcome: "needs_revision",
      feedback: { reviewer: "human" },
    });
  });

  it("falls back to a human when no AI is available, then re-issues the credential", async () => {
    const second = await submitAssignment(
      dbs.app.db,
      tenant,
      learner,
      "validation-lab",
      { text: "v2 with quotes" },
      enqueue,
    );
    expect(second).toMatchObject({ ok: true, attemptNo: 2 });
    const held = await processSubmission(
      dbs.app.db,
      { tenantId: tenant.id, submissionId: second.ok ? second.submissionId : "" },
      { llm: null, model: "m" },
    );
    expect(held).toEqual({ status: "held", reasons: ["ai_unavailable"] });

    const queue = await listReviewQueue(dbs.app.db, tenant.id);
    expect(queue).toMatchObject([{ kind: "decide", ai: null, attemptNo: 2 }]);
    expect(await countHeldSubmissions(dbs.app.db, tenant.id)).toBe(1);
    expect(
      await decideSubmission(dbs.app.db, tenant, author.id, queue[0]!.submissionId, {
        scores: { complete: 3, evidence: 3, clarity: 2 },
        feedback: {},
        summary: "Now backed by interviews.",
        reason: null,
      }),
    ).toEqual({ ok: true, pass: true, overridden: false });

    const [credential] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(credentials),
    );
    expect(credential?.revokedAt).toBeNull();
  });

  it("shows the Studio who is learning, pseudonymously unless they opted in", async () => {
    // Team members who also signed in as learners are neither counted nor listed as learners.
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.insert(memberships).values([
        { tenantId: tenant.id, userId: author.id, role: "author" },
        { tenantId: tenant.id, userId: author.id, role: "learner" },
      ]),
    );
    expect((await listPeople(dbs.app.db, tenant.id)).map((person) => person.userId)).toEqual([
      learner,
    ]);

    const overview = await studioOverview(dbs.app.db, tenant.id);
    expect(overview).toMatchObject({
      learners: 1,
      enrollments: 1,
      completions: 1,
      credentials: 1,
      pendingReviews: 0,
    });
    expect(overview.funnel.find((step) => step.key === "submit")?.count).toBe(2);

    const [row] = await courseLearners(dbs.app.db, tenant.id, courseId);
    expect(row).toMatchObject({
      progress: { done: 1, total: 2, percent: 50 },
      latestSubmission: { attemptNo: 2, status: "passed" },
      contactEmail: null,
    });
    expect(row?.alias).toMatch(/^L-/);

    await setDisplayName(dbs.app.db, tenant, learner, "Ada Lovelace");
    await setContactOptIn(dbs.app.db, tenant, learner, true, "The academy may contact me.");
    const [person] = await listPeople(dbs.app.db, tenant.id);
    const [account] = await dbs.app.db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, learner));
    expect(person).toMatchObject({
      displayName: "Ada Lovelace",
      completed: 1,
      credentials: 1,
      contactEmail: account!.email,
    });
    const [credential] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(credentials),
    );
    expect(credential?.displayName).toBe("Ada Lovelace");

    await setContactOptIn(dbs.app.db, tenant, learner, false, "");
    expect((await listPeople(dbs.app.db, tenant.id))[0]?.contactEmail).toBeNull();

    // Attempt 1: the AI passed, the reviewer disagreed. Attempt 2 had no AI review.
    expect(await courseStats(dbs.app.db, tenant.id, courseId)).toMatchObject({
      enrolled: 1,
      completed: 1,
      submissions: 2,
      pendingReviews: 0,
      credentials: 1,
      aiReviews: 1,
      agreement: { rate: 0, sample: 1 },
    });
  });

  it("exports and deletes the learner's data; the account goes when no academy is left", async () => {
    const exported = await exportMyData(dbs.app.db, tenant, learner);
    expect(exported.submissions).toHaveLength(2);
    expect(exported.credentials).toHaveLength(1);
    expect(exported.reviews.length).toBeGreaterThanOrEqual(3);

    // A second academy knows the same person: deleting here keeps the account.
    const otherId = await createTenant(dbs.owner.db);
    const other = (await findTenantById(dbs.app.db, otherId))!;
    await withTenant(dbs.app.db, other.id, (tx) =>
      ensureLearner(tx, other, learner, { locale: "en", entry: {} }),
    );

    expect(await deleteMyData(dbs.app.db, tenant, learner)).toEqual({ accountDeleted: false });
    const left = await withTenant(dbs.app.db, tenant.id, async (tx) => ({
      submissions: await tx.select().from(submissions).where(eq(submissions.userId, learner)),
      credentials: await tx.select().from(credentials).where(eq(credentials.userId, learner)),
      events: await tx
        .select()
        .from(events)
        .where(and(eq(events.userId, learner))),
    }));
    expect(left).toEqual({ submissions: [], credentials: [], events: [] });

    expect(await deleteMyData(dbs.app.db, other, learner)).toEqual({ accountDeleted: true });
    expect(await dbs.app.db.select().from(user).where(eq(user.id, learner))).toEqual([]);
  });
});

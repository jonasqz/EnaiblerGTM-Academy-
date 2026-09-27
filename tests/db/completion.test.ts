import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CompletionMode } from "@/core/courses/completion";
import type { TenantContext } from "@/core/tenant/context";
import {
  aiUsage,
  courses,
  credentials,
  enrollments,
  notifications,
  submissions,
  testAttempts,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import { meteredLlm, recordAiUsage } from "@/server/ai-usage";
import { completeCourse } from "@/server/courses/completion";
import { revokeCredential } from "@/server/credentials/issue";
import type { LlmCaller } from "@/server/llm";
import { recordDecision } from "@/server/review/process-submission";
import { createCourse, loadCourseEditor } from "@/server/studio/courses";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

describe.skipIf(!hasDatabase)("completing a course: work, final test or both", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;

  beforeAll(async () => {
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
  });

  afterAll(async () => {
    await dbs?.close();
  });

  async function course(mode: CompletionMode) {
    const courseId = await createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: `Get paid on time (${mode})`,
      artifactName: "Reminder playbook",
      outcome: "Write the reminder sequence you will use for late invoices.",
      deliveryMode: "free_async",
    });
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.update(courses).set({ completionMode: mode }).where(eq(courses.id, courseId)),
    );
    return courseId;
  }

  async function learnerIn(courseId: string) {
    const userId = await createUser(dbs.owner.db);
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.insert(enrollments).values({ tenantId: tenant.id, userId, courseId, locale: "en" }),
    );
    return userId;
  }

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

  async function passTest(userId: string, courseId: string, attemptNo = 1) {
    return withTenant(dbs.app.db, tenant.id, async (tx) => {
      const [attempt] = await tx
        .insert(testAttempts)
        .values({
          tenantId: tenant.id,
          courseId,
          userId,
          attemptNo,
          testVersion: 1,
          locale: "en",
          answers: { q1: ["a"] },
          correct: 1,
          total: 1,
          passed: true,
        })
        .returning({ id: testAttempts.id });
      const result = await completeCourse(tx, tenant, { userId, courseId });
      return { attemptId: attempt!.id, result };
    });
  }

  const credentialOf = async (userId: string, courseId: string) =>
    (
      await withTenant(dbs.app.db, tenant.id, (tx) =>
        tx
          .select()
          .from(credentials)
          .where(and(eq(credentials.userId, userId), eq(credentials.courseId, courseId))),
      )
    )[0];

  it("keeps the credential of a work-and-test course until both are passed, in either order", async () => {
    const courseId = await course("work_and_test");

    const workFirst = await learnerIn(courseId);
    const submissionId = await passWork(workFirst, courseId);
    expect(await credentialOf(workFirst, courseId)).toBeUndefined();
    // The review mail says what is left instead of promising a credential.
    const [mail] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(notifications).where(eq(notifications.userId, workFirst)),
    );
    expect(mail?.payload).toMatchObject({ submissionId, testPending: true });
    const { attemptId, result } = await passTest(workFirst, courseId);
    expect(result.issued).toBe(true);
    expect(await credentialOf(workFirst, courseId)).toMatchObject({
      basis: "work_and_test",
      artifactName: { en: "Reminder playbook" },
      submissionId,
      testAttemptId: attemptId,
      visibility: "private",
    });

    const testFirst = await learnerIn(courseId);
    const early = await passTest(testFirst, courseId);
    expect(early.result).toEqual({ issued: false, missing: ["work"] });
    await passWork(testFirst, courseId);
    expect(await credentialOf(testFirst, courseId)).toMatchObject({
      basis: "work_and_test",
      testAttemptId: early.attemptId,
    });
  });

  it("issues a test-only course's credential without naming any work", async () => {
    const courseId = await course("test");
    const userId = await learnerIn(courseId);
    const { attemptId, result } = await passTest(userId, courseId);
    expect(result.issued).toBe(true);
    expect(await credentialOf(userId, courseId)).toMatchObject({
      basis: "test",
      artifactName: null,
      submissionId: null,
      testAttemptId: attemptId,
    });
    const [enrollment] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(enrollments).where(eq(enrollments.userId, userId)),
    );
    expect(enrollment?.completedAt).not.toBeNull();
  });

  it("does not let a test stand in for the work of a work-only course", async () => {
    const courseId = await course("work");
    const userId = await learnerIn(courseId);
    expect((await passTest(userId, courseId)).result).toEqual({
      issued: false,
      missing: ["work"],
    });
    await passWork(userId, courseId);
    expect(await credentialOf(userId, courseId)).toMatchObject({
      basis: "work",
      testAttemptId: null,
    });
  });

  it("takes the credential back when a reviewer reverses the work", async () => {
    const courseId = await course("work_and_test");
    const userId = await learnerIn(courseId);
    await passTest(userId, courseId);
    await passWork(userId, courseId);
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      revokeCredential(tx, { userId, courseId, reason: "override" }),
    );
    expect((await credentialOf(userId, courseId))?.revokedAt).not.toBeNull();
  });
});

describe.skipIf(!hasDatabase)("AI usage per academy", () => {
  let dbs: TestDatabases;
  let tenantId: string;
  let otherTenantId: string;

  beforeAll(async () => {
    dbs = await openTestDatabases();
    tenantId = await createTenant(dbs.owner.db);
    otherTenantId = await createTenant(dbs.owner.db);
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("records every call for the academy that caused it", async () => {
    const llm: LlmCaller = async () => ({
      content: "{}",
      model: "review-default",
      tokensIn: 1500,
      tokensOut: 400,
      cost: 0.0042,
      latencyMs: 5,
    });
    const metered = meteredLlm(dbs.app.db, llm, { tenantId, kind: "rubric_draft" });
    await metered({ model: "review-default", messages: [] });
    await metered({ model: "review-default", messages: [] });
    await recordAiUsage(
      dbs.app.db,
      { tenantId, kind: "transcription" },
      { model: "whisper", audioSeconds: 312.4, cost: 0 },
    );

    const rows = await withTenant(dbs.app.db, tenantId, (tx) => tx.select().from(aiUsage));
    expect(rows.map((row) => [row.kind, row.tokensIn, row.costMicroUsd, row.audioSeconds])).toEqual(
      expect.arrayContaining([
        ["rubric_draft", 1500, 4200, null],
        ["rubric_draft", 1500, 4200, null],
        ["transcription", null, 0, 312],
      ]),
    );
    expect(rows).toHaveLength(3);
    // Another academy sees none of it.
    expect(await withTenant(dbs.app.db, otherTenantId, (tx) => tx.select().from(aiUsage))).toEqual(
      [],
    );
  });
});

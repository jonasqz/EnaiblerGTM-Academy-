import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MAX_SEND_ATTEMPTS } from "@/core/notifications/rules";
import type { TenantContext } from "@/core/tenant/context";
import { validateTenantManifest } from "@/core/tenant/manifest";
import { notifications, submissions } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { applyTenantManifest, findTenantById } from "@/db/tenants";
import type { OutgoingEmail } from "@/server/email/mailer";
import type { Enqueue } from "@/server/jobs/producer";
import { loadLearnerCourse, submitAssignment } from "@/server/learning";
import { ensureEnrollment, ensureLearner } from "@/server/learners";
import type { LlmCaller } from "@/server/llm";
import { dispatchNotifications, markResultSeen } from "@/server/notifications";
import { processSubmission } from "@/server/review/process-submission";
import { createCourse, publishCourse } from "@/server/studio/courses";
import { createLesson, updateLesson } from "@/server/studio/lessons";
import { grantLevel, saveLevels } from "@/server/studio/paths";
import { decideSubmission } from "@/server/studio/reviews";

import {
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
        improvement: "Name the amount and the date.",
      })),
      summary: "Clear playbook.",
    }),
    model: "fake-model",
    tokensIn: 100,
    tokensOut: 50,
    cost: 0.001,
    latencyMs: 1,
  });
}

describe.skipIf(!hasDatabase)("learner mail: review ready and level-up", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let learner: string;
  let author: string;
  let pathId: string;
  const sent: OutgoingEmail[] = [];
  const send = async (mail: OutgoingEmail) => {
    sent.push(mail);
  };
  const enqueue: Enqueue = async () => undefined;

  /** Makes every pending mail due now, as if the wait had passed. */
  const makeDue = () =>
    withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .update(notifications)
        .set({ sendAfter: sql`now() - interval '1 second'` })
        .where(eq(notifications.status, "pending")),
    );
  const rows = () =>
    withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(notifications).orderBy(notifications.createdAt),
    );

  async function handIn(text: string): Promise<string> {
    const result = await submitAssignment(
      dbs.app.db,
      tenant,
      learner,
      "get-paid-on-time",
      { text },
      enqueue,
    );
    if (!result.ok) throw new Error(result.error);
    return result.submissionId;
  }

  beforeAll(async () => {
    dbs = await openTestDatabases();
    const manifest = testManifest(uniqueSlug("mail"), {
      paths: [{ title: "Builder" }],
      levels: [{ n: 1, name: "Apprentice", rule: "courses_completed_in_path >= 1" }],
    });
    manifest.tenant.features = { paths: true, levels: true };
    const validated = validateTenantManifest(manifest);
    if (!validated.ok) throw new Error(validated.errors.join("\n"));
    const { tenantId } = await applyTenantManifest(dbs.owner.db, validated.manifest);
    tenant = (await findTenantById(dbs.app.db, tenantId))!;
    author = await createUser(dbs.owner.db);
    learner = await createUser(dbs.owner.db);

    const courseId = await createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: "Get paid on time",
      artifactName: "Late-invoice playbook",
      outcome: "Write a reminder playbook.",
      deliveryMode: "free_async",
    });
    const lessonId = await createLesson(dbs.app.db, tenant.id, courseId, {
      locale: "en",
      title: "Why invoices go late",
      userId: author,
    });
    await updateLesson(dbs.app.db, tenant.id, lessonId, {
      title: "Why invoices go late",
      markdown: "Nobody asks.",
      criterionIds: ["complete", "evidence", "clarity"],
      userId: author,
    });
    expect((await publishCourse(dbs.app.db, tenant.id, courseId)).ok).toBe(true);
    await withTenant(dbs.app.db, tenant.id, async (tx) => {
      const inserted = await tx.execute<{ id: string }>(
        sql`insert into path_courses (tenant_id, path_id, course_id, position)
            select ${tenant.id}, p.id, ${courseId}, 0 from paths p where p.slug = 'builder'
            returning path_id as id`,
      );
      pathId = inserted.rows[0]!.id;
      const entry = { path: "builder" };
      await ensureLearner(tx, tenant, learner, { locale: "en", entry });
      await ensureEnrollment(tx, tenant, learner, {
        courseSlug: "get-paid-on-time",
        locale: "en",
        entry,
      });
    });
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("mails a pass with the level it reached, after a short wait", async () => {
    const submissionId = await handIn("Remind within a week; name amount and date.");
    await processSubmission(
      dbs.app.db,
      { tenantId: tenant.id, submissionId },
      { llm: fakeLlm(3), model: "fake-model" },
    );
    const [queued] = await rows();
    expect(queued).toMatchObject({
      kind: "review_ready",
      status: "pending",
      payload: { submissionId, levelUp: 1, secondLook: false },
    });
    expect(queued!.sendAfter.getTime()).toBeGreaterThan(Date.now() + 60_000);

    // Not yet due: nothing goes out.
    expect(await dispatchNotifications(dbs.app.db, tenant, { send })).toEqual({
      sent: 0,
      skipped: 0,
      failed: 0,
    });
    await makeDue();
    expect((await dispatchNotifications(dbs.app.db, tenant, { send })).sent).toBe(1);
    const mail = sent.at(-1)!;
    expect(mail.to).toBe(`${learner}@learners.test`);
    expect(mail.from.name).toBe(tenant.settings.author_display_name);
    expect(mail.subject).toBe("Feedback on “Late-invoice playbook” is ready");
    expect(mail.text).toContain("passed the review");
    expect(mail.text).toContain("You also reached Level 1 · Apprentice.");
    expect(mail.html).toContain(`/courses/get-paid-on-time/assignment#attempts`);
    expect(mail.headers).toEqual({ "Auto-Submitted": "auto-generated" });
    expect((await rows())[0]).toMatchObject({ status: "sent", attempts: 1 });

    // Sending is done once: a second run finds nothing.
    expect((await dispatchNotifications(dbs.app.db, tenant, { send })).sent).toBe(0);
  });

  it("sends nothing when the learner watched the result arrive", async () => {
    // A reviewer reverses the pass: a second look, mailed unless seen.
    const [first] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(submissions).where(eq(submissions.userId, learner)),
    );
    await markResultSeen(dbs.app.db, tenant.id, learner, first!.id);
    const decided = await decideSubmission(dbs.app.db, tenant, author, first!.id, {
      scores: { complete: 1, evidence: 0, clarity: 1 },
      feedback: {},
      summary: "The evidence is missing.",
      reason: "No interviews behind the claims.",
    });
    expect(decided).toMatchObject({ ok: true, pass: false });
    const latest = (await rows()).at(-1)!;
    expect(latest.payload).toMatchObject({ secondLook: true, levelUp: null });

    // The learner opens the assignment page: the new result counts as seen.
    const course = await loadLearnerCourse(dbs.app.db, tenant, "get-paid-on-time", learner, "en");
    expect(course!.attempts[0]).toMatchObject({ outcome: "needs_revision", unseen: true });
    await markResultSeen(dbs.app.db, tenant.id, learner, first!.id);
    await makeDue();
    expect(await dispatchNotifications(dbs.app.db, tenant, { send })).toMatchObject({
      sent: 0,
      skipped: 1,
    });
    expect((await rows()).at(-1)).toMatchObject({ status: "skipped", note: "seen" });
  });

  it("mails a level the team grants", async () => {
    await saveLevels(dbs.app.db, tenant.id, [
      { n: 1, name: { en: "Apprentice" }, rule: { type: "courses_completed_in_path", min: 1 } },
      { n: 2, name: { en: "Mentor", de: "Mentor" }, rule: { type: "manual_grant" } },
    ]);
    expect(
      await grantLevel(dbs.app.db, tenant, {
        userId: learner,
        pathId,
        levelN: 2,
        grantedBy: author,
        reason: null,
      }),
    ).toEqual({ ok: true, levelUp: true });
    const before = sent.length;
    expect((await dispatchNotifications(dbs.app.db, tenant, { send })).sent).toBe(1);
    expect(sent.length).toBe(before + 1);
    expect(sent.at(-1)).toMatchObject({
      subject: `New Level at ${tenant.settings.author_display_name}: Mentor`,
    });
    expect(sent.at(-1)!.text).toContain("gave you the Level “Mentor” in Builder.");
  });

  it("retries a failed send with backoff, then gives up", async () => {
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.insert(notifications).values({
        tenantId: tenant.id,
        userId: learner,
        kind: "level_up",
        payload: { pathId, level: 2 },
      }),
    );
    const failing = async () => {
      throw new Error("relay unavailable");
    };
    expect(await dispatchNotifications(dbs.app.db, tenant, { send: failing })).toMatchObject({
      failed: 1,
    });
    const retrying = (await rows()).at(-1)!;
    expect(retrying).toMatchObject({ status: "pending", attempts: 1, note: "relay unavailable" });
    expect(retrying.sendAfter.getTime()).toBeGreaterThan(Date.now() + 30_000);

    for (let attempt = 2; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
      await makeDue();
      await dispatchNotifications(dbs.app.db, tenant, { send: failing });
    }
    expect((await rows()).at(-1)).toMatchObject({
      status: "failed",
      attempts: MAX_SEND_ATTEMPTS,
    });
  });
});

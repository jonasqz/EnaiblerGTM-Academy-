import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TenantContext } from "@/core/tenant/context";
import type { AiUsageKind } from "@/core/usage/ai-usage";
import { AiAllowanceUsedUp } from "@/core/usage/allowance";
import {
  aiUsage,
  assignments,
  calibrationRuns,
  enrollments,
  lessonDrafts,
  sourceChunks,
  submissions,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import {
  admitAiCall,
  aiAllowanceStatus,
  readAiAllowance,
  setAiAllowance,
} from "@/server/ai-allowance";
import { meteredLlm } from "@/server/ai-usage";
import { requestLessonDraft, runLessonDraft } from "@/server/authoring/lesson-drafting";
import { createSource, extractSource, loadSource } from "@/server/authoring/sources";
import type { Enqueue } from "@/server/jobs/producer";
import type { LlmCaller } from "@/server/llm";
import { requestCalibration, runCalibration } from "@/server/review/calibration";
import { processSubmission } from "@/server/review/process-submission";
import { createCourse, updateExemplars } from "@/server/studio/courses";
import { listReviewQueue } from "@/server/studio/reviews";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

const review = JSON.stringify({
  criteria: ["complete", "evidence", "clarity"].map((id) => ({
    criterion_id: id,
    score: 3,
    evidence: [],
    improvement: "Name the due date in the first reminder.",
  })),
  summary: "A sequence you can send tomorrow.",
});

/** A gateway that answers with a review at $0.004 a call and counts how often it was asked. */
function countingLlm(): LlmCaller & { calls: number } {
  const llm = Object.assign(
    async () => {
      llm.calls++;
      return {
        content: review,
        model: "fake-review",
        tokensIn: 1200,
        tokensOut: 300,
        cost: 0.004,
        latencyMs: 3,
      };
    },
    { calls: 0 },
  );
  return llm;
}

/** The operator's environment for one step, put back afterwards. */
async function withEnv<T>(
  values: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> {
  const saved = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]));
  const apply = (entries: Record<string, string | undefined>) => {
    for (const [name, value] of Object.entries(entries)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  apply(values);
  try {
    return await run();
  } finally {
    apply(saved);
  }
}

describe.skipIf(!hasDatabase)("AI allowance per academy", () => {
  let dbs: TestDatabases;
  const enqueue: Enqueue = async () => undefined;

  beforeAll(async () => {
    dbs = await openTestDatabases();
  });

  afterAll(async () => {
    await dbs?.close();
  });

  const tenantOf = async () =>
    (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db))) as TenantContext;

  const course = (tenant: TenantContext) =>
    createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: "Get paid on time",
      artifactName: "Reminder playbook",
      outcome: "Write the reminder sequence you will use for late invoices.",
      deliveryMode: "free_async",
    });

  /** Usage rows as the metering path writes them; without `at`, now. */
  async function record(
    tenantId: string,
    rows: Array<{
      kind: AiUsageKind;
      at?: string;
      calls?: number;
      audioSeconds?: number;
      costMicroUsd: number | null;
    }>,
  ) {
    await withTenant(dbs.app.db, tenantId, (tx) =>
      tx.insert(aiUsage).values(
        rows.map((row) => ({
          tenantId,
          kind: row.kind,
          model: "fake",
          calls: row.calls ?? 1,
          audioSeconds: row.audioSeconds ?? null,
          costMicroUsd: row.costMicroUsd,
          ...(row.at ? { createdAt: new Date(row.at) } : {}),
        })),
      ),
    );
  }

  async function handIn(tenant: TenantContext, courseId: string): Promise<string> {
    const userId = await createUser(dbs.owner.db);
    return withTenant(dbs.app.db, tenant.id, async (tx) => {
      const [assignment] = await tx
        .select({ id: assignments.id })
        .from(assignments)
        .where(eq(assignments.courseId, courseId));
      await tx.insert(enrollments).values({ tenantId: tenant.id, userId, courseId, locale: "en" });
      const [row] = await tx
        .insert(submissions)
        .values({
          tenantId: tenant.id,
          assignmentId: assignment!.id,
          userId,
          attemptNo: 1,
          extractedText: "Day 1: a friendly reminder naming the invoice, the amount and a date.",
        })
        .returning({ id: submissions.id });
      return row!.id;
    });
  }

  it("sums an academy's spend per calendar month in Berlin, never another academy's", async () => {
    const academy = await tenantOf();
    const other = await tenantOf();
    await record(academy.id, [
      // September in Berlin runs from 2026-08-31T22:00Z to 2026-09-30T22:00Z.
      { kind: "review", at: "2026-08-31T21:59:00Z", costMicroUsd: 7_000 },
      { kind: "review", at: "2026-08-31T22:00:00Z", costMicroUsd: 1_000 },
      { kind: "lesson_draft", at: "2026-09-15T12:00:00Z", calls: 2, costMicroUsd: 20_000 },
      { kind: "review", at: "2026-09-30T21:59:00Z", costMicroUsd: 3_000 },
      { kind: "review", at: "2026-09-30T22:00:00Z", costMicroUsd: 9_000 },
    ]);
    await record(other.id, [{ kind: "review", at: "2026-09-10T10:00:00Z", costMicroUsd: 500_000 }]);

    const spent = async (tenantId: string, month: string) =>
      (await aiAllowanceStatus(dbs.app.db, tenantId, month)).spentMicroUsd;
    expect(await spent(academy.id, "2026-08")).toBe(7_000);
    expect(await spent(academy.id, "2026-09")).toBe(24_000);
    expect(await spent(academy.id, "2026-10")).toBe(9_000);
    expect(await spent(other.id, "2026-09")).toBe(500_000);
    // The operator's scripts connect as the owner, whom FORCE ROW LEVEL SECURITY binds too.
    expect((await aiAllowanceStatus(dbs.owner.db, academy.id, "2026-09")).spentMicroUsd).toBe(
      24_000,
    );
  });

  it("counts calls without a price at the fallback, and our own transcription by the minute", async () => {
    const academy = await tenantOf();
    await record(academy.id, [
      { kind: "review", at: "2026-09-04T08:00:00Z", costMicroUsd: 4_000 },
      // The gateway knew no price: one call, then a row of two.
      { kind: "embedding", at: "2026-09-04T08:01:00Z", costMicroUsd: null },
      { kind: "brand_import", at: "2026-09-04T08:02:00Z", calls: 2, costMicroUsd: null },
      // Our own Whisper records 0: 5.2 minutes of audio, and once without a duration.
      { kind: "transcription", at: "2026-09-04T08:03:00Z", audioSeconds: 312, costMicroUsd: 0 },
      { kind: "transcription", at: "2026-09-04T08:04:00Z", costMicroUsd: 0 },
      // A model the operator priced at 0 is free.
      { kind: "rubric_draft", at: "2026-09-04T08:05:00Z", costMicroUsd: 0 },
    ]);
    const spent = async () =>
      (await aiAllowanceStatus(dbs.app.db, academy.id, "2026-09")).spentMicroUsd;
    // $0.004, four calls at $0.05 and 5.2 minutes at $0.006.
    expect(await spent()).toBe(4_000 + 4 * 50_000 + 31_200);
    await withEnv({ AI_UNPRICED_CALL_USD: "0.01" }, async () => {
      expect(await spent()).toBe(4_000 + 4 * 10_000 + 31_200);
    });
  });

  it("holds hand-ins for a person once the allowance is used up, without asking the model", async () => {
    const tenant = await tenantOf();
    const courseId = await course(tenant);
    // Half a cent: the first review ($0.004) leaves some, the second goes over.
    expect(
      await setAiAllowance(dbs.app.db, tenant.slug, { kind: "amount", microUsd: 5_000 }),
    ).toMatchObject({ allowanceMicroUsd: 5_000, spentMicroUsd: 0, level: "ok" });
    const llm = countingLlm();
    const run = (submissionId: string, finalAttempt: boolean) =>
      processSubmission(
        dbs.app.db,
        { tenantId: tenant.id, submissionId },
        { llm, model: "fake-review" },
        { finalAttempt },
      );

    expect(await run(await handIn(tenant, courseId), true)).toMatchObject({ status: "released" });
    expect(await run(await handIn(tenant, courseId), true)).toMatchObject({ status: "released" });
    expect(llm.calls).toBe(2);

    // Not a retry: the job returns at once, whatever attempt it is on.
    const waiting = await handIn(tenant, courseId);
    expect(await run(waiting, false)).toEqual({
      status: "held",
      reasons: ["ai_allowance_used_up"],
    });
    expect(llm.calls).toBe(2);

    const stored = await withTenant(dbs.app.db, tenant.id, async (tx) => ({
      usage: await tx.select().from(aiUsage),
      submission: (await tx.select().from(submissions).where(eq(submissions.id, waiting)))[0],
    }));
    expect(stored.usage).toHaveLength(2);
    expect(stored.submission).toMatchObject({
      status: "in_review",
      holdReasons: ["ai_allowance_used_up"],
    });
    const queue = await listReviewQueue(dbs.app.db, tenant.id);
    expect(queue.find((row) => row.submissionId === waiting)).toMatchObject({
      kind: "decide",
      ai: null,
      holdReasons: ["ai_allowance_used_up"],
    });
    expect(await aiAllowanceStatus(dbs.app.db, tenant.id)).toMatchObject({
      spentMicroUsd: 8_000,
      percentUsed: 160,
      level: "used_up",
    });
  });

  it("applies the platform default, an academy's own allowance and no limit", async () => {
    const tenant = await tenantOf();
    await record(tenant.id, [{ kind: "rubric_draft", costMicroUsd: 30_000 }]);
    const llm = countingLlm();
    const call = () =>
      meteredLlm(dbs.app.db, llm, { tenantId: tenant.id, kind: "rubric_draft" })({
        model: "fake-review",
        messages: [],
      });

    // Neither a platform default nor an allowance of its own: no limit.
    await call();
    expect(await readAiAllowance(dbs.app.db, tenant.slug)).toMatchObject({
      slug: tenant.slug,
      setting: { kind: "default" },
      allowanceMicroUsd: null,
      spentMicroUsd: 34_000,
      percentUsed: null,
      level: null,
    });

    await withEnv({ AI_MONTHLY_ALLOWANCE_USD: "0.035" }, async () => {
      expect(await readAiAllowance(dbs.app.db, tenant.slug)).toMatchObject({
        allowanceMicroUsd: 35_000,
        percentUsed: 97,
        level: "warning",
      });
      // Still below it before the call, over it after: the next one waits for next month.
      await call();
      await expect(call()).rejects.toBeInstanceOf(AiAllowanceUsedUp);
      expect(llm.calls).toBe(2);

      // The academy's own amount comes before the default.
      expect(
        await setAiAllowance(dbs.app.db, tenant.slug, { kind: "amount", microUsd: 1_000_000 }),
      ).toMatchObject({
        setting: { kind: "amount", microUsd: 1_000_000 },
        allowanceMicroUsd: 1_000_000,
        spentMicroUsd: 38_000,
        percentUsed: 3,
        level: "ok",
      });
      await call();

      expect(await setAiAllowance(dbs.app.db, tenant.slug, { kind: "unlimited" })).toMatchObject({
        setting: { kind: "unlimited" },
        allowanceMicroUsd: null,
        level: null,
      });
      await call();
      expect(llm.calls).toBe(4);

      // Back to the default, which is used up by now.
      expect(await setAiAllowance(dbs.app.db, tenant.slug, { kind: "default" })).toMatchObject({
        setting: { kind: "default" },
        allowanceMicroUsd: 35_000,
        spentMicroUsd: 46_000,
        level: "used_up",
      });
      await expect(admitAiCall(dbs.app.db, tenant.id)).rejects.toBeInstanceOf(AiAllowanceUsedUp);
    });

    // An allowance of 0 keeps an academy's AI off even without a platform default.
    await setAiAllowance(dbs.app.db, tenant.slug, { kind: "amount", microUsd: 0 });
    await expect(call()).rejects.toBeInstanceOf(AiAllowanceUsedUp);
    expect(llm.calls).toBe(4);

    expect(await setAiAllowance(dbs.app.db, "no-such-academy", { kind: "unlimited" })).toBeNull();
    expect(await readAiAllowance(dbs.app.db, "no-such-academy")).toBeNull();
  });

  it("stops authoring jobs for good and still reads sources, without vectors", async () => {
    const tenant = await tenantOf();
    const courseId = await course(tenant);
    const author = await createUser(dbs.owner.db);
    await setAiAllowance(dbs.app.db, tenant.slug, { kind: "amount", microUsd: 0 });
    const llm = countingLlm();

    // Not the last attempt either: no retry would help this month.
    await updateExemplars(dbs.app.db, tenant.id, courseId, [
      {
        id: "good",
        expected_pass: true,
        content: "Day 1: a friendly reminder naming the invoice.",
      },
      { id: "weak", expected_pass: false, content: "Pay up now." },
    ]);
    const runId = await requestCalibration(
      dbs.app.db,
      tenant.id,
      { courseId, requestedBy: author },
      enqueue,
    );
    await runCalibration(dbs.app.db, tenant.id, runId!, {
      llm,
      model: "fake-review",
      finalAttempt: false,
    });
    const draftId = await requestLessonDraft(
      dbs.app.db,
      tenant.id,
      { courseId, locale: "en", requestedBy: author },
      enqueue,
    );
    await runLessonDraft(dbs.app.db, tenant.id, draftId, {
      model: { model: "fake-authoring", llm },
      embeddings: null,
      finalAttempt: false,
    });

    // A source is read all the same; only the search index goes without vectors.
    let embeddingRequests = 0;
    const gateway = createServer((request, response) => {
      embeddingRequests++;
      request.resume();
      response.writeHead(500).end();
    });
    await new Promise<void>((resolve) => gateway.listen(0, "127.0.0.1", resolve));
    const sourceId = await createSource(
      dbs.app.db,
      tenant.id,
      {
        courseId,
        kind: "interview",
        title: "Interview with a freelancer",
        locale: "en",
        content: "Q: When do clients pay?\nA: Late, unless the first reminder names a due date.",
        createdBy: author,
      },
      enqueue,
    );
    try {
      await withEnv(
        {
          LLM_BASE_URL: `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`,
          LLM_EMBEDDING_MODEL: "embed-test",
        },
        () => extractSource(dbs.app.db, tenant.id, sourceId, { finalAttempt: false }),
      );
    } finally {
      gateway.close();
    }

    const stored = await withTenant(dbs.app.db, tenant.id, async (tx) => ({
      calibration: (await tx.select().from(calibrationRuns))[0],
      draft: (await tx.select().from(lessonDrafts))[0],
      chunks: await tx.select().from(sourceChunks),
      usage: await tx.select().from(aiUsage),
    }));
    expect(stored.calibration).toMatchObject({ status: "failed", error: "ai_allowance_used_up" });
    expect(stored.draft).toMatchObject({ status: "failed", error: "ai_allowance_used_up" });
    expect((await loadSource(dbs.app.db, tenant.id, sourceId))?.status).toBe("ready");
    expect(stored.chunks.length).toBeGreaterThan(0);
    expect(stored.chunks.every((chunk) => chunk.embedding === null)).toBe(true);
    expect(embeddingRequests).toBe(0);
    expect(llm.calls).toBe(0);
    expect(stored.usage).toEqual([]);
  });
});

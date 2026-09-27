import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TenantContext } from "@/core/tenant/context";
import { usageMonth, type AiUsageKind } from "@/core/usage/ai-usage";
import { usageReport } from "@/core/usage/report";
import { aiUsage, assignments, courses, enrollments, submissions } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import type { LlmCaller } from "@/server/llm";
import { processSubmission } from "@/server/review/process-submission";
import { createCourse } from "@/server/studio/courses";
import { studioUsage, usageByKind } from "@/server/studio/usage";

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

/** A gateway that answers with `content` and reports tokens and price. */
function fakeLlm(content: string): LlmCaller {
  return async () => ({
    content,
    model: "fake-review",
    tokensIn: 1200,
    tokensOut: 300,
    cost: 0.004,
    latencyMs: 3,
  });
}

describe.skipIf(!hasDatabase)("AI usage per academy", () => {
  let dbs: TestDatabases;

  beforeAll(async () => {
    dbs = await openTestDatabases();
  });

  afterAll(async () => {
    await dbs?.close();
  });

  const tenantOf = async () =>
    (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db))) as TenantContext;

  const course = (tenant: TenantContext, title = "Get paid on time") =>
    createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title,
      artifactName: "Reminder playbook",
      outcome: "Write the reminder sequence you will use for late invoices.",
      deliveryMode: "free_async",
    });

  /** Rows as the job would write them, at a chosen time. */
  async function record(
    tenantId: string,
    rows: Array<{
      kind: AiUsageKind;
      at: string;
      courseId?: string | null;
      refId?: string | null;
      calls?: number;
      tokensIn?: number;
      audioSeconds?: number;
      costMicroUsd?: number | null;
    }>,
  ) {
    await withTenant(dbs.app.db, tenantId, (tx) =>
      tx.insert(aiUsage).values(
        rows.map((row) => ({
          tenantId,
          kind: row.kind,
          model: "fake",
          courseId: row.courseId ?? null,
          refId: row.refId ?? null,
          calls: row.calls ?? 1,
          tokensIn: row.tokensIn ?? null,
          audioSeconds: row.audioSeconds ?? null,
          costMicroUsd: row.costMicroUsd === undefined ? 1000 : row.costMicroUsd,
          createdAt: new Date(row.at),
        })),
      ),
    );
  }

  it("meters every call of a review for the hand-in and its course, unusable answers and retries too", async () => {
    const tenant = await tenantOf();
    const courseId = await course(tenant);
    const handIn = async () => {
      const userId = await createUser(dbs.owner.db);
      return withTenant(dbs.app.db, tenant.id, async (tx) => {
        const [assignment] = await tx
          .select({ id: assignments.id })
          .from(assignments)
          .where(eq(assignments.courseId, courseId));
        await tx
          .insert(enrollments)
          .values({ tenantId: tenant.id, userId, courseId, locale: "en" });
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
    };
    const reviewed = await handIn();
    const unusable = await handIn();

    const passed = await processSubmission(
      dbs.app.db,
      { tenantId: tenant.id, submissionId: reviewed },
      { llm: fakeLlm(review), model: "fake-review" },
    );
    expect(passed).toMatchObject({ status: "released", pass: true });

    // Unusable answers: the job fails and is retried, then a person takes over. Every call counts.
    await expect(
      processSubmission(
        dbs.app.db,
        { tenantId: tenant.id, submissionId: unusable },
        { llm: fakeLlm("not a review"), model: "fake-review" },
        { finalAttempt: false },
      ),
    ).rejects.toThrow(/output invalid/);
    expect(
      await processSubmission(
        dbs.app.db,
        { tenantId: tenant.id, submissionId: unusable },
        { llm: fakeLlm("not a review"), model: "fake-review" },
        { finalAttempt: true },
      ),
    ).toEqual({ status: "held", reasons: ["ai_invalid_output"] });

    const rows = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(aiUsage).orderBy(asc(aiUsage.createdAt)),
    );
    expect(rows.map((row) => [row.kind, row.courseId, row.refId])).toEqual([
      ["review", courseId, reviewed],
      // Three attempts per run, two runs.
      ...Array.from({ length: 6 }, () => ["review", courseId, unusable]),
    ]);
    expect(rows[0]).toMatchObject({
      model: "fake-review",
      calls: 1,
      tokensIn: 1200,
      tokensOut: 300,
      costMicroUsd: 4000,
    });

    // Two hand-ins reviewed, seven calls.
    const month = await usageByKind(dbs.app.db, tenant.id, usageMonth(rows[0]!.createdAt));
    expect(month).toEqual([
      expect.objectContaining({ kind: "review", items: 2, calls: 7, costMicroUsd: 28_000 }),
    ]);
  });

  describe("by month", () => {
    let academy: TenantContext;
    let other: TenantContext;
    let courseId: string;
    const gone = randomUUID();
    const goneToo = randomUUID();

    beforeAll(async () => {
      academy = await tenantOf();
      other = await tenantOf();
      courseId = await course(academy);
      // Named in the academy's default language (English), whatever else it has.
      await withTenant(dbs.app.db, academy.id, (tx) =>
        tx
          .update(courses)
          .set({ title: { de: "Pünktlich bezahlt werden", en: "Get paid on time" } })
          .where(eq(courses.id, courseId)),
      );
      const retried = randomUUID();
      await record(academy.id, [
        // September in Berlin runs from 2026-08-31T22:00Z to 2026-09-30T22:00Z.
        { kind: "review", at: "2026-08-31T21:59:00Z", courseId, refId: randomUUID() },
        { kind: "review", at: "2026-08-31T22:00:00Z", courseId, refId: randomUUID() },
        { kind: "review", at: "2026-09-10T10:00:00Z", courseId, refId: retried },
        // The same hand-in again: a second attempt of the model.
        { kind: "review", at: "2026-09-10T10:00:05Z", courseId, refId: retried },
        { kind: "review", at: "2026-09-30T21:59:00Z", courseId, refId: randomUUID() },
        { kind: "review", at: "2026-09-30T22:00:00Z", courseId, refId: randomUUID() },
        // Courses deleted since: counted together.
        { kind: "review", at: "2026-09-05T08:00:00Z", courseId: gone, refId: randomUUID() },
        { kind: "review", at: "2026-09-06T08:00:00Z", courseId: goneToo, refId: randomUUID() },
        // Inside the six months shown, and just before them.
        { kind: "review", at: "2026-04-02T08:00:00Z", courseId, refId: randomUUID() },
        { kind: "review", at: "2026-03-31T08:00:00Z", courseId, refId: randomUUID() },
        { kind: "rubric_draft", at: "2026-09-02T08:00:00Z", courseId, costMicroUsd: 3000 },
        { kind: "rubric_draft", at: "2026-09-03T08:00:00Z", courseId, costMicroUsd: 3000 },
        {
          kind: "transcription",
          at: "2026-09-04T08:00:00Z",
          courseId,
          refId: randomUUID(),
          audioSeconds: 312,
          costMicroUsd: 0,
        },
        {
          kind: "embedding",
          at: "2026-09-04T08:01:00Z",
          courseId,
          tokensIn: 1000,
          costMicroUsd: 90,
        },
        {
          kind: "embedding",
          at: "2026-09-04T08:02:00Z",
          courseId,
          tokensIn: 500,
          costMicroUsd: null,
        },
        { kind: "brand_import", at: "2026-09-01T08:00:00Z" },
      ]);
      await record(other.id, [
        {
          kind: "review",
          at: "2026-09-10T10:00:00Z",
          courseId: await course(other),
          refId: randomUUID(),
        },
        { kind: "lesson_draft", at: "2026-09-10T10:00:00Z", calls: 2 },
      ]);
    });

    it("shows the Studio its month by kind and by course, and nothing of other academies", async () => {
      const usage = await studioUsage(dbs.app.db, academy, "2026-09");
      expect(usage.kinds.review).toMatchObject({ items: 5, calls: 6 });
      expect(usage.kinds.rubric_draft.calls).toBe(2);
      expect(usage.kinds.transcription.audioSeconds).toBe(312);
      expect(usage.kinds.embedding).toMatchObject({ calls: 2, tokensIn: 1500 });
      expect(usage.kinds.brand_import.calls).toBe(1);
      expect(usage.kinds.lesson_draft).toMatchObject({ calls: 0, items: 0 });
      expect(usage.byCourse).toEqual([
        { courseId, title: "Get paid on time", reviews: 3 },
        { courseId: null, title: null, reviews: 2 },
      ]);
      expect(usage.history).toEqual([
        { month: "2026-04", reviews: 1 },
        { month: "2026-05", reviews: 0 },
        { month: "2026-06", reviews: 0 },
        { month: "2026-07", reviews: 0 },
        { month: "2026-08", reviews: 1 },
        { month: "2026-09", reviews: 5 },
      ]);

      const theirs = await studioUsage(dbs.app.db, other, "2026-09");
      expect(theirs.kinds.review.items).toBe(1);
      expect(theirs.kinds.lesson_draft.calls).toBe(2);
      expect(theirs.kinds.rubric_draft.calls).toBe(0);
      expect(theirs.byCourse).toEqual([
        expect.objectContaining({ title: "Get paid on time", reviews: 1 }),
      ]);
    });

    it("reports cost per review and academy to the operator", async () => {
      // Owner connection, as the script uses: FORCE ROW LEVEL SECURITY binds it too.
      expect(await dbs.owner.db.select().from(aiUsage)).toEqual([]);
      const academies = await Promise.all(
        [academy, other].map(async (tenant) => ({
          slug: tenant.slug,
          name: tenant.settings.author_display_name,
          kinds: await usageByKind(dbs.owner.db, tenant.id, "2026-09"),
        })),
      );
      const report = usageReport("2026-09", academies);
      expect(report.lines.map((line) => line.slug)).toEqual([academy.slug, other.slug]);
      expect(report.lines[0]).toEqual({
        slug: academy.slug,
        name: academy.settings.author_display_name,
        reviews: 5,
        reviewCostMicroUsd: 6000,
        costPerReviewMicroUsd: 1200,
        authoringCalls: 6,
        authoringCostMicroUsd: 7090,
        transcriptionSeconds: 312,
        totalCostMicroUsd: 13_090,
        costIncomplete: true,
      });
      expect(report.lines[1]).toMatchObject({
        reviews: 1,
        authoringCalls: 2,
        totalCostMicroUsd: 2000,
        costIncomplete: false,
      });
    });

    it("prints the operator's report on the command line", () => {
      const report = (...args: string[]) =>
        execFileSync("node_modules/.bin/tsx", ["scripts/usage-report.ts", ...args], {
          encoding: "utf8",
          stdio: "pipe",
          env: { ...process.env, DATABASE_MIGRATION_URL: process.env.TEST_DATABASE_MIGRATION_URL },
        });
      expect(report("--month", "2026-09", "--csv").split("\n")).toContain(
        `2026-09,${academy.slug},${academy.settings.author_display_name},5,0.0060,0.0012,6,0.0071,5.2,0.0131,true`,
      );
      expect(report("--month=2026-09")).toMatch(
        new RegExp(`^${other.slug} .* 1 +0\\.0010 +0\\.0010 +2 +0\\.0010 +0\\.0 +0\\.0020$`, "m"),
      );
      expect(() => report("--month", "2026-13")).toThrow(/Usage: usage-report/);
    });
  });
});

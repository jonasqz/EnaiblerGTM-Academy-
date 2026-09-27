import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TenantContext } from "@/core/tenant/context";
import { findTenantById } from "@/db/tenants";
import type { Enqueue } from "@/server/jobs/producer";
import type { LlmCallOptions, LlmCaller } from "@/server/llm";
import {
  listCalibrationRuns,
  requestCalibration,
  runCalibration,
} from "@/server/review/calibration";
import {
  createCourse,
  loadCourseEditor,
  publishCheckFor,
  updateExemplars,
} from "@/server/studio/courses";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

describe.skipIf(!hasDatabase)("review calibration", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let courseId: string;
  let author: string;
  const enqueue: Enqueue = async () => undefined;
  const calls: LlmCallOptions[] = [];
  // Scores everything high unless the work admits it has no evidence.
  const llm: LlmCaller = async (options) => {
    calls.push(options);
    const user = String(options.messages.find((message) => message.role === "user")!.content);
    const submission = user.split("# Submission")[1] ?? "";
    const weak = /no evidence/i.test(submission);
    return {
      content: JSON.stringify({
        criteria: ["complete", "evidence", "clarity"].map((id) => ({
          criterion_id: id,
          score: weak ? (id === "clarity" ? 2 : 0) : 3,
          evidence: [],
          improvement: "Add a customer quote.",
        })),
        summary: weak ? "Claims without evidence." : "Well backed.",
      }),
      model: "fake",
      tokensIn: 1000,
      tokensOut: 200,
      cost: 0.002,
      latencyMs: 2,
    };
  };

  beforeAll(async () => {
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    author = await createUser(dbs.owner.db);
    courseId = await createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: "Validation Lab",
      artifactName: "Validated idea brief",
      outcome: "Write a one-page brief backed by interviews.",
      deliveryMode: "free_async",
    });
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("asks for calibration before publishing when the AI reviews", async () => {
    const editor = (await loadCourseEditor(dbs.app.db, tenant.id, courseId))!;
    const codes = (aiReview: boolean) =>
      publishCheckFor(editor, { aiReview }).warnings.map((warning) => warning.code);
    expect(codes(true)).toContain("calibration_missing");
    expect(codes(false)).not.toContain("calibration_missing");
    // Examples of one kind only are not enough.
    await updateExemplars(dbs.app.db, tenant.id, courseId, [
      { id: "good", expected_pass: true, content: "Eight interviews; six paid late fees." },
    ]);
    expect(
      await requestCalibration(dbs.app.db, tenant.id, { courseId, requestedBy: author }, enqueue),
    ).toBeNull();
  });

  it("reviews each example without showing it as an example, and measures agreement", async () => {
    await updateExemplars(dbs.app.db, tenant.id, courseId, [
      {
        id: "good",
        title: "Strong brief",
        expected_pass: true,
        content: "Eight interviews; six paid late fees.",
      },
      {
        id: "weak",
        title: "Opinion only",
        expected_pass: false,
        content: "Everyone hates invoices. No evidence, but I am sure.",
        expected_scores: { complete: 1, evidence: 0, clarity: 2 },
      },
      // The author passes it; the AI will not: a disagreement to surface.
      {
        id: "edge",
        title: "Borderline",
        expected_pass: true,
        content: "One chat, no evidence yet.",
      },
    ]);
    const editor = (await loadCourseEditor(dbs.app.db, tenant.id, courseId))!;
    expect(editor.rubric!.version).toBeGreaterThan(1);

    const runId = await requestCalibration(
      dbs.app.db,
      tenant.id,
      { courseId, requestedBy: author },
      enqueue,
    );
    await runCalibration(dbs.app.db, tenant.id, runId!, { llm, model: "fake", finalAttempt: true });
    const [run] = await listCalibrationRuns(dbs.app.db, tenant.id, courseId);
    expect(run).toMatchObject({
      status: "done",
      rubricVersion: editor.rubric!.version,
      costMicroUsd: 6000,
    });
    expect(run!.agreement).toBeCloseTo(2 / 3);
    expect(run!.results.map((result) => [result.exemplarId, result.aiPass])).toEqual([
      ["good", true],
      ["weak", false],
      ["edge", false],
    ]);

    // Leave one out: the exemplar under review is never among the prompt's examples.
    for (const [index, id] of ["good", "weak", "edge"].entries()) {
      const prompt = String(calls[index]!.messages.find((m) => m.role === "user")!.content);
      const examples = prompt.split("# Calibration examples")[1]?.split("# Submission")[0] ?? "";
      const own = { good: "Eight interviews", weak: "Everyone hates invoices", edge: "One chat" }[
        id
      ]!;
      expect(examples).not.toContain(own);
    }

    // Two of three is below the bar: the checklist says so.
    const after = (await loadCourseEditor(dbs.app.db, tenant.id, courseId))!;
    const warnings = publishCheckFor(after, { aiReview: true }).warnings.map(
      (warning) => warning.code,
    );
    expect(warnings).toContain("calibration_low");
    expect(warnings).not.toContain("calibration_missing");

    // A changed rubric makes the run stale again.
    await updateExemplars(
      dbs.app.db,
      tenant.id,
      courseId,
      after.rubric!.definition.exemplars.slice(0, 2),
    );
    const stale = (await loadCourseEditor(dbs.app.db, tenant.id, courseId))!;
    expect(
      publishCheckFor(stale, { aiReview: true }).warnings.map((warning) => warning.code),
    ).toContain("calibration_missing");
  });
});

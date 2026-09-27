import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { rubricSchema } from "@/core/review/rubric";
import type { TenantContext } from "@/core/tenant/context";
import { files, submissions } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import { loadFile, storeFile } from "@/server/files";
import type { Enqueue } from "@/server/jobs/producer";
import { loadLearnerCourse, submitAssignment } from "@/server/learning";
import { ensureEnrollment, ensureLearner } from "@/server/learners";
import type { LlmCallOptions, LlmCaller } from "@/server/llm";
import { deleteMyData, exportMyData } from "@/server/profile";
import { processSubmission } from "@/server/review/process-submission";
import {
  createCourse,
  loadCourseEditor,
  publishCourse,
  updateOutcome,
} from "@/server/studio/courses";
import { createLesson } from "@/server/studio/lessons";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

/* Needs TEST_S3_ENDPOINT as well (see files.test.ts). */
const hasStorage = hasDatabase && Boolean(process.env.TEST_S3_ENDPOINT);

describe.skipIf(!hasStorage)("hand-ins with files", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let learner: string;
  const calls: LlmCallOptions[] = [];
  const enqueue: Enqueue = async () => undefined;
  const llm: LlmCaller = async (options) => {
    calls.push(options);
    return {
      content: JSON.stringify({
        criteria: ["complete", "evidence", "clarity"].map((id) => ({
          criterion_id: id,
          score: 3,
          evidence: ["Freelancers lose four hours"],
          improvement: "Add one more interview.",
        })),
        summary: "Strong brief.",
      }),
      model: "fake-vision",
      tokensIn: 2000,
      tokensOut: 300,
      cost: 0.01,
      latencyMs: 5,
    };
  };

  beforeAll(async () => {
    process.env.S3_ENDPOINT = process.env.TEST_S3_ENDPOINT;
    process.env.S3_BUCKET = `enaibler-test-${randomBytes(4).toString("hex")}`;
    process.env.S3_ACCESS_KEY_ID = "test";
    process.env.S3_SECRET_ACCESS_KEY = "test";
    dbs = await openTestDatabases();
    const tenantId = await createTenant(dbs.owner.db);
    tenant = (await findTenantById(dbs.app.db, tenantId))!;
    learner = await createUser(dbs.owner.db);

    const courseId = await createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: "Invoice Lab",
      artifactName: "Validated idea brief",
      outcome: "Write a one-page brief backed by five interviews.",
      deliveryMode: "free_async",
    });
    const editor = await loadCourseEditor(dbs.app.db, tenant.id, courseId);
    await updateOutcome(dbs.app.db, tenant.id, courseId, {
      prompt: editor!.assignment!.prompt,
      artifactName: editor!.assignment!.artifactName,
      submissionTypes: [{ type: "file", accept: ["pdf", "image", "md"], max_mb: 5 }],
      rubric: rubricSchema.parse(editor!.rubric!.definition),
    });
    await createLesson(dbs.app.db, tenant.id, courseId, {
      locale: "en",
      title: "Interviews",
      userId: learner,
    });
    expect((await publishCourse(dbs.app.db, tenant.id, courseId)).ok).toBe(true);
    await withTenant(dbs.app.db, tenant.id, async (tx) => {
      await ensureLearner(tx, tenant, learner, { locale: "en", entry: {} });
      await ensureEnrollment(tx, tenant, learner, {
        courseSlug: "invoice-lab",
        locale: "en",
        entry: {},
      });
    });
  });

  afterAll(async () => {
    await dbs?.close();
  });

  async function pdf(text: string): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.setAuthor("Jane Doe");
    doc.addPage([400, 200]).drawText(text, {
      x: 20,
      y: 100,
      size: 12,
      font: await doc.embedFont(StandardFonts.Helvetica),
    });
    return doc.save();
  }

  it("hands in a PDF and a photo; the review reads the text and sees the photo", async () => {
    const brief = await storeFile(dbs.app.db, tenant.id, {
      purpose: "submission",
      body: await pdf("Freelancers lose four hours a month chasing invoices."),
      name: "brief.pdf",
      ownerUserId: learner,
      status: "pending",
    });
    const photo = await storeFile(dbs.app.db, tenant.id, {
      purpose: "submission",
      body: new Uint8Array(
        await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#fff" } })
          .jpeg()
          .toBuffer(),
      ),
      name: "whiteboard.jpg",
      ownerUserId: learner,
      status: "pending",
    });

    // Someone else's upload cannot be handed in, and a refused attempt claims nothing.
    const stranger = await createUser(dbs.owner.db);
    const foreign = await storeFile(dbs.app.db, tenant.id, {
      purpose: "submission",
      body: new TextEncoder().encode("# not mine"),
      name: "x.md",
      ownerUserId: stranger,
      status: "pending",
    });
    expect(
      await submitAssignment(
        dbs.app.db,
        tenant,
        learner,
        "invoice-lab",
        {
          fileIds: [brief.id, foreign.id],
        },
        enqueue,
      ),
    ).toEqual({ ok: false, error: "invalid" });
    expect((await loadFile(dbs.app.db, tenant.id, brief.id))?.status).toBe("pending");

    const submitted = await submitAssignment(
      dbs.app.db,
      tenant,
      learner,
      "invoice-lab",
      { fileIds: [brief.id, photo.id] },
      enqueue,
    );
    expect(submitted).toMatchObject({ ok: true, attemptNo: 1 });
    if (!submitted.ok) return;

    const outcome = await processSubmission(
      dbs.app.db,
      { tenantId: tenant.id, submissionId: submitted.submissionId },
      { llm, model: "fake-vision" },
    );
    expect(outcome).toMatchObject({ status: "released" });

    const user = calls.at(-1)!.messages.find((message) => message.role === "user")!;
    const parts = user.content as Array<{
      type: string;
      text?: string;
      image_url?: { url: string };
    }>;
    expect(parts[0]!.text).toContain("Freelancers lose four hours a month chasing invoices.");
    expect(parts[0]!.text).toContain("(1 image attached separately)");
    expect(parts[1]!.image_url!.url).toMatch(/^data:image\/jpeg;base64,/);
    const sent = Buffer.from(parts[1]!.image_url!.url.split(",")[1]!, "base64");
    expect(await sharp(sent).metadata()).toMatchObject({ width: 1600, height: 1067 });

    const [row] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(submissions).where(eq(submissions.id, submitted.submissionId)),
    );
    expect(row?.filesText).toContain("## brief.pdf");
    expect(row?.files.map((file) => file.kind)).toEqual(["pdf", "image"]);

    const course = await loadLearnerCourse(dbs.app.db, tenant, "invoice-lab", learner, "en");
    expect(course?.attempts[0]?.files.map((file) => file.name)).toEqual([
      "brief.pdf",
      "whiteboard.jpg",
    ]);
  });

  it("exports and deletes the learner's files with their data", async () => {
    const exported = await exportMyData(dbs.app.db, tenant, learner);
    expect(exported.files.map((file) => file.name).sort()).toEqual(["brief.pdf", "whiteboard.jpg"]);

    await deleteMyData(dbs.app.db, tenant, learner);
    const left = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(files).where(eq(files.ownerUserId, learner)),
    );
    expect(left).toEqual([]);
  });
});

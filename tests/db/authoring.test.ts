import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TenantContext } from "@/core/tenant/context";
import { files, lessons, sourceChunks } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import {
  listLessonDrafts,
  requestLessonDraft,
  runLessonDraft,
} from "@/server/authoring/lesson-drafting";
import type { AuthoringModel } from "@/server/authoring/model";
import { extractKeyframes, transcribeRecording } from "@/server/authoring/recordings";
import { createSource, deleteSource, extractSource, loadSource } from "@/server/authoring/sources";
import type { FetchText } from "@/server/brand/safe-fetch";
import { loadFile, storeFile } from "@/server/files";
import type { Enqueue } from "@/server/jobs/producer";
import type { LlmCallOptions } from "@/server/llm";
import { createCourse } from "@/server/studio/courses";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

/* Needs TEST_S3_ENDPOINT (see files.test.ts); the recording steps also need ffmpeg (FFMPEG_PATH). */
const hasStorage = hasDatabase && Boolean(process.env.TEST_S3_ENDPOINT);
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const hasFfmpeg = spawnSync(ffmpeg, ["-version"]).status === 0;

describe.skipIf(!hasStorage)("authoring: sources → lessons", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let courseId: string;
  let author: string;
  let whisper: Server;
  let whisperUrl: string;
  const jobs: Array<{ name: string; data: unknown }> = [];
  const enqueue: Enqueue = async (_tx, name, data) => {
    jobs.push({ name, data });
  };
  const calls: LlmCallOptions[] = [];

  const model: AuthoringModel = {
    model: "fake-authoring",
    llm: async (options) => {
      calls.push(options);
      const kind = options.jsonSchema?.name;
      const content =
        kind === "recording_topics"
          ? {
              topics: [
                { title: "Open the invoice list", first_segment: 0 },
                { title: "Chase the late ones", first_segment: 2 },
              ],
            }
          : {
              lessons: [
                {
                  title: "Find the invoices that are late",
                  criterion_ids: ["complete", "evidence"],
                  markdown:
                    "## Why it matters\n\nLate invoices cost freelancers four hours a month.\n\n[[K1]]\n\nNow list the late invoices of your own last quarter.",
                  source_refs: ["S1", "S3"],
                },
                {
                  title: "Write the reminder",
                  criterion_ids: ["clarity"],
                  markdown:
                    "## A reminder that gets paid\n\nName the invoice, the amount and a date. Keep it friendly and short, then send yours.",
                  source_refs: ["S4"],
                },
              ],
              notes: ["The sources say little about clarity."],
            };
      return {
        content: JSON.stringify(content),
        model: "fake-authoring",
        tokensIn: 3000,
        tokensOut: 800,
        cost: 0.02,
        latencyMs: 4,
      };
    },
  };

  beforeAll(async () => {
    process.env.S3_ENDPOINT = process.env.TEST_S3_ENDPOINT;
    process.env.S3_BUCKET = `enaibler-test-${randomBytes(4).toString("hex")}`;
    process.env.S3_ACCESS_KEY_ID = "test";
    process.env.S3_SECRET_ACCESS_KEY = "test";
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    author = await createUser(dbs.owner.db);
    courseId = await createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: "Get paid on time",
      artifactName: "Reminder playbook",
      outcome: "Write the reminder sequence you will use for late invoices.",
      deliveryMode: "free_async",
    });
    whisper = createServer((request, response) => {
      request.resume();
      request.on("end", () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            text: "…",
            segments: [
              { start: 0, end: 3, text: "Here is my invoice list." },
              { start: 3, end: 6, text: "I sort it by due date." },
              { start: 6, end: 9, text: "Then I chase the late ones." },
              { start: 9, end: 12, text: "With a short reminder." },
            ],
          }),
        );
      });
    });
    await new Promise<void>((resolve) => whisper.listen(0, "127.0.0.1", resolve));
    whisperUrl = `http://127.0.0.1:${(whisper.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    whisper?.close();
    await dbs?.close();
  });

  it("reads a web page, a document and an interview into chunks", async () => {
    const page: FetchText = async (url) => ({
      ok: true,
      url,
      contentType: "text/html",
      text: "<html><head><title>Why invoices go unpaid</title></head><body><nav>menu</nav><article><h1>Why invoices go unpaid</h1><p>Most clients pay late because nobody named a due date.</p></article></body></html>",
    });
    const urlSource = await createSource(
      dbs.app.db,
      tenant.id,
      {
        courseId,
        kind: "url",
        title: "https://blog.example/unpaid",
        url: "https://blog.example/unpaid",
        locale: "en",
        createdBy: author,
      },
      enqueue,
    );
    await extractSource(dbs.app.db, tenant.id, urlSource, { finalAttempt: true, fetchText: page });
    const read = await loadSource(dbs.app.db, tenant.id, urlSource);
    expect(read).toMatchObject({ status: "ready", title: "Why invoices go unpaid" });
    expect(read?.content).toContain("nobody named a due date");
    expect(read?.content).not.toContain("menu");

    const doc = await PDFDocument.create();
    doc.addPage([400, 200]).drawText("Send the first reminder three days after the due date.", {
      x: 10,
      y: 100,
      size: 10,
      font: await doc.embedFont(StandardFonts.Helvetica),
    });
    const pdf = await storeFile(dbs.app.db, tenant.id, {
      purpose: "source",
      body: await doc.save(),
      name: "playbook.pdf",
      createdBy: author,
    });
    const docSource = await createSource(
      dbs.app.db,
      tenant.id,
      {
        courseId,
        kind: "document",
        title: "Playbook",
        fileId: pdf.id,
        locale: "en",
        createdBy: author,
      },
      enqueue,
    );
    await extractSource(dbs.app.db, tenant.id, docSource, { finalAttempt: true });
    expect((await loadSource(dbs.app.db, tenant.id, docSource))?.content).toContain(
      "three days after the due date",
    );

    const interview = await createSource(
      dbs.app.db,
      tenant.id,
      {
        courseId,
        kind: "interview",
        title: "Expert interview",
        locale: "en",
        content: "## What do beginners get wrong?\n\nThey apologise for asking to be paid.",
        createdBy: author,
      },
      enqueue,
    );
    await extractSource(dbs.app.db, tenant.id, interview, { finalAttempt: true });
    const chunks = await withTenant(dbs.app.db, tenant.id, (tx) => tx.select().from(sourceChunks));
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(jobs.map((job) => job.name)).toEqual([
      "sources.extract",
      "sources.extract",
      "sources.extract",
    ]);

    // A blocked address fails with a message for the author, not a retry loop.
    const blocked = await createSource(
      dbs.app.db,
      tenant.id,
      {
        courseId,
        kind: "url",
        title: "http://10.0.0.1/",
        url: "http://10.0.0.1/",
        locale: "en",
        createdBy: author,
      },
      enqueue,
    );
    await extractSource(dbs.app.db, tenant.id, blocked, {
      finalAttempt: false,
      fetchText: async () => ({ ok: false, reason: "blocked" }),
    });
    expect(await loadSource(dbs.app.db, tenant.id, blocked)).toMatchObject({
      status: "failed",
      error: "This address cannot be read from our servers.",
    });
    await deleteSource(dbs.app.db, tenant.id, blocked);
  });

  it.skipIf(!hasFfmpeg)(
    "transcribes a recording into topics and takes a screenshot per step",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "enaibler-test-"));
      const video = join(dir, "recording.mp4");
      const made = spawnSync(ffmpeg, [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=320x240:rate=10:duration=12",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=12",
        "-vf",
        "drawbox=x=0:y=0:w=320:h=240:color=black@1:t=fill:enable='gt(t,6)'",
        "-shortest",
        "-pix_fmt",
        "yuv420p",
        video,
      ]);
      expect(made.status).toBe(0);
      const recording = await storeFile(dbs.app.db, tenant.id, {
        purpose: "source",
        body: new Uint8Array(readFileSync(video)),
        name: "Screen recording.mp4",
        createdBy: author,
      });
      rmSync(dir, { recursive: true, force: true });
      const sourceId = await createSource(
        dbs.app.db,
        tenant.id,
        {
          courseId,
          kind: "recording",
          title: "Chasing invoices",
          fileId: recording.id,
          locale: "en",
          createdBy: author,
        },
        enqueue,
      );
      expect(jobs.at(-1)).toMatchObject({ name: "transcription.run" });
      const next: string[] = [];
      await transcribeRecording(dbs.app.db, tenant.id, sourceId, {
        whisper: { baseUrl: whisperUrl, model: "fake-whisper" },
        model,
        next: async (name) => {
          next.push(name);
        },
        finalAttempt: true,
      });
      const transcribed = await loadSource(dbs.app.db, tenant.id, sourceId);
      expect(transcribed?.status).toBe("ready");
      expect(
        transcribed?.transcript?.map((topic) => [topic.title, topic.startSec, topic.endSec]),
      ).toEqual([
        ["Open the invoice list", 0, 6],
        ["Chase the late ones", 6, 12],
      ]);
      expect(next).toEqual(["keyframes.extract"]);

      await extractKeyframes(dbs.app.db, tenant.id, sourceId);
      const withFrames = await loadSource(dbs.app.db, tenant.id, sourceId);
      const frameIds = withFrames!.transcript!.map((topic) => topic.keyframeFileId);
      expect(frameIds.every(Boolean)).toBe(true);
      const frame = await loadFile(dbs.app.db, tenant.id, frameIds[0]!);
      expect(frame).toMatchObject({ purpose: "keyframe", contentType: "image/jpeg" });
    },
    60_000,
  );

  it("drafts lessons backwards from the rubric and places the screenshots", async () => {
    const draftId = await requestLessonDraft(
      dbs.app.db,
      tenant.id,
      { courseId, locale: "en", requestedBy: author },
      enqueue,
    );
    expect(jobs.at(-1)).toMatchObject({ name: "lessons.draft", data: { draftId } });
    await runLessonDraft(dbs.app.db, tenant.id, draftId, {
      model,
      embeddings: null,
      finalAttempt: true,
    });

    const [run] = await listLessonDrafts(dbs.app.db, tenant.id, courseId);
    expect(run).toMatchObject({
      status: "done",
      notes: ["The sources say little about clarity."],
      costMicroUsd: 20_000,
    });
    const created = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(lessons).where(eq(lessons.courseId, courseId)),
    );
    expect(created.map((lesson) => [lesson.title, lesson.version, lesson.criterionIds])).toEqual([
      ["Find the invoices that are late", 1, ["complete", "evidence"]],
      ["Write the reminder", 1, ["clarity"]],
    ]);
    expect(created[0]!.sourceIds.length).toBeGreaterThan(0);

    const prompt = calls
      .at(-1)!
      .messages.map((message) => message.content)
      .join("\n");
    expect(prompt).toContain("- complete:");
    expect(prompt).toContain("nobody named a due date");
    if (hasFfmpeg) {
      expect(prompt).toContain("Screenshot available: [[K1]]");
      const markdown = (created[0]!.blocks[0] as { markdown: string }).markdown;
      const image = markdown.match(/!\[[^\]]*\]\(\/files\/([0-9a-f-]{36})\.jpg\)/);
      expect(image).not.toBeNull();
      // Used screenshots become lesson media, so learners can load them.
      const [promoted] = await withTenant(dbs.app.db, tenant.id, (tx) =>
        tx.select().from(files).where(eq(files.id, image![1]!)),
      );
      expect(promoted?.purpose).toBe("lesson_media");
    }
  });
});

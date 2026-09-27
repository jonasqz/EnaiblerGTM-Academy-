import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { changedSourceOf } from "@/core/authoring/auto-update";
import type { TenantContext } from "@/core/tenant/context";
import { lessons, sourceChunks } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import {
  createSource,
  deleteSource,
  extractSource,
  loadSource,
  recheckDueSources,
  recheckSource,
} from "@/server/authoring/sources";
import type { FetchText } from "@/server/brand/safe-fetch";
import type { Enqueue } from "@/server/jobs/producer";
import { createCourse } from "@/server/studio/courses";
import { studioOverview } from "@/server/studio/insights";
import { createLesson, markLessonReviewed, setLessonSources } from "@/server/studio/lessons";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

const DAY = 24 * 60 * 60_000;

function page(body: string): FetchText {
  return async (url) => ({
    ok: true,
    url,
    contentType: "text/html",
    text: `<html><head><title>Late fees</title></head><body><article><h1>Late fees</h1><p>${body}</p></article></body></html>`,
  });
}

describe.skipIf(!hasDatabase)("auto-update from sources", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let author: string;
  let courseId: string;
  let sourceId: string;
  let lessonId: string;
  const enqueue: Enqueue = async () => undefined;

  const lesson = async () =>
    (
      await withTenant(dbs.app.db, tenant.id, (tx) =>
        tx.select().from(lessons).where(eq(lessons.id, lessonId)),
      )
    )[0]!;
  const chunkIds = async () =>
    (
      await withTenant(dbs.app.db, tenant.id, (tx) =>
        tx
          .select({ id: sourceChunks.id })
          .from(sourceChunks)
          .where(eq(sourceChunks.sourceId, sourceId)),
      )
    ).map((row) => row.id);

  beforeAll(async () => {
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
    sourceId = await createSource(
      dbs.app.db,
      tenant.id,
      {
        courseId,
        kind: "url",
        title: "https://blog.example/late-fees",
        url: "https://blog.example/late-fees",
        locale: "en",
        createdBy: author,
      },
      enqueue,
    );
    await extractSource(dbs.app.db, tenant.id, sourceId, {
      finalAttempt: true,
      fetchText: page("A late fee of 40 euros is allowed for business clients."),
    });
    lessonId = await createLesson(dbs.app.db, tenant.id, courseId, {
      locale: "en",
      title: "Charge the late fee",
      userId: author,
    });
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("links a hand-written lesson to this course's sources only", async () => {
    const otherCourse = await createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: "Other course",
      artifactName: "Other artifact",
      outcome: "Something else.",
      deliveryMode: "free_async",
    });
    const foreign = await createSource(
      dbs.app.db,
      tenant.id,
      {
        courseId: otherCourse,
        kind: "interview",
        title: "Interview",
        locale: "en",
        content: "Answers.",
        createdBy: author,
      },
      enqueue,
    );
    await setLessonSources(dbs.app.db, tenant.id, lessonId, [sourceId, foreign, "not-an-id"]);
    expect((await lesson()).sourceIds).toEqual([sourceId]);
  });

  it("reads web pages again once a day and leaves unchanged text alone", async () => {
    const same = page("A late fee of 40 euros is allowed for business clients.");
    expect(await recheckDueSources(dbs.app.db, tenant.id, { fetchText: same })).toMatchObject({
      unchanged: 0,
      changed: 0,
    });
    const before = await chunkIds();
    const tomorrow = new Date(Date.now() + DAY + 60_000);
    expect(
      await recheckDueSources(dbs.app.db, tenant.id, { fetchText: same, now: tomorrow }),
    ).toMatchObject({ unchanged: 1, changed: 0, failed: 0 });
    // Not chunked (or embedded) again.
    expect(await chunkIds()).toEqual(before);
    expect((await lesson()).flaggedAt).toBeNull();
  });

  it("flags the lessons written from a page that changed", async () => {
    const changed = page("Since 2026, the late fee for business clients is 50 euros.");
    expect(await recheckSource(dbs.app.db, tenant.id, sourceId, { fetchText: changed })).toBe(
      "changed",
    );
    const source = await loadSource(dbs.app.db, tenant.id, sourceId);
    expect(source?.content).toContain("50 euros");
    expect(source?.changedAt).not.toBeNull();
    const flagged = await lesson();
    expect(flagged.flaggedAt).not.toBeNull();
    expect(changedSourceOf(flagged.flagReason)).toBe(sourceId);
    expect((await studioOverview(dbs.app.db, tenant.id)).flaggedLessons).toEqual({
      count: 1,
      courseId,
    });

    await markLessonReviewed(dbs.app.db, tenant.id, lessonId);
    expect((await lesson()).flaggedAt).toBeNull();
    expect((await studioOverview(dbs.app.db, tenant.id)).flaggedLessons.count).toBe(0);
  });

  it("keeps the text it has when the page cannot be read", async () => {
    expect(
      await recheckSource(dbs.app.db, tenant.id, sourceId, {
        fetchText: async () => ({ ok: false, reason: "unreachable" }),
      }),
    ).toBe("failed");
    expect(await loadSource(dbs.app.db, tenant.id, sourceId)).toMatchObject({
      status: "ready",
      error: "page_unreachable",
    });
    expect((await loadSource(dbs.app.db, tenant.id, sourceId))?.content).toContain("50 euros");
    expect((await lesson()).flaggedAt).toBeNull();
  });

  it("stops watching a deleted source", async () => {
    await deleteSource(dbs.app.db, tenant.id, sourceId);
    expect((await lesson()).sourceIds).toEqual([]);
  });
});

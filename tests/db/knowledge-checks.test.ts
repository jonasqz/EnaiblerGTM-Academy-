import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { saveLessonAction } from "@/app/studio/actions";
import type { CheckQuestion } from "@/core/questions/questions";
import type { TenantContext } from "@/core/tenant/context";
import { lessonVersions } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import { createCourse } from "@/server/studio/courses";
import {
  checkQuestionsOf,
  createLesson,
  loadLessonEditor,
  restoreLessonVersion,
  updateLesson,
} from "@/server/studio/lessons";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

// The save action outside Next: the session, the Studio's words and the database come from here.
const scope = vi.hoisted(() => ({
  db: undefined as unknown,
  session: undefined as unknown,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/access", () => ({
  requireCapability: async () => scope.session,
  reviewScopeOf: () => null,
}));
vi.mock("@/server/studio-text", async () => {
  const { studioText } = await import("@/core/i18n/studio/translator");
  return { getStudioText: async () => studioText("en") };
});
vi.mock("@/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/client")>()),
  getDb: () => scope.db,
}));

const fee: CheckQuestion = {
  id: "k1",
  prompt: "What may you charge a business client who pays late?",
  options: [
    { id: "a", text: "Nothing" },
    { id: "b", text: "A flat fee of 40 euros" },
    { id: "c", text: "Interest" },
  ],
  correct: ["b", "c"],
  explanation: "Both: the flat fee and interest on top of the base rate.",
};

const reminder: CheckQuestion = {
  id: "k2",
  prompt: "When does the first reminder go out?",
  options: [
    { id: "a", text: "After a week" },
    { id: "b", text: "After a year" },
  ],
  correct: ["a"],
};

describe.skipIf(!hasDatabase)("knowledge checks in lessons", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let courseId: string;
  let author: string;

  beforeAll(async () => {
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    author = await createUser(dbs.owner.db);
    courseId = await createCourse(dbs.app.db, tenant.id, {
      languages: ["en", "de"],
      title: "Get paid on time",
      artifactName: "Reminder playbook",
      outcome: "Write the reminder sequence you will use for late invoices.",
      deliveryMode: "free_async",
    });
    scope.db = dbs.app.db;
    scope.session = { tenant, viewer: { userId: author } };
  });

  afterAll(async () => {
    await dbs?.close();
  });

  const newLesson = (title: string) =>
    createLesson(dbs.app.db, tenant.id, courseId, { locale: "en", title, userId: author });

  const save = (
    lessonId: string,
    questions: CheckQuestion[] | undefined,
    markdown = "Send the first reminder after a week.",
  ) =>
    updateLesson(dbs.app.db, tenant.id, lessonId, {
      title: "Reminders",
      markdown,
      criterionIds: [],
      questions,
      userId: author,
    });

  const editorOf = async (lessonId: string) =>
    (await loadLessonEditor(dbs.app.db, tenant.id, lessonId))!;

  const versionsOf = (lessonId: string) =>
    withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .select({ version: lessonVersions.version, blocks: lessonVersions.blocks })
        .from(lessonVersions)
        .where(eq(lessonVersions.lessonId, lessonId))
        .orderBy(asc(lessonVersions.version)),
    );

  it("saves the questions after the lesson text, in a new version", async () => {
    const lessonId = await newLesson("Reminders");
    expect(await save(lessonId, [fee, reminder])).toEqual({ version: 2, changed: true });

    const editor = await editorOf(lessonId);
    expect(editor.lesson.blocks).toEqual([
      { type: "markdown", markdown: "Send the first reminder after a week." },
      { type: "check", questions: [fee, reminder] },
    ]);
    expect(editor.questions).toEqual([fee, reminder]);
    expect((await versionsOf(lessonId)).map((row) => checkQuestionsOf(row.blocks))).toEqual([
      [],
      [fee, reminder],
    ]);
  });

  it("saves nothing when the questions are unchanged, whatever order jsonb keeps", async () => {
    const lessonId = await newLesson("Unchanged");
    await save(lessonId, [fee]);
    const sameInOtherOrder = {
      explanation: fee.explanation,
      correct: fee.correct,
      options: fee.options.map((option) => ({ text: option.text, id: option.id })),
      prompt: fee.prompt,
      id: fee.id,
    };
    expect(await save(lessonId, [sameInOtherOrder])).toEqual({ version: 2, changed: false });

    expect(await save(lessonId, [{ ...fee, explanation: "Both apply." }])).toEqual({
      version: 3,
      changed: true,
    });
    // Order is content too: learners see the questions as listed.
    await save(lessonId, [fee, reminder]);
    expect(await save(lessonId, [reminder, fee])).toEqual({ version: 5, changed: true });
  });

  it("keeps the questions when a save leaves them out", async () => {
    const lessonId = await newLesson("Kept");
    await save(lessonId, [fee]);
    expect(await save(lessonId, undefined, "A new text.")).toEqual({ version: 3, changed: true });
    expect((await editorOf(lessonId)).questions).toEqual([fee]);
  });

  it("stores no check block for a lesson without questions", async () => {
    const lessonId = await newLesson("Plain");
    await save(lessonId, []);
    expect((await editorOf(lessonId)).lesson.blocks).toEqual([
      { type: "markdown", markdown: "Send the first reminder after a week." },
    ]);

    // Removing the last question removes the block, too.
    await save(lessonId, [reminder]);
    expect(await save(lessonId, [])).toEqual({ version: 4, changed: true });
    expect((await editorOf(lessonId)).lesson.blocks.map((block) => block.type)).toEqual([
      "markdown",
    ]);
  });

  it("restores the questions of an older version, and their absence", async () => {
    const lessonId = await newLesson("Restoring");
    await save(lessonId, [fee]);
    await save(lessonId, [fee, reminder]);

    expect(await restoreLessonVersion(dbs.app.db, tenant.id, lessonId, 2, author)).toEqual({
      version: 4,
      changed: true,
    });
    expect((await editorOf(lessonId)).questions).toEqual([fee]);

    // Version 1 was written before any check.
    expect(await restoreLessonVersion(dbs.app.db, tenant.id, lessonId, 1, author)).toEqual({
      version: 5,
      changed: true,
    });
    const editor = await editorOf(lessonId);
    expect(editor.lesson.blocks).toEqual([{ type: "markdown", markdown: "" }]);
    expect(editor.versions.map((row) => row.version)).toEqual([5, 4, 3, 2, 1]);
    expect(checkQuestionsOf((await versionsOf(lessonId))[3]!.blocks)).toEqual([fee]);
  });

  it("shows a translation's editor the questions of the other language", async () => {
    const original = await newLesson("Late fees");
    await save(original, [fee]);
    const translation = await createLesson(dbs.app.db, tenant.id, courseId, {
      locale: "de",
      title: "Verzugsgebühren",
      translationOf: (await editorOf(original)).lesson.key,
      userId: author,
    });

    const editor = await editorOf(translation);
    // Questions are written in the lesson's language, so a translation starts without them.
    expect(editor.questions).toEqual([]);
    expect(editor.translations.find((row) => row.locale === "en")?.questions).toEqual([fee]);
  });

  describe("saving from the lesson editor", () => {
    function form(lessonId: string, questions: unknown) {
      const data = new FormData();
      data.set("lessonId", lessonId);
      data.set("title", "Late fees");
      data.set("markdown", "Charge the flat fee.");
      data.set("questions", typeof questions === "string" ? questions : JSON.stringify(questions));
      return data;
    }

    it("refuses invalid questions with readable errors and saves nothing", async () => {
      const lessonId = await newLesson("Late fees");
      expect(
        await saveLessonAction({}, form(lessonId, [{ ...fee, prompt: " ", correct: [] }])),
      ).toEqual({
        errors: ["Question 1 has no text yet.", "Question 1: tick at least one right answer."],
      });
      expect(await saveLessonAction({}, form(lessonId, "[{"))).toEqual({
        errors: ["The knowledge check could not be read. Reload the page and try again."],
      });
      const tooMany = Array.from({ length: 11 }, (_, index) => ({ ...reminder, id: `q${index}` }));
      expect((await saveLessonAction({}, form(lessonId, tooMany))).errors).toEqual([
        "A lesson can have up to 10 knowledge check questions.",
      ]);
      expect((await editorOf(lessonId)).lesson.version).toBe(1);
    });

    it("saves valid questions the way the editor spells them, and checks their wording", async () => {
      const lessonId = await newLesson("Late fees");
      const typed = [
        { ...fee, prompt: `  ${fee.prompt} `, correct: ["c", "b"] },
        { ...reminder, prompt: "When does a certified reminder go out?", explanation: "  " },
      ];
      const result = await saveLessonAction({}, form(lessonId, typed));
      expect(result).toMatchObject({ ok: true, message: "Saved as version 2." });
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings?.[0]).toContain("“certified” should be avoided in lesson text.");
      expect((await editorOf(lessonId)).questions).toEqual([
        fee,
        { ...reminder, prompt: "When does a certified reminder go out?" },
      ]);

      // The same check again is no change.
      expect(await saveLessonAction({}, form(lessonId, typed))).toMatchObject({
        ok: true,
        message: "No changes to save.",
      });
    });

    it("leaves the questions alone when the form has none", async () => {
      const lessonId = await newLesson("Late fees");
      await save(lessonId, [fee]);
      const data = form(lessonId, []);
      data.delete("questions");
      expect(await saveLessonAction({}, data)).toMatchObject({ ok: true });
      expect((await editorOf(lessonId)).questions).toEqual([fee]);
    });
  });
});

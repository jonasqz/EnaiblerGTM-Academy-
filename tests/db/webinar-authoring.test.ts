import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseQaExport, qaText } from "@/core/authoring/qa";
import type { TenantContext } from "@/core/tenant/context";
import { aiUsage, lessons, sources } from "@/db/schema";
import type { TranscriptSegment } from "@/db/schema/authoring";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import { setAiAllowance } from "@/server/ai-allowance";
import { draftFaqLesson } from "@/server/authoring/faq";
import type { AuthoringModel } from "@/server/authoring/model";
import { draftCheckQuestions, draftTestQuestions } from "@/server/authoring/quiz-drafting";
import { createSource, extractSource, listSources } from "@/server/authoring/sources";
import type { Enqueue } from "@/server/jobs/producer";
import type { LlmCallOptions } from "@/server/llm";
import { createCourse, loadCourseEditor } from "@/server/studio/courses";
import { saveCourseTest } from "@/server/studio/tests";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

/*
 * Webinar → course authoring (webinar brief §2.1) with a fake model that
 * answers by structured-output schema name. Recordings are stored as
 * transcribed sources directly: transcription itself is tested in
 * authoring.test.ts.
 */

type Answer = unknown | ((options: LlmCallOptions) => unknown);

function fakeModel(answers: Record<string, Answer>, calls: LlmCallOptions[]): AuthoringModel {
  return {
    model: "fake-authoring",
    llm: async (options) => {
      calls.push(options);
      const name = options.jsonSchema?.name ?? "";
      const answer = answers[name];
      if (answer === undefined) throw new Error(`No fake answer for ${name}`);
      const content = typeof answer === "function" ? answer(options) : answer;
      return {
        content: typeof content === "string" ? content : JSON.stringify(content),
        model: "fake-authoring",
        tokensIn: 1000,
        tokensOut: 300,
        cost: 0.01,
        latencyMs: 3,
      };
    },
  };
}

const promptOf = (call: LlmCallOptions | undefined) =>
  (call?.messages ?? []).map((message) => message.content).join("\n");

describe.skipIf(!hasDatabase)("webinar → course authoring", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let author: string;
  const enqueue: Enqueue = async () => undefined;

  beforeAll(async () => {
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    author = await createUser(dbs.owner.db);
  });

  afterAll(async () => {
    await dbs?.close();
  });

  async function newCourse(languages: Array<"en" | "de"> = ["en", "de"]) {
    return createCourse(dbs.app.db, tenant.id, {
      languages,
      title: "Get paid on time",
      artifactName: "Reminder playbook",
      outcome: "Write the reminder sequence you will use for late invoices.",
      deliveryMode: "free_async",
    });
  }

  /** A webinar recording as the transcription job leaves it. */
  async function recording(courseId: string, title: string, transcript: TranscriptSegment[]) {
    const [row] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .insert(sources)
        .values({
          tenantId: tenant.id,
          courseId,
          kind: "recording",
          status: "ready",
          title,
          locale: "en",
          transcript,
          content: transcript.map((topic) => topic.text).join("\n\n"),
          createdBy: author,
        })
        .returning({ id: sources.id }),
    );
    return row!.id;
  }

  async function qaSource(courseId: string, exported: string) {
    const id = await createSource(
      dbs.app.db,
      tenant.id,
      {
        courseId,
        kind: "qa",
        title: "Live Q&A",
        locale: "en",
        content: qaText(parseQaExport(exported)),
        createdBy: author,
      },
      enqueue,
    );
    await extractSource(dbs.app.db, tenant.id, id, { finalAttempt: true });
    return id;
  }

  const usageOf = (courseId: string) =>
    withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(aiUsage).where(eq(aiUsage.courseId, courseId)),
    );

  it("takes a live Q&A as a source and drafts an FAQ lesson from it", async () => {
    const courseId = await newCourse();
    await recording(courseId, "Webinar: Reminders", [
      {
        startSec: 0,
        endSec: 120,
        title: "Late fees",
        text: "In Germany you may charge a business client a flat fee of 40 euros.",
      },
    ]);
    const exported = [
      "#,Question,Asker Name,Asker Email,Answer(s)",
      '1,"How soon do I send the first reminder?",Jane Doe,jane@example.com,"Answered by Host: Three days after the due date."',
      '2,"Can I charge a late fee?",Max,max@example.com,',
      '3,"Will the slides be shared?",Kim,kim@example.com,',
    ].join("\n");
    const sourceId = await qaSource(courseId, exported);
    const listed = (await listSources(dbs.app.db, tenant.id, courseId)).find(
      (row) => row.id === sourceId,
    );
    expect(listed).toMatchObject({ kind: "qa", status: "ready", questions: 3 });
    const [stored] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(sources).where(eq(sources.id, sourceId)),
    );
    // Only questions and answers were kept.
    expect(stored?.content).not.toMatch(/Jane|Max|Kim|example\.com/);

    const calls: LlmCallOptions[] = [];
    const model = fakeModel(
      {
        faq_lesson: {
          title: "Questions from the webinar",
          intro: "What attendees asked, answered.",
          entries: [
            {
              question: "How soon does the first reminder go out?",
              answer:
                "Three days after the due date: short, friendly, with the amount and the invoice number.",
              refs: ["Q1"],
            },
            {
              question: "Can I charge a late fee?",
              answer:
                "Yes. A business client who pays late owes a flat fee of 40 euros in Germany.",
              refs: ["Q2", "S1"],
            },
          ],
          open: ["Q3"],
          notes: [],
        },
      },
      calls,
    );
    const result = await draftFaqLesson(
      dbs.app.db,
      tenant.id,
      { sourceId, locale: "en", requestedBy: author },
      model,
    );
    expect(result).toMatchObject({
      ok: true,
      open: ["Will the slides be shared?"],
      fallback: null,
    });
    // Unanswered questions go to the model with the passages that may answer them.
    expect(promptOf(calls[0])).toContain("flat fee of 40 euros");
    expect(promptOf(calls[0])).toContain("Q2: Can I charge a late fee?\nLive answer: (none)");

    const [lesson] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .select()
        .from(lessons)
        .where(
          and(eq(lessons.courseId, courseId), eq(lessons.id, result.ok ? result.lessonId : "")),
        ),
    );
    expect(lesson).toMatchObject({
      title: "Questions from the webinar",
      locale: "en",
      version: 1,
      sourceIds: [sourceId],
    });
    const markdown = (lesson!.blocks[0] as { markdown: string }).markdown;
    expect(markdown).toContain("### Can I charge a late fee?");
    expect(markdown).not.toContain("slides");
    expect((await usageOf(courseId)).map((row) => row.kind)).toContain("lesson_draft");

    // Without a model the questions answered live go in as they were asked.
    const plain = await draftFaqLesson(
      dbs.app.db,
      tenant.id,
      { sourceId, locale: "en", requestedBy: author },
      null,
    );
    expect(plain).toMatchObject({
      ok: true,
      fallback: "gateway_missing",
      open: ["Can I charge a late fee?", "Will the slides be shared?"],
    });
    // A model that answers nonsense falls back too, and says why.
    const broken = await draftFaqLesson(
      dbs.app.db,
      tenant.id,
      { sourceId, locale: "en", requestedBy: author },
      fakeModel({ faq_lesson: "not json" }, []),
    );
    expect(broken).toMatchObject({ ok: true, fallback: "invalid_drafts" });
  });

  it("drafts final-test questions from the sources, citing the chapter each comes from", async () => {
    const courseId = await newCourse();
    await recording(courseId, "Webinar: Reminders", [
      {
        startSec: 0,
        endSec: 130,
        title: "The first reminder",
        text: "Send the first reminder three days after the due date. Keep it friendly and short.",
      },
      {
        startSec: 130,
        endSec: 300,
        title: "Late fees",
        text: "A business client who pays late owes a flat fee of 40 euros.",
      },
    ]);
    const calls: LlmCallOptions[] = [];
    const question = (ref: string, en: string, de: string) => ({
      prompt: { en, de },
      options: [
        {
          text: { en: "Three days after the due date", de: "Drei Tage nach Fälligkeit" },
          correct: true,
        },
        { text: { en: "A month later", de: "Einen Monat später" }, correct: false },
        { text: { en: "Never", de: "Nie" }, correct: false },
      ],
      explanation: { en: "The webinar says three days.", de: "Das Webinar sagt drei Tage." },
      source_ref: ref,
    });
    const model = fakeModel(
      {
        quiz_draft: {
          questions: [
            question(
              "C1",
              "When does the first reminder go out?",
              "Wann geht die erste Erinnerung raus?",
            ),
            question("C9", "When do you send it?", "Wann schickst du sie?"),
          ],
          notes: [],
        },
      },
      calls,
    );

    const result = await draftTestQuestions(dbs.app.db, tenant.id, courseId, { count: 5 }, model);
    expect(result).toMatchObject({ ok: true });
    const questions = result.ok ? result.questions : [];
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({
      prompt: {
        en: "When does the first reminder go out?",
        de: "Wann geht die erste Erinnerung raus?",
      },
      explanation: { en: "The webinar says three days." },
      source: "Webinar: Reminders · The first reminder (0:00–2:10)",
    });
    // An unknown ref is no source, not a made-up one.
    expect(questions[1]).not.toHaveProperty("source");
    expect(calls[0]?.jsonSchema?.name).toBe("quiz_draft");
    expect(promptOf(calls[0])).toContain("C2 · Webinar: Reminders · Late fees (2:10–5:00)");
    expect((await usageOf(courseId)).map((row) => row.kind)).toEqual(["question_draft"]);
    // Nothing is saved: the test is as it was.
    expect(
      (await loadCourseEditor(dbs.app.db, tenant.id, courseId))?.test?.questions ?? [],
    ).toEqual([]);

    // Saved as drafted, they are a valid test.
    await saveCourseTest(dbs.app.db, tenant.id, courseId, {
      questions,
      passPercent: 80,
      showMistakes: true,
    });

    expect(await draftTestQuestions(dbs.app.db, tenant.id, courseId, { count: 5 }, null)).toEqual({
      ok: false,
      error: "gateway_missing",
    });
    const empty = await newCourse(["en"]);
    expect(await draftTestQuestions(dbs.app.db, tenant.id, empty, { count: 5 }, model)).toEqual({
      ok: false,
      error: "no_sources",
    });
    expect(
      await draftTestQuestions(
        dbs.app.db,
        tenant.id,
        courseId,
        { count: 5 },
        fakeModel({ quiz_draft: { questions: [], notes: [] } }, []),
      ),
    ).toEqual({ ok: false, error: "invalid_drafts" });
  });

  it("drafts practice questions for a lesson and stops when the allowance is used up", async () => {
    const other = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    const courseId = await createCourse(dbs.app.db, other.id, {
      languages: ["de"],
      title: "Pünktlich bezahlt werden",
      artifactName: "Mahnplan",
      outcome: "Schreib deinen Mahnplan.",
      deliveryMode: "free_async",
    });
    const markdown =
      "## Die erste Erinnerung\n\nSchick die erste Erinnerung drei Tage nach Fälligkeit. Nenn den Betrag, die Rechnungsnummer und ein neues Datum. Bleib freundlich: Die meisten Kunden haben es einfach vergessen.";
    const calls: LlmCallOptions[] = [];
    const model = fakeModel(
      {
        check_draft: {
          questions: [
            {
              prompt: "Wann geht die erste Erinnerung raus?",
              options: [
                { text: "Drei Tage nach Fälligkeit", correct: true },
                { text: "Nach einem Monat", correct: false },
              ],
              explanation: "Früh, aber nicht am selben Tag.",
            },
          ],
        },
      },
      calls,
    );
    const input = {
      courseId,
      lessonId: "00000000-0000-4000-8000-000000000001",
      locale: "de" as const,
      title: "Die erste Erinnerung",
      markdown,
      existing: [],
      count: 3,
    };
    const drafted = await draftCheckQuestions(dbs.app.db, other.id, input, model);
    expect(drafted).toMatchObject({
      ok: true,
      questions: [
        { prompt: "Wann geht die erste Erinnerung raus?", explanation: expect.any(String) },
      ],
    });
    expect(promptOf(calls[0])).toContain("drei Tage nach Fälligkeit");
    expect(
      await draftCheckQuestions(dbs.app.db, other.id, { ...input, markdown: "Kurz." }, model),
    ).toEqual({ ok: false, error: "no_lesson_text" });

    await setAiAllowance(dbs.app.db, other.slug, { kind: "amount", microUsd: 0 });
    expect(await draftCheckQuestions(dbs.app.db, other.id, input, model)).toEqual({
      ok: false,
      error: "ai_allowance_used_up",
    });
    expect(calls).toHaveLength(1);
  });

  it("refuses an FAQ without questions or answers", async () => {
    const courseId = await newCourse(["en"]);
    const unanswered = await qaSource(courseId, "Can I charge a late fee?\nIs there a recording?");
    expect(
      await draftFaqLesson(
        dbs.app.db,
        tenant.id,
        { sourceId: unanswered, locale: "en", requestedBy: author },
        null,
      ),
    ).toEqual({ ok: false, error: "no_answers" });
  });
});

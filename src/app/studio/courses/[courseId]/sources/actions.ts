"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { FormState } from "@/app/studio/actions";
import { text } from "@/app/studio/form-data";
import { defaultQuestions, interviewText } from "@/core/authoring/interview";
import { parseQaExport, qaText } from "@/core/authoring/qa";
import { isLocale, localize, type Locale } from "@/core/i18n/locales";
import { draftErrorText, jobErrorText } from "@/core/i18n/studio/helpers";
import { rubricSchema } from "@/core/review/rubric";
import { AiAllowanceUsedUp } from "@/core/usage/allowance";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { draftFaqLesson } from "@/server/authoring/faq";
import { suggestInterviewQuestions } from "@/server/authoring/interview";
import { requestLessonDraft } from "@/server/authoring/lesson-drafting";
import { authoringModel, meteredModel } from "@/server/authoring/model";
import { createSource, deleteSource, loadSource, recheckSource } from "@/server/authoring/sources";
import { normalizeWebsite } from "@/server/brand/import";
import { loadFile } from "@/server/files";
import { enqueue } from "@/server/jobs/producer";
import { rateLimit } from "@/server/rate-limit";
import { getCourseEditor } from "@/server/studio/course-context";
import { getStudioText } from "@/server/studio-text";

const HOUR = 60 * 60_000;

async function courseFor(formData: FormData) {
  const courseId = z.uuid().parse(text(formData, "courseId"));
  const session = await requireCapability("courses.edit", `/studio/courses/${courseId}/sources`);
  const editor = await getCourseEditor(session.tenant.id, courseId);
  if (!editor) throw new Error("Course not found");
  const languages = editor.course.languages.filter(isLocale);
  return { ...session, editor, courseId, languages };
}

/** Adds a recording, document or web page; reading it happens in the background. */
export async function addSourceAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant, viewer, courseId, languages } = await courseFor(formData);
  const t = await getStudioText();
  const kind = text(formData, "kind");
  const locale = text(formData, "locale");
  const sourceLocale: Locale | null = isLocale(locale) ? locale : (languages[0] ?? null);

  if (kind === "recording" || kind === "document") {
    const fileId = text(formData, "fileId");
    const record = fileId ? await loadFile(getDb(), tenant.id, fileId) : null;
    if (!record || record.purpose !== "source") {
      return { errors: [t.t("lessons.addSource.uploadFirst")] };
    }
    const family = record.contentType.split("/")[0];
    const isMedia = family === "video" || family === "audio";
    if ((kind === "recording") !== isMedia) {
      return {
        errors: [
          kind === "recording"
            ? t.t("lessons.addSource.notMedia")
            : t.t("lessons.addSource.mediaAsDocument"),
        ],
      };
    }
    await createSource(
      getDb(),
      tenant.id,
      {
        courseId,
        kind,
        title: text(formData, "title") || record.name.replace(/\.[^.]+$/, ""),
        locale: sourceLocale,
        fileId: record.id,
        createdBy: viewer.userId,
      },
      enqueue,
    );
  } else if (kind === "url") {
    const url = normalizeWebsite(text(formData, "url"));
    if (!url) return { errors: [t.t("lessons.addSource.urlInvalid")] };
    await createSource(
      getDb(),
      tenant.id,
      {
        courseId,
        kind: "url",
        title: text(formData, "title") || url.toString(),
        locale: sourceLocale,
        url: url.toString(),
        createdBy: viewer.userId,
      },
      enqueue,
    );
  } else if (kind === "qa") {
    // Parsed here, so names and addresses in the export are never stored.
    const pairs = parseQaExport(text(formData, "qa"));
    if (pairs.length === 0) return { errors: [t.t("drafts.qa.empty")] };
    await createSource(
      getDb(),
      tenant.id,
      {
        courseId,
        kind: "qa",
        title: text(formData, "title") || t.t("drafts.qa.defaultTitle"),
        locale: sourceLocale,
        content: qaText(pairs),
        createdBy: viewer.userId,
      },
      enqueue,
    );
    revalidatePath(`/studio/courses/${courseId}/sources`);
    return { ok: true, message: t.n("drafts.qa.added", pairs.length) };
  } else {
    return { errors: [t.t("lessons.addSource.chooseKind")] };
  }
  revalidatePath(`/studio/courses/${courseId}/sources`);
  return {
    ok: true,
    message:
      kind === "recording"
        ? t.t("lessons.addSource.recordingAdded")
        : t.t("lessons.addSource.added"),
  };
}

export type FaqState =
  | { status: "done"; lessonId: string; open: string[]; notes: string[]; fallback: string | null }
  | { status: "error"; message: string };

/** An FAQ lesson from a live Q&A source (core/authoring/faq); the lesson opens for editing. */
export async function draftFaqAction(formData: FormData): Promise<FaqState> {
  const { tenant, viewer, courseId, languages } = await courseFor(formData);
  const t = await getStudioText();
  const sourceId = z.uuid().parse(text(formData, "sourceId"));
  const locale = text(formData, "locale");
  if (!isLocale(locale) || !languages.includes(locale)) throw new Error("Unknown course language");
  const source = await loadSource(getDb(), tenant.id, sourceId);
  if (source?.courseId !== courseId || source.kind !== "qa") {
    return { status: "error", message: jobErrorText(t, "file_missing")! };
  }
  const model = authoringModel();
  // Without the AI nothing is spent: only drafts that call the model count against the hour.
  if (model && !rateLimit(`faq-draft:${tenant.id}`, 10, HOUR)) {
    return { status: "error", message: t.t("drafts.rateLimited") };
  }
  const result = await draftFaqLesson(
    getDb(),
    tenant.id,
    { sourceId, locale, requestedBy: viewer.userId },
    model,
  );
  if (!result.ok) return { status: "error", message: draftErrorText(t, result.error) };
  revalidatePath(`/studio/courses/${courseId}`, "layout");
  return {
    status: "done",
    lessonId: result.lessonId,
    open: result.open,
    notes: result.notes,
    // Without a gateway the panel already says the questions go in as asked.
    fallback:
      result.fallback && result.fallback !== "gateway_missing"
        ? jobErrorText(t, result.fallback)
        : null,
  };
}

export async function deleteSourceAction(formData: FormData): Promise<void> {
  const { tenant, courseId } = await courseFor(formData);
  const sourceId = z.uuid().parse(text(formData, "sourceId"));
  const source = await loadSource(getDb(), tenant.id, sourceId);
  if (source?.courseId === courseId) await deleteSource(getDb(), tenant.id, sourceId);
  revalidatePath(`/studio/courses/${courseId}/sources`);
  redirect(`/studio/courses/${courseId}/sources`);
}

export type QuestionsState = { questions: string[]; message?: string };

/** Questions tailored to this course's artifact and criteria (defaults without a model). */
export async function suggestQuestionsAction(formData: FormData): Promise<QuestionsState> {
  const { tenant, editor, courseId, languages } = await courseFor(formData);
  const locale = isLocale(text(formData, "locale"))
    ? (text(formData, "locale") as Locale)
    : languages[0]!;
  const artifact = localize(editor.assignment?.artifactName, locale, languages);
  const model = authoringModel();
  if (!model || !editor.assignment || !editor.rubric) {
    return { questions: defaultQuestions(locale, artifact) };
  }
  const t = await getStudioText();
  if (!rateLimit(`interview:${tenant.id}`, 20, HOUR)) {
    return {
      questions: defaultQuestions(locale, artifact),
      message: t.t("lessons.interview.limit"),
    };
  }
  const rubric = rubricSchema.parse(editor.rubric.definition);
  const metered = meteredModel(getDb(), model, {
    tenantId: tenant.id,
    kind: "interview",
    courseId,
  });
  let questions: string[] | null;
  try {
    questions = await suggestInterviewQuestions(metered, {
      locale,
      artifactName: artifact,
      assignmentPrompt: localize(editor.assignment.prompt, locale, languages),
      criteria: rubric.criteria.map((criterion) => ({
        label: localize(criterion.label, locale, languages),
        description: localize(criterion.description, locale, languages),
      })),
    });
  } catch (error) {
    if (!(error instanceof AiAllowanceUsedUp)) throw error;
    return {
      questions: defaultQuestions(locale, artifact),
      message: t.t("lessons.interview.allowance"),
    };
  }
  return questions
    ? { questions }
    : {
        questions: defaultQuestions(locale, artifact),
        message: t.t("lessons.interview.standard"),
      };
}

export async function saveInterviewAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant, viewer, courseId, languages } = await courseFor(formData);
  const t = await getStudioText();
  const questions = formData.getAll("question").map(String);
  const answers = formData.getAll("answer").map(String);
  const content = interviewText(
    questions.map((question, index) => ({ question, answer: answers[index] ?? "" })),
  );
  if (content.length < 40) return { errors: [t.t("lessons.interview.answerOne")] };
  const locale = text(formData, "locale");
  await createSource(
    getDb(),
    tenant.id,
    {
      courseId,
      kind: "interview",
      title: text(formData, "title") || t.t("lessons.interview.title"),
      locale: isLocale(locale) ? locale : (languages[0] ?? null),
      content: content.slice(0, 100_000),
      createdBy: viewer.userId,
    },
    enqueue,
  );
  revalidatePath(`/studio/courses/${courseId}/sources`);
  redirect(`/studio/courses/${courseId}/sources?interview=1`);
}

/** Starts "Draft lessons with AI"; the Lessons page shows the run. */
export async function draftLessonsAction(formData: FormData): Promise<void> {
  const { tenant, viewer, courseId, languages } = await courseFor(formData);
  const locale = text(formData, "locale");
  if (!isLocale(locale) || !languages.includes(locale)) throw new Error("Unknown course language");
  if (!rateLimit(`lesson-draft:${tenant.id}`, 10, HOUR)) {
    redirect(`/studio/courses/${courseId}/lessons?error=draft-limit`);
  }
  await requestLessonDraft(
    getDb(),
    tenant.id,
    { courseId, locale, requestedBy: viewer.userId },
    enqueue,
  );
  revalidatePath(`/studio/courses/${courseId}/lessons`);
  redirect(`/studio/courses/${courseId}/lessons?drafting=1`);
}

/** "Check now": reads a web page source again instead of waiting for the daily round. */
export async function recheckSourceAction(formData: FormData): Promise<void> {
  const { tenant, courseId } = await courseFor(formData);
  const sourceId = z.uuid().parse(text(formData, "sourceId"));
  const source = await loadSource(getDb(), tenant.id, sourceId);
  if (!source || source.courseId !== courseId) redirect(`/studio/courses/${courseId}/sources`);
  const outcome = rateLimit(`source-check:${tenant.id}`, 30, HOUR)
    ? await recheckSource(getDb(), tenant.id, sourceId)
    : "limit";
  revalidatePath(`/studio/courses/${courseId}`, "layout");
  revalidatePath("/studio");
  redirect(`/studio/courses/${courseId}/sources?checked=${outcome}`);
}

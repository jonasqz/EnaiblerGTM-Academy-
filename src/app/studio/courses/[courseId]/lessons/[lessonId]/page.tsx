import { ArrowLeft, CircleCheck, Plus, RotateCcw } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import {
  createLessonAction,
  markLessonReviewedAction,
  restoreLessonVersionAction,
  setLessonSourcesAction,
} from "@/app/studio/actions";
import { LessonEditor } from "@/app/studio/courses/[courseId]/lessons/[lessonId]/lesson-editor";
import { knowledgeCheckLabels } from "@/components/knowledge-check-labels";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { changedSourceOf } from "@/core/authoring/auto-update";
import { isLocale, localize } from "@/core/i18n/locales";
import { languageName } from "@/core/i18n/studio/helpers";
import { tenantTranslator } from "@/core/i18n/tenant-translator";
import { requiresWork } from "@/core/courses/completion";
import { rubricSchema } from "@/core/review/rubric";
import { themeToCssVariables } from "@/core/theme/css";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { loadLessonEditor, markdownOf } from "@/server/studio/lessons";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("lessons.editor.title") };
}

export default async function LessonEditorPage({
  params,
  searchParams,
}: PageProps<"/studio/courses/[courseId]/lessons/[lessonId]">) {
  const { courseId, lessonId } = await params;
  const { restored, translation, v } = await searchParams;
  const { tenant } = await requireCapability(
    "courses.edit",
    `/studio/courses/${courseId}/lessons/${lessonId}`,
  );
  if (!z.uuid().safeParse(lessonId).success) notFound();
  const data = await loadLessonEditor(getDb(), tenant.id, lessonId);
  if (!data || data.course.id !== courseId || !isLocale(data.lesson.locale)) notFound();
  const { lesson, course } = data;
  const locale = data.lesson.locale;
  const rubric = data.rubric ? rubricSchema.parse(data.rubric.definition) : null;
  const courseLanguages = course.languages.filter(isLocale);
  const others = data.translations.filter((row) => row.id !== lesson.id);
  const reference = others.find((row) => row.locale === courseLanguages[0]) ?? others[0] ?? null;
  const missing = courseLanguages.filter(
    (language) => !data.translations.some((row) => row.locale === language),
  );
  const changedSource = data.sources.find((row) => row.id === changedSourceOf(lesson.flagReason));
  const t = await getStudioText();
  // The source's link sits inside the sentence, wherever the language puts it.
  const [changedBefore, changedAfter] = lesson.flaggedAt
    ? t
        .t("lessons.editor.changed.named", { date: t.date(lesson.flaggedAt, "dateTime") })
        .split("{source}")
    : [];

  return (
    <div className="space-y-6">
      <Link
        href={`/studio/courses/${courseId}/lessons`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> {t.t("lessons.editor.back")}
      </Link>

      {typeof restored === "string" && (
        <Notice tone="good" title={t.t("lessons.editor.restored", { version: restored })}>
          {t.t("lessons.editor.restoredBody")}
        </Notice>
      )}
      {translation === "1" && (
        <Notice
          tone="info"
          title={t.t("lessons.editor.newTranslation", { language: languageName(t, locale) })}
        >
          {t.t("lessons.editor.newTranslationBody")}
        </Notice>
      )}

      {lesson.flaggedAt && (
        <Notice tone="warning" title={t.t("lessons.editor.changed.title")}>
          <p>
            {changedSource ? (
              <>
                {changedBefore}
                <Link
                  href={`/studio/courses/${courseId}/sources/${changedSource.id}` as Route}
                  className="font-semibold underline"
                >
                  {changedSource.title}
                </Link>
                {changedAfter}
              </>
            ) : (
              t.t("lessons.editor.changed.unnamed", {
                date: t.date(lesson.flaggedAt, "dateTime"),
              })
            )}
          </p>
          <form action={markLessonReviewedAction} className="pt-2">
            <input type="hidden" name="lessonId" value={lesson.id} />
            <SubmitButton className="btn btn-secondary btn-sm" pendingLabel={t.t("common.saving")}>
              <CircleCheck aria-hidden size={16} /> {t.t("lessons.editor.markReviewed")}
            </SubmitButton>
          </form>
        </Notice>
      )}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <LessonEditor
          courseId={courseId}
          key={typeof v === "string" ? `restored-${v}` : "editor"}
          lessonId={lesson.id}
          locale={locale}
          title={lesson.title}
          markdown={markdownOf(lesson.blocks)}
          criteria={
            requiresWork(data.course.completionMode)
              ? (rubric?.criteria ?? []).map((criterion) => ({
                  id: criterion.id,
                  label: localize(criterion.label, locale),
                  description: localize(criterion.description, locale),
                }))
              : null
          }
          selected={lesson.criterionIds}
          questions={data.questions}
          academyTheme={themeToCssVariables(tenant.theme)}
          checkLabels={knowledgeCheckLabels(tenantTranslator(tenant, locale))}
          reference={
            reference && isLocale(reference.locale)
              ? {
                  locale: reference.locale,
                  title: reference.title,
                  markdown: markdownOf(reference.blocks),
                  questions: reference.questions,
                }
              : null
          }
        />

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section aria-labelledby="languages-heading" className="card-flat space-y-3 p-4">
            <h2 id="languages-heading" className="font-semibold">
              {t.t("lessons.editor.languages")}
            </h2>
            <ul className="space-y-1 text-sm">
              {data.translations.map((row) => (
                <li key={row.id}>
                  {row.id === lesson.id ? (
                    <span className="font-semibold">
                      {t.t("lessons.editor.thisOne", { language: languageName(t, row.locale) })}
                    </span>
                  ) : (
                    <Link
                      href={`/studio/courses/${courseId}/lessons/${row.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {languageName(t, row.locale)}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            {missing.map((language) => (
              <form key={language} action={createLessonAction}>
                <input type="hidden" name="courseId" value={courseId} />
                <input type="hidden" name="locale" value={language} />
                <input type="hidden" name="translationOf" value={lesson.key} />
                <input type="hidden" name="title" value={lesson.title} />
                <SubmitButton
                  className="btn btn-secondary btn-sm"
                  pendingLabel={t.t("common.adding")}
                >
                  <Plus aria-hidden size={14} />{" "}
                  {t.t("lessons.editor.addLanguage", { language: languageName(t, language) })}
                </SubmitButton>
              </form>
            ))}
          </section>

          {data.sources.length > 0 && (
            <section aria-labelledby="sources-heading" className="card-flat space-y-3 p-4">
              <div className="space-y-1">
                <h2 id="sources-heading" className="font-semibold">
                  {t.t("lessons.editor.basedOn")}
                </h2>
                <p className="text-xs text-muted">{t.t("lessons.editor.basedOnHint")}</p>
              </div>
              <form action={setLessonSourcesAction} className="space-y-2">
                <input type="hidden" name="lessonId" value={lesson.id} />
                {data.sources.map((source) => (
                  <label key={source.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="sourceId"
                      value={source.id}
                      defaultChecked={lesson.sourceIds.includes(source.id)}
                      className="mt-1"
                    />
                    <span className="min-w-0 break-words">{source.title}</span>
                  </label>
                ))}
                <SubmitButton
                  className="btn btn-secondary btn-sm"
                  pendingLabel={t.t("common.saving")}
                >
                  {t.t("lessons.editor.saveSources")}
                </SubmitButton>
              </form>
            </section>
          )}

          <section aria-labelledby="history-heading" className="card-flat space-y-3 p-4">
            <h2 id="history-heading" className="font-semibold">
              {t.t("lessons.editor.history")}
            </h2>
            <ol className="space-y-2">
              {data.versions.map((version) => (
                <li
                  key={version.version}
                  className="flex items-start justify-between gap-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {t.t("lessons.version", { version: version.version })}
                      {version.version === lesson.version && (
                        <span className="font-normal text-muted">
                          {" "}
                          · {t.t("lessons.editor.current")}
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted">
                      {t.date(version.createdAt, "dateTime")}
                    </span>
                    <span className="block truncate text-xs text-muted">{version.title}</span>
                  </span>
                  {version.version !== lesson.version && (
                    <form action={restoreLessonVersionAction}>
                      <input type="hidden" name="lessonId" value={lesson.id} />
                      <input type="hidden" name="version" value={version.version} />
                      <SubmitButton
                        className="btn btn-ghost btn-sm"
                        title={t.t("lessons.editor.restore", { version: version.version })}
                        confirm={t.t("lessons.editor.restoreConfirm", {
                          version: version.version,
                        })}
                      >
                        <RotateCcw aria-hidden size={16} />
                      </SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

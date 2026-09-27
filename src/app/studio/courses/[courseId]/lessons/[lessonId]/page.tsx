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
import { LANGUAGE_NAMES } from "@/components/studio/language-names";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { changedSourceOf } from "@/core/authoring/auto-update";
import { isLocale, localize } from "@/core/i18n/locales";
import { rubricSchema } from "@/core/review/rubric";
import { themeToCssVariables } from "@/core/theme/css";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { loadLessonEditor, markdownOf } from "@/server/studio/lessons";

export const metadata: Metadata = { title: "Edit lesson" };

const when = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

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

  return (
    <div className="space-y-6">
      <Link
        href={`/studio/courses/${courseId}/lessons`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> All lessons
      </Link>

      {typeof restored === "string" && (
        <Notice tone="good" title={`Version ${restored} restored`}>
          It is now the newest version; the history keeps every earlier one.
        </Notice>
      )}
      {translation === "1" && (
        <Notice tone="info" title={`New ${LANGUAGE_NAMES[locale]} version`}>
          Translate the title and write the text. The original is below the editor for reference.
        </Notice>
      )}

      {lesson.flaggedAt && (
        <Notice tone="warning" title="A source of this lesson changed">
          <p>
            {changedSource ? (
              <>
                <Link
                  href={`/studio/courses/${courseId}/sources/${changedSource.id}` as Route}
                  className="font-semibold underline"
                >
                  {changedSource.title}
                </Link>{" "}
                changed
              </>
            ) : (
              "A source changed"
            )}{" "}
            on {when.format(lesson.flaggedAt)}, after this lesson was written. Check that the lesson
            still holds, then mark it as reviewed.
          </p>
          <form action={markLessonReviewedAction} className="pt-2">
            <input type="hidden" name="lessonId" value={lesson.id} />
            <SubmitButton className="btn btn-secondary btn-sm" pendingLabel="Saving…">
              <CircleCheck aria-hidden size={16} /> Mark as reviewed
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
          criteria={(rubric?.criteria ?? []).map((criterion) => ({
            id: criterion.id,
            label: localize(criterion.label, locale),
            description: localize(criterion.description, locale),
          }))}
          selected={lesson.criterionIds}
          academyTheme={themeToCssVariables(tenant.theme)}
          reference={
            reference && isLocale(reference.locale)
              ? {
                  locale: reference.locale,
                  title: reference.title,
                  markdown: markdownOf(reference.blocks),
                }
              : null
          }
        />

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section aria-labelledby="languages-heading" className="card-flat space-y-3 p-4">
            <h2 id="languages-heading" className="font-semibold">
              Languages
            </h2>
            <ul className="space-y-1 text-sm">
              {data.translations.map((row) => (
                <li key={row.id}>
                  {row.id === lesson.id ? (
                    <span className="font-semibold">
                      {isLocale(row.locale) ? LANGUAGE_NAMES[row.locale] : row.locale} (this one)
                    </span>
                  ) : (
                    <Link
                      href={`/studio/courses/${courseId}/lessons/${row.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {isLocale(row.locale) ? LANGUAGE_NAMES[row.locale] : row.locale}
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
                <SubmitButton className="btn btn-secondary btn-sm" pendingLabel="Adding…">
                  <Plus aria-hidden size={14} /> Add {LANGUAGE_NAMES[language]}
                </SubmitButton>
              </form>
            ))}
          </section>

          {data.sources.length > 0 && (
            <section aria-labelledby="sources-heading" className="card-flat space-y-3 p-4">
              <div className="space-y-1">
                <h2 id="sources-heading" className="font-semibold">
                  Based on
                </h2>
                <p className="text-xs text-muted">
                  Web pages are read again every day. When one of them changes, this lesson is
                  flagged for review.
                </p>
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
                <SubmitButton className="btn btn-secondary btn-sm" pendingLabel="Saving…">
                  Save sources
                </SubmitButton>
              </form>
            </section>
          )}

          <section aria-labelledby="history-heading" className="card-flat space-y-3 p-4">
            <h2 id="history-heading" className="font-semibold">
              Version history
            </h2>
            <ol className="space-y-2">
              {data.versions.map((version) => (
                <li
                  key={version.version}
                  className="flex items-start justify-between gap-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      Version {version.version}
                      {version.version === lesson.version && (
                        <span className="font-normal text-muted"> · current</span>
                      )}
                    </span>
                    <span className="block text-xs text-muted">
                      {when.format(version.createdAt)}
                    </span>
                    <span className="block truncate text-xs text-muted">{version.title}</span>
                  </span>
                  {version.version !== lesson.version && (
                    <form action={restoreLessonVersionAction}>
                      <input type="hidden" name="lessonId" value={lesson.id} />
                      <input type="hidden" name="version" value={version.version} />
                      <SubmitButton
                        className="btn btn-ghost btn-sm"
                        title={`Restore version ${version.version}`}
                        confirm={`Restore version ${version.version}? Unsaved changes in the editor are lost.`}
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

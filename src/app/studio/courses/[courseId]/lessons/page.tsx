import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CircleCheck,
  Hourglass,
  Plus,
  Sparkles,
  Trash,
  TriangleAlert,
} from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createLessonAction, deleteLessonAction, moveLessonAction } from "@/app/studio/actions";
import { draftLessonsAction } from "@/app/studio/courses/[courseId]/sources/actions";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { isLocale, localize, type Locale } from "@/core/i18n/locales";
import { jobErrorText, languageName } from "@/core/i18n/studio/helpers";
import { rubricSchema } from "@/core/review/rubric";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { listLessonDrafts } from "@/server/authoring/lesson-drafting";
import { listSources } from "@/server/authoring/sources";
import { getCourseEditor } from "@/server/studio/course-context";
import { publishCheckFor, type CourseEditor } from "@/server/studio/courses";
import { markdownOf } from "@/server/studio/lessons";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("lessons.list.title") };
}

type LessonRow = CourseEditor["lessons"][number];

export default async function LessonsPage({
  params,
  searchParams,
}: PageProps<"/studio/courses/[courseId]/lessons">) {
  const { courseId } = await params;
  const { error, drafting } = await searchParams;
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/lessons`);
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor) notFound();
  const t = await getStudioText();
  const languages = editor.course.languages.filter(isLocale);
  const primary = languages[0] ?? tenant.settings.default_locale;
  const rubric = editor.rubric ? rubricSchema.parse(editor.rubric.definition) : null;
  const criterionLabel = new Map(
    rubric?.criteria.map((criterion) => [criterion.id, localize(criterion.label, primary)]),
  );
  const check = publishCheckFor(editor, {
    legalLinks: tenant.settings.legal_links,
    aiReview: tenant.settings.features.ai_review,
  });
  const [runs, sourceRows] = await Promise.all([
    listLessonDrafts(getDb(), tenant.id, courseId),
    listSources(getDb(), tenant.id, courseId),
  ]);
  const readySources = sourceRows.filter((row) => row.status === "ready").length;
  const drafting_ = runs.some((run) => run.status === "queued" || run.status === "running");
  const aiAvailable = Boolean(process.env.LLM_BASE_URL?.trim());

  // One row per lesson key, in course order; one cell per course language.
  const rows: Array<{ key: string; byLocale: Map<Locale, LessonRow>; criteria: string[] }> = [];
  for (const lesson of editor.lessons) {
    let row = rows.find((entry) => entry.key === lesson.key);
    if (!row) {
      row = { key: lesson.key, byLocale: new Map(), criteria: [] };
      rows.push(row);
    }
    if (isLocale(lesson.locale)) row.byLocale.set(lesson.locale, lesson);
    row.criteria = [...new Set([...row.criteria, ...lesson.criterionIds])].filter((id) =>
      criterionLabel.has(id),
    );
  }
  const titleOf = (row: (typeof rows)[number]) =>
    (row.byLocale.get(primary) ?? [...row.byLocale.values()][0])?.title ?? row.key;
  // The sources link sits inside the sentence, wherever the language puts it.
  const [introBefore, introAfter] = t.t("lessons.draft.intro").split("{sources}");

  return (
    <div className="space-y-8">
      <AutoRefresh active={drafting_} />
      {error === "language" && <Notice tone="critical" title={t.t("lessons.list.errorLanguage")} />}
      {error === "draft-limit" && <Notice tone="critical" title={t.t("lessons.draft.limit")} />}
      {drafting === "1" && drafting_ && (
        <Notice tone="info" title={t.t("lessons.draft.running")}>
          {t.t("lessons.draft.runningBody")}
        </Notice>
      )}

      {aiAvailable && (
        <section
          aria-labelledby="draft-heading"
          className="card-flat flex flex-wrap items-center gap-4 p-5"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-primary-soft">
            <Sparkles aria-hidden size={20} />
          </span>
          <div className="min-w-60 flex-1 space-y-1">
            <h2 id="draft-heading" className="font-semibold">
              {t.t("lessons.draft.title")}
            </h2>
            <p className="text-sm text-muted">
              {introBefore}
              <Link href={`/studio/courses/${courseId}/sources` as Route} className="underline">
                {readySources === 0
                  ? t.t("lessons.draft.sourcesNone")
                  : t.n("lessons.draft.sources", readySources)}
              </Link>
              {introAfter}
            </p>
            {runs.slice(0, 3).map((run) => (
              <p key={run.id} className="flex flex-wrap items-center gap-2 text-sm">
                {run.status === "done" ? (
                  <Badge tone="good" icon={CircleCheck}>
                    {t.n("lessons.draft.added", run.lessonIds.length)}
                  </Badge>
                ) : run.status === "failed" ? (
                  <Badge tone="critical" icon={TriangleAlert}>
                    {t.t("lessons.draft.failed")}
                  </Badge>
                ) : (
                  <Badge tone="info" icon={Hourglass}>
                    {t.t("lessons.draft.drafting")}
                  </Badge>
                )}
                <span className="text-muted">
                  {languageName(t, run.locale)} · {t.date(run.createdAt, "dateTime")}
                  {run.error ? ` · ${jobErrorText(t, run.error)}` : ""}
                  {run.notes.length > 0 ? ` · ${run.notes.join(" ")}` : ""}
                </span>
              </p>
            ))}
          </div>
          <form action={draftLessonsAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="courseId" value={courseId} />
            {languages.length > 1 ? (
              <select
                name="locale"
                aria-label={t.t("lessons.draft.language")}
                className="select"
                defaultValue={primary}
              >
                {languages.map((locale) => (
                  <option key={locale} value={locale}>
                    {languageName(t, locale)}
                  </option>
                ))}
              </select>
            ) : (
              <input type="hidden" name="locale" value={primary} />
            )}
            <SubmitButton
              className="btn btn-primary"
              disabled={drafting_}
              pendingLabel={t.t("lessons.draft.starting")}
            >
              <Sparkles aria-hidden size={18} /> {t.t("lessons.draft.submit")}
            </SubmitButton>
          </form>
        </section>
      )}

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="lessons-heading" className="space-y-4">
          <div>
            <h2 id="lessons-heading" className="text-lg font-semibold">
              {t.t("lessons.list.title")}
            </h2>
            <p className="text-sm text-muted">{t.t("lessons.list.intro")}</p>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title={t.t("lessons.list.empty")}
              body={t.t("lessons.list.emptyBody")}
            />
          ) : (
            <div className="card-flat table-wrap">
              <table className="table">
                <caption className="sr-only">{t.t("lessons.list.caption")}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-10">
                      #
                    </th>
                    <th scope="col">{t.t("lessons.list.lesson")}</th>
                    {languages.map((locale) => (
                      <th key={locale} scope="col">
                        {languageName(t, locale)}
                      </th>
                    ))}
                    <th scope="col">{t.t("lessons.list.teaches")}</th>
                    <th scope="col">
                      <span className="sr-only">{t.t("lessons.list.actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.key}>
                      <td className="text-muted tabular-nums">{index + 1}</td>
                      <td className="min-w-48 font-semibold">{titleOf(row)}</td>
                      {languages.map((locale) => {
                        const lesson = row.byLocale.get(locale);
                        if (!lesson) {
                          return (
                            <td key={locale}>
                              <form action={createLessonAction}>
                                <input type="hidden" name="courseId" value={courseId} />
                                <input type="hidden" name="locale" value={locale} />
                                <input type="hidden" name="translationOf" value={row.key} />
                                <input type="hidden" name="title" value={titleOf(row)} />
                                <SubmitButton
                                  className="btn btn-ghost btn-sm"
                                  pendingLabel={t.t("common.adding")}
                                >
                                  <Plus aria-hidden size={14} /> {t.t("lessons.list.translate")}
                                </SubmitButton>
                              </form>
                            </td>
                          );
                        }
                        const empty = !markdownOf(lesson.blocks).trim();
                        const attention = empty || lesson.flaggedAt !== null;
                        return (
                          <td key={locale} className="whitespace-nowrap">
                            <Link
                              href={`/studio/courses/${courseId}/lessons/${lesson.id}`}
                              className="inline-flex items-center gap-1.5 font-semibold hover:underline"
                            >
                              {attention ? (
                                <TriangleAlert
                                  aria-hidden
                                  size={16}
                                  style={{ color: "var(--status-warning)" }}
                                />
                              ) : (
                                <CircleCheck
                                  aria-hidden
                                  size={16}
                                  style={{ color: "var(--status-good)" }}
                                />
                              )}
                              {t.t("common.edit")}
                            </Link>
                            <span className="block text-xs text-muted">
                              {empty
                                ? t.t("lessons.list.noContent")
                                : lesson.flaggedAt
                                  ? t.t("lessons.list.sourceChanged")
                                  : t.t("lessons.version", { version: lesson.version })}
                            </span>
                          </td>
                        );
                      })}
                      <td>
                        {row.criteria.length === 0 ? (
                          <span className="text-sm text-muted">—</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {row.criteria.map((id) => (
                              <span
                                key={id}
                                className="whitespace-nowrap rounded-control bg-subtle px-2 py-0.5 text-xs font-semibold"
                              >
                                {criterionLabel.get(id)}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <form action={moveLessonAction}>
                            <input type="hidden" name="courseId" value={courseId} />
                            <input type="hidden" name="key" value={row.key} />
                            <input type="hidden" name="direction" value="up" />
                            <SubmitButton
                              className="btn btn-ghost btn-sm"
                              disabled={index === 0}
                              title={t.t("lessons.list.moveUp")}
                            >
                              <ArrowUp aria-hidden size={16} />
                            </SubmitButton>
                          </form>
                          <form action={moveLessonAction}>
                            <input type="hidden" name="courseId" value={courseId} />
                            <input type="hidden" name="key" value={row.key} />
                            <input type="hidden" name="direction" value="down" />
                            <SubmitButton
                              className="btn btn-ghost btn-sm"
                              disabled={index === rows.length - 1}
                              title={t.t("lessons.list.moveDown")}
                            >
                              <ArrowDown aria-hidden size={16} />
                            </SubmitButton>
                          </form>
                          <form action={deleteLessonAction}>
                            <input type="hidden" name="courseId" value={courseId} />
                            <input type="hidden" name="key" value={row.key} />
                            <SubmitButton
                              className="btn btn-ghost btn-sm"
                              title={t.t("lessons.list.delete")}
                              confirm={t.t("lessons.list.deleteConfirm", { title: titleOf(row) })}
                            >
                              <Trash aria-hidden size={16} />
                            </SubmitButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form
            action={createLessonAction}
            className="card-flat flex flex-wrap items-end gap-3 p-4"
          >
            <input type="hidden" name="courseId" value={courseId} />
            <div className="field min-w-56 flex-1">
              <label htmlFor="new-lesson-title" className="label">
                {t.t("lessons.list.new")}
              </label>
              <input
                id="new-lesson-title"
                name="title"
                className="input"
                required
                maxLength={160}
                placeholder={t.t("lessons.list.newPlaceholder")}
              />
            </div>
            {languages.length > 1 ? (
              <div className="field">
                <label htmlFor="new-lesson-locale" className="label">
                  {t.t("common.language")}
                </label>
                <select
                  id="new-lesson-locale"
                  name="locale"
                  className="select"
                  defaultValue={primary}
                >
                  {languages.map((locale) => (
                    <option key={locale} value={locale}>
                      {languageName(t, locale)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <input type="hidden" name="locale" value={primary} />
            )}
            <SubmitButton pendingLabel={t.t("common.adding")}>
              <Plus aria-hidden size={18} /> {t.t("lessons.list.add")}
            </SubmitButton>
          </form>
        </section>

        <aside aria-labelledby="coverage-heading" className="card-flat h-fit space-y-4 p-5">
          <div>
            <h2 id="coverage-heading" className="text-lg font-semibold">
              {t.t("lessons.coverage.title")}
            </h2>
            <p className="text-sm text-muted">{t.t("lessons.coverage.intro")}</p>
          </div>
          <ul className="space-y-3">
            {check.coverage.map((row) => (
              <li key={row.criterionId} className="space-y-1">
                <p className="flex items-center justify-between gap-2 text-sm font-semibold">
                  {criterionLabel.get(row.criterionId) ?? row.label}
                  {row.lessonKeys.length === 0 ? (
                    <Badge tone="warning" icon={TriangleAlert}>
                      {t.t("lessons.coverage.notTaught")}
                    </Badge>
                  ) : (
                    <Badge tone="good" icon={CircleCheck}>
                      {t.n("common.lesson", row.lessonKeys.length)}
                    </Badge>
                  )}
                </p>
                {row.lessonKeys.length > 0 && (
                  <p className="text-xs text-muted">
                    {row.lessonKeys
                      .map((key) => {
                        const match = rows.find((entry) => entry.key === key);
                        return match ? titleOf(match) : key;
                      })
                      .join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

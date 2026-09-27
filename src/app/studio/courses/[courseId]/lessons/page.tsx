import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CircleCheck,
  Plus,
  Trash,
  TriangleAlert,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createLessonAction, deleteLessonAction, moveLessonAction } from "@/app/studio/actions";
import { LANGUAGE_NAMES } from "@/components/studio/language-names";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { isLocale, localize, type Locale } from "@/core/i18n/locales";
import { rubricSchema } from "@/core/review/rubric";
import { requireCapability } from "@/server/access";
import { getCourseEditor } from "@/server/studio/course-context";
import { publishCheckFor, type CourseEditor } from "@/server/studio/courses";
import { markdownOf } from "@/server/studio/lessons";

export const metadata: Metadata = { title: "Lessons" };

type LessonRow = CourseEditor["lessons"][number];

export default async function LessonsPage({
  params,
  searchParams,
}: PageProps<"/studio/courses/[courseId]/lessons">) {
  const { courseId } = await params;
  const { error } = await searchParams;
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/lessons`);
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor) notFound();
  const languages = editor.course.languages.filter(isLocale);
  const primary = languages[0] ?? tenant.settings.default_locale;
  const rubric = editor.rubric ? rubricSchema.parse(editor.rubric.definition) : null;
  const criterionLabel = new Map(
    rubric?.criteria.map((criterion) => [criterion.id, localize(criterion.label, primary)]),
  );
  const check = publishCheckFor(editor, { legalLinks: tenant.settings.legal_links });

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

  return (
    <div className="space-y-8">
      {error === "language" && <Notice tone="critical" title="Pick one of the course languages." />}

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="lessons-heading" className="space-y-4">
          <div>
            <h2 id="lessons-heading" className="text-lg font-semibold">
              Lessons
            </h2>
            <p className="text-sm text-muted">
              Short lessons, each teaching one or more rubric criteria. Translations share progress,
              so learners can switch language.
            </p>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No lessons yet"
              body="Work backwards from the rubric: one lesson for each thing a good result needs."
            />
          ) : (
            <div className="card-flat table-wrap">
              <table className="table">
                <caption className="sr-only">Lessons and their languages</caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-10">
                      #
                    </th>
                    <th scope="col">Lesson</th>
                    {languages.map((locale) => (
                      <th key={locale} scope="col">
                        {LANGUAGE_NAMES[locale]}
                      </th>
                    ))}
                    <th scope="col">Teaches</th>
                    <th scope="col">
                      <span className="sr-only">Order and delete</span>
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
                                  pendingLabel="Adding…"
                                >
                                  <Plus aria-hidden size={14} /> Translate
                                </SubmitButton>
                              </form>
                            </td>
                          );
                        }
                        const empty = !markdownOf(lesson.blocks).trim();
                        return (
                          <td key={locale} className="whitespace-nowrap">
                            <Link
                              href={`/studio/courses/${courseId}/lessons/${lesson.id}`}
                              className="inline-flex items-center gap-1.5 font-semibold hover:underline"
                            >
                              {empty ? (
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
                              Edit
                            </Link>
                            <span className="block text-xs text-muted">
                              {empty ? "No content yet" : `Version ${lesson.version}`}
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
                              title="Move up"
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
                              title="Move down"
                            >
                              <ArrowDown aria-hidden size={16} />
                            </SubmitButton>
                          </form>
                          <form action={deleteLessonAction}>
                            <input type="hidden" name="courseId" value={courseId} />
                            <input type="hidden" name="key" value={row.key} />
                            <SubmitButton
                              className="btn btn-ghost btn-sm"
                              title="Delete lesson"
                              confirm={`Delete “${titleOf(row)}” in every language? Learners' progress on it is kept but no longer counted.`}
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
                New lesson
              </label>
              <input
                id="new-lesson-title"
                name="title"
                className="input"
                required
                maxLength={160}
                placeholder="Lesson title"
              />
            </div>
            {languages.length > 1 ? (
              <div className="field">
                <label htmlFor="new-lesson-locale" className="label">
                  Language
                </label>
                <select
                  id="new-lesson-locale"
                  name="locale"
                  className="select"
                  defaultValue={primary}
                >
                  {languages.map((locale) => (
                    <option key={locale} value={locale}>
                      {LANGUAGE_NAMES[locale]}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <input type="hidden" name="locale" value={primary} />
            )}
            <SubmitButton pendingLabel="Adding…">
              <Plus aria-hidden size={18} /> Add lesson
            </SubmitButton>
          </form>
        </section>

        <aside aria-labelledby="coverage-heading" className="card-flat h-fit space-y-4 p-5">
          <div>
            <h2 id="coverage-heading" className="text-lg font-semibold">
              Coverage
            </h2>
            <p className="text-sm text-muted">
              Which lesson teaches which criterion. Tick criteria in the lesson editor.
            </p>
          </div>
          <ul className="space-y-3">
            {check.coverage.map((row) => (
              <li key={row.criterionId} className="space-y-1">
                <p className="flex items-center justify-between gap-2 text-sm font-semibold">
                  {criterionLabel.get(row.criterionId) ?? row.label}
                  {row.lessonKeys.length === 0 ? (
                    <Badge tone="warning" icon={TriangleAlert}>
                      Not taught
                    </Badge>
                  ) : (
                    <Badge tone="good" icon={CircleCheck}>
                      {row.lessonKeys.length} {row.lessonKeys.length === 1 ? "lesson" : "lessons"}
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

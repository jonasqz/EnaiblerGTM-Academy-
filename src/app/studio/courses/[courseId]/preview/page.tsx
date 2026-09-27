import { BookOpen, Circle, Hammer, Timer } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { LANGUAGE_NAMES } from "@/components/studio/language-names";
import { Markdown } from "@/components/ui/markdown";
import { Notice } from "@/components/ui/notice";
import { isLocale, localize } from "@/core/i18n/locales";
import { createTranslator } from "@/core/i18n/translator";
import { rubricSchema } from "@/core/review/rubric";
import { themeToCssVariables } from "@/core/theme/css";
import { requireCapability } from "@/server/access";
import { getCourseEditor } from "@/server/studio/course-context";
import { markdownOf } from "@/server/studio/lessons";

export const metadata: Metadata = { title: "Preview" };

/**
 * Preview as learner (brief §7 step 6): the course in any of its languages,
 * drafts included, with the learner-facing wording. Nothing is recorded.
 */
export default async function PreviewPage({
  params,
  searchParams,
}: PageProps<"/studio/courses/[courseId]/preview">) {
  const { courseId } = await params;
  const { lang, lesson: lessonKey } = await searchParams;
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/preview`);
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor) notFound();
  const languages = editor.course.languages.filter(isLocale);
  const locale =
    isLocale(lang) && languages.includes(lang)
      ? lang
      : (languages[0] ?? tenant.settings.default_locale);
  const t = createTranslator({
    locale,
    termOverrides: tenant.terminology,
    messageOverrides: tenant.terminology.strings,
  });
  const fallback = [tenant.settings.default_locale];
  const lessons = editor.lessons.filter((lesson) => lesson.locale === locale);
  const current = lessons.find((lesson) => lesson.key === lessonKey) ?? null;
  const rubric = editor.rubric ? rubricSchema.parse(editor.rubric.definition) : null;
  const base = `/studio/courses/${courseId}/preview?lang=${locale}`;

  return (
    <div className="space-y-6">
      <Notice tone="info" title="Preview">
        This is what learners see
        {editor.course.status === "published" ? "" : " once the course is published"}. Nothing you
        do here is recorded.
      </Notice>

      {languages.length > 1 && (
        <nav aria-label="Preview language" className="flex gap-2">
          {languages.map((language) => (
            <Link
              key={language}
              href={
                `/studio/courses/${courseId}/preview?lang=${language}${current ? `&lesson=${current.key}` : ""}` as Route
              }
              aria-current={language === locale ? "true" : undefined}
              className={`btn btn-sm ${language === locale ? "btn-primary" : "btn-secondary"}`}
            >
              {LANGUAGE_NAMES[language]}
            </Link>
          ))}
        </nav>
      )}

      {/* The academy's own theme, inside the Studio's. */}
      <div
        lang={locale}
        data-theme-scope
        style={themeToCssVariables(tenant.theme) as CSSProperties}
        className="grid gap-8 rounded-card bg-surface p-4 font-body text-ink sm:p-8 lg:grid-cols-[17rem_1fr]"
      >
        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <Link
            href={base as Route}
            className="block font-display text-lg leading-tight hover:underline"
          >
            {localize(editor.course.title, locale, fallback)}
          </Link>
          <ol className="space-y-1">
            {lessons.map((lesson, index) => (
              <li key={lesson.id}>
                <Link
                  href={`${base}&lesson=${lesson.key}` as Route}
                  aria-current={lesson.key === current?.key ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-control px-3 py-2 text-sm ${
                    lesson.key === current?.key
                      ? "bg-primary-soft font-semibold"
                      : "hover:bg-subtle"
                  }`}
                >
                  <Circle aria-hidden size={16} className="shrink-0 text-muted" />
                  <span className="text-muted">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                </Link>
              </li>
            ))}
            <li className="flex items-center gap-2 px-3 py-2 text-sm font-semibold">
              <Hammer aria-hidden size={16} className="shrink-0" /> {t.term("assignment")}
            </li>
          </ol>
        </aside>

        {current ? (
          <article className="card min-w-0 p-6 sm:p-10">
            <p className="eyebrow">
              {t.term("lesson")} {lessons.indexOf(current) + 1} / {lessons.length}
            </p>
            <h2 className="mt-2 font-display text-3xl leading-tight">{current.title}</h2>
            <div className="mt-6">
              {markdownOf(current.blocks).trim() ? (
                <Markdown source={markdownOf(current.blocks)} />
              ) : (
                <p className="text-muted">{t.t("lesson.empty")}</p>
              )}
            </div>
          </article>
        ) : (
          <article className="min-w-0 space-y-8">
            <header className="space-y-3">
              <p className="eyebrow">{t.term("course")}</p>
              <h2 className="font-display text-4xl leading-tight">
                {localize(editor.course.title, locale, fallback)}
              </h2>
              {editor.course.summary && (
                <p className="max-w-2xl text-lg text-muted">
                  {localize(editor.course.summary, locale, fallback)}
                </p>
              )}
              <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                {editor.course.estMinutes && (
                  <span className="inline-flex items-center gap-1.5">
                    <Timer aria-hidden size={16} />{" "}
                    {t.t("home.minutes", { minutes: editor.course.estMinutes })}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <BookOpen aria-hidden size={16} />{" "}
                  {t.t("home.lessonCount", { n: lessons.length })}
                </span>
              </p>
            </header>
            {editor.assignment && (
              <section className="card space-y-3 p-6">
                <p className="eyebrow">{t.t("course.whatYouBuild")}</p>
                <p className="font-display text-2xl">
                  {localize(editor.assignment.artifactName, locale, fallback)}
                </p>
                <Markdown source={localize(editor.assignment.prompt, locale, fallback)} />
              </section>
            )}
            {rubric && (
              <section className="space-y-3">
                <h3 className="font-display text-xl">{t.t("course.howReviewed")}</h3>
                <p className="text-muted">
                  {t.t("course.howReviewedIntro", { threshold: rubric.pass_threshold })}
                </p>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {rubric.criteria.map((criterion) => (
                    <li key={criterion.id} className="card-flat p-4">
                      <p className="font-semibold">{localize(criterion.label, locale, fallback)}</p>
                      <p className="text-sm text-muted">
                        {localize(criterion.description, locale, fallback)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </article>
        )}
      </div>
    </div>
  );
}

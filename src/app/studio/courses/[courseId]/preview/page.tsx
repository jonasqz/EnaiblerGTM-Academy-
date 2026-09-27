import { BookOpen, Circle, Hammer, ListChecks, Timer } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { KnowledgeCheck } from "@/components/knowledge-check";
import { knowledgeCheckLabels } from "@/components/knowledge-check-labels";
import { Markdown } from "@/components/ui/markdown";
import { Notice } from "@/components/ui/notice";
import { requiresTest, requiresWork } from "@/core/courses/completion";
import { isLocale, localize } from "@/core/i18n/locales";
import { languageName } from "@/core/i18n/studio/helpers";
import { createTranslator } from "@/core/i18n/translator";
import { publicTestQuestions } from "@/core/questions/questions";
import { rubricSchema } from "@/core/review/rubric";
import { themeToCssVariables } from "@/core/theme/css";
import { requireCapability } from "@/server/access";
import { getCourseEditor } from "@/server/studio/course-context";
import { checkQuestionsOf, markdownOf } from "@/server/studio/lessons";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("courses.preview.title") };
}

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
  const t = await getStudioText();
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor) notFound();
  const languages = editor.course.languages.filter(isLocale);
  const locale =
    isLocale(lang) && languages.includes(lang)
      ? lang
      : (languages[0] ?? tenant.settings.default_locale);
  // What learners read comes in the previewed language; the Studio around it in the team member's.
  const learner = createTranslator({
    locale,
    termOverrides: tenant.terminology,
    messageOverrides: tenant.terminology.strings,
  });
  const fallback = [tenant.settings.default_locale];
  const lessons = editor.lessons.filter((lesson) => lesson.locale === locale);
  const current = lessons.find((lesson) => lesson.key === lessonKey) ?? null;
  const rubric = editor.rubric ? rubricSchema.parse(editor.rubric.definition) : null;
  const base = `/studio/courses/${courseId}/preview?lang=${locale}`;
  // The course ends as learners will finish it; parts another ending left behind stay hidden.
  const work = requiresWork(editor.course.completionMode);
  const test = requiresTest(editor.course.completionMode);
  const testQuestions = publicTestQuestions(editor.test?.questions ?? [], locale, fallback);

  return (
    <div className="space-y-6">
      <Notice tone="info" title={t.t("courses.preview.title")}>
        {editor.course.status === "published"
          ? t.t("courses.preview.body")
          : t.t("courses.preview.bodyDraft")}
        {test && ` ${t.t("courses.preview.testNote")}`}
      </Notice>

      {languages.length > 1 && (
        <nav aria-label={t.t("courses.preview.language")} className="flex gap-2">
          {languages.map((language) => (
            <Link
              key={language}
              href={
                `/studio/courses/${courseId}/preview?lang=${language}${current ? `&lesson=${current.key}` : ""}` as Route
              }
              aria-current={language === locale ? "true" : undefined}
              className={`btn btn-sm ${language === locale ? "btn-primary" : "btn-secondary"}`}
            >
              {languageName(t, language)}
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
            {work && (
              <li className="flex items-center gap-2 px-3 py-2 text-sm font-semibold">
                <Hammer aria-hidden size={16} className="shrink-0" /> {learner.term("assignment")}
              </li>
            )}
            {test && (
              <li>
                <Link
                  href={`${base}#final-test` as Route}
                  className="flex items-center gap-2 rounded-control px-3 py-2 text-sm font-semibold hover:bg-subtle"
                >
                  <ListChecks aria-hidden size={16} className="shrink-0" /> {learner.term("test")}
                </Link>
              </li>
            )}
          </ol>
        </aside>

        {current ? (
          <article className="card min-w-0 p-6 sm:p-10">
            <p className="eyebrow">
              {learner.term("lesson")} {lessons.indexOf(current) + 1} / {lessons.length}
            </p>
            <h2 className="mt-2 font-display text-3xl leading-tight">{current.title}</h2>
            <div className="mt-6">
              {markdownOf(current.blocks).trim() ? (
                <Markdown source={markdownOf(current.blocks)} />
              ) : (
                <p className="text-muted">{learner.t("lesson.empty")}</p>
              )}
            </div>
            <KnowledgeCheck
              key={current.id}
              questions={checkQuestionsOf(current.blocks)}
              labels={knowledgeCheckLabels(learner)}
              headingLevel={3}
              className="mt-10 border-t border-line pt-8"
            />
          </article>
        ) : (
          <article className="min-w-0 space-y-8">
            <header className="space-y-3">
              <p className="eyebrow">{learner.term("course")}</p>
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
                    {learner.t("home.minutes", { minutes: editor.course.estMinutes })}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <BookOpen aria-hidden size={16} />{" "}
                  {learner.t("home.lessonCount", { n: lessons.length })}
                </span>
              </p>
            </header>
            {work && editor.assignment && (
              <section className="card space-y-3 p-6">
                <p className="eyebrow">{learner.t("course.whatYouBuild")}</p>
                <p className="font-display text-2xl">
                  {localize(editor.assignment.artifactName, locale, fallback)}
                </p>
                <Markdown source={localize(editor.assignment.prompt, locale, fallback)} />
              </section>
            )}
            {work && rubric && (
              <section className="space-y-3">
                <h3 className="font-display text-xl">{learner.t("course.howReviewed")}</h3>
                <p className="text-muted">
                  {learner.t("course.howReviewedIntro", { threshold: rubric.pass_threshold })}
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
            {test && (
              <section id="final-test" className="scroll-mt-6 space-y-3">
                <h3 className="font-display text-xl">{learner.term("test")}</h3>
                {testQuestions.length === 0 ? (
                  <p className="text-muted">{t.t("courses.test.empty.title")}</p>
                ) : (
                  <ol className="space-y-3">
                    {testQuestions.map((question, index) => (
                      <li key={question.id} className="card-flat p-4">
                        <fieldset className="space-y-2">
                          <legend className="font-semibold">
                            {index + 1}. {question.prompt}
                          </legend>
                          <ul className="space-y-1.5">
                            {question.options.map((option) => (
                              <li key={option.id}>
                                <label className="flex items-start gap-2">
                                  <input
                                    type={question.several ? "checkbox" : "radio"}
                                    name={`preview.${question.id}`}
                                    className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
                                  />
                                  {option.text}
                                </label>
                              </li>
                            ))}
                          </ul>
                        </fieldset>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}
          </article>
        )}
      </div>
    </div>
  );
}

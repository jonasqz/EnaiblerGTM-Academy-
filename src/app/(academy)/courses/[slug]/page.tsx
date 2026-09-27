import {
  Award,
  BookOpen,
  CircleCheck,
  Circle,
  Hammer,
  Languages,
  Timer,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { cohortDateLine } from "@/components/cohort-dates";
import { continueUrl } from "@/components/entry-links";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/ui/markdown";
import { Progress } from "@/components/ui/progress";
import { courseProgress, resumeLessonKey, type LessonProgressMap } from "@/core/courses/lessons";
import { decodeEntryContext } from "@/core/entry/context";
import { localize } from "@/core/i18n/locales";
import { getDb } from "@/db/client";
import { getSession } from "@/server/access";
import { learnerCohorts } from "@/server/cohorts";
import { loadLearnerCourse } from "@/server/learning";
import { getTenant, getTranslator } from "@/server/request";

export async function generateMetadata({ params }: PageProps<"/courses/[slug]">) {
  const { slug } = await params;
  const tenant = await getTenant();
  const t = await getTranslator();
  const data = await loadLearnerCourse(getDb(), tenant, slug, null, t.locale);
  return {
    title: data
      ? localize(data.course.title, t.locale, [tenant.settings.default_locale])
      : undefined,
  };
}

export default async function CoursePage({ params, searchParams }: PageProps<"/courses/[slug]">) {
  const { slug } = await params;
  const { ctx } = await searchParams;
  const tenant = await getTenant();
  const t = await getTranslator();
  const session = await getSession();
  const data = await loadLearnerCourse(
    getDb(),
    tenant,
    slug,
    session?.viewer.userId ?? null,
    t.locale,
  );
  if (!data) notFound();

  const fallback = [tenant.settings.default_locale];
  const entry = {
    ...(decodeEntryContext(typeof ctx === "string" ? ctx : null) ?? {}),
    course: slug,
  };
  const keys = data.lessons.map((lesson) => lesson.key);
  const progressMap = (data.enrollment?.lessonProgress ?? {}) as LessonProgressMap;
  const progress = courseProgress(keys, progressMap);
  const resume = resumeLessonKey(keys, progressMap);
  const artifact = data.assignment
    ? localize(data.assignment.artifactName, data.locale, fallback)
    : null;
  const [cohort] =
    session && tenant.settings.features.cohorts
      ? await learnerCohorts(getDb(), tenant.id, session.viewer.userId, [data.course.id])
      : [];

  return (
    <article className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-8">
        <header className="space-y-4">
          <p className="eyebrow">{t.term("course")}</p>
          <h1 className="font-display text-4xl leading-tight">
            {localize(data.course.title, t.locale, fallback)}
          </h1>
          {data.course.summary && (
            <p className="max-w-2xl text-lg text-muted">
              {localize(data.course.summary, t.locale, fallback)}
            </p>
          )}
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            {data.course.estMinutes && (
              <span className="inline-flex items-center gap-1.5">
                <Timer aria-hidden size={16} />{" "}
                {t.t("home.minutes", { minutes: data.course.estMinutes })}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <BookOpen aria-hidden size={16} /> {t.t("home.lessonCount", { n: keys.length })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Languages aria-hidden size={16} />{" "}
              {data.course.languages.map((l) => l.toUpperCase()).join(" · ")}
            </span>
          </p>
          {cohort && (
            <p className="inline-flex flex-wrap items-center gap-2 rounded-control bg-primary-soft px-3 py-2 text-sm">
              <UsersRound aria-hidden size={16} />
              <span className="font-semibold">{t.t("cohort.yours", { cohort: cohort.name })}</span>
              {cohortDateLine(t, cohort.startsOn, cohort.endsOn) && (
                <span>· {cohortDateLine(t, cohort.startsOn, cohort.endsOn)}</span>
              )}
            </p>
          )}
        </header>

        {data.assignment && artifact && (
          <section className="card space-y-3 p-6" aria-labelledby="build-heading">
            <p className="eyebrow" id="build-heading">
              {t.t("course.whatYouBuild")}
            </p>
            <p className="flex items-center gap-2 font-display text-2xl">
              <Hammer aria-hidden size={22} className="shrink-0" /> {artifact}
            </p>
            <Markdown source={localize(data.assignment.prompt, data.locale, fallback)} />
          </section>
        )}

        <section className="space-y-4" aria-labelledby="lessons-heading">
          <h2 id="lessons-heading" className="font-display text-2xl">
            {t.term("lesson", { plural: true })}
          </h2>
          <ol className="card-flat divide-y divide-line overflow-hidden">
            {data.lessons.map((lesson, index) => {
              const done = Boolean(progressMap[lesson.key]);
              const label = (
                <>
                  <span className="w-6 text-sm text-muted">{index + 1}</span>
                  <span className="flex-1">{lesson.title}</span>
                  {done ? (
                    <CircleCheck
                      aria-label={t.t("lesson.done")}
                      size={18}
                      style={{ color: "var(--status-good)" }}
                    />
                  ) : (
                    <Circle aria-hidden size={18} className="text-muted" />
                  )}
                </>
              );
              return (
                <li key={lesson.key}>
                  {data.enrollment ? (
                    <Link
                      href={`/courses/${slug}/learn/${lesson.key}`}
                      className="flex items-center gap-3 px-5 py-4 hover:bg-subtle"
                    >
                      {label}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-3 px-5 py-4">{label}</span>
                  )}
                </li>
              );
            })}
            {data.assignment && (
              <li>
                {data.enrollment ? (
                  <Link
                    href={`/courses/${slug}/assignment`}
                    className="flex items-center gap-3 px-5 py-4 font-semibold hover:bg-subtle"
                  >
                    <Hammer aria-hidden size={16} className="w-6" />
                    <span className="flex-1">{t.term("assignment")}</span>
                  </Link>
                ) : (
                  <span className="flex items-center gap-3 px-5 py-4 font-semibold">
                    <Hammer aria-hidden size={16} className="w-6" />
                    <span className="flex-1">{t.term("assignment")}</span>
                  </span>
                )}
              </li>
            )}
          </ol>
        </section>

        {data.rubric && (
          <section className="space-y-4" aria-labelledby="review-heading">
            <h2 id="review-heading" className="font-display text-2xl">
              {t.t("course.howReviewed")}
            </h2>
            <p className="text-muted">
              {t.t("course.howReviewedIntro", { threshold: data.rubric.pass_threshold })}
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {data.rubric.criteria.map((criterion) => (
                <li key={criterion.id} className="card-flat space-y-1 p-4">
                  <p className="font-semibold">
                    {localize(criterion.label, data.locale, fallback)}
                  </p>
                  <p className="text-sm text-muted">
                    {localize(criterion.description, data.locale, fallback)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="card h-fit space-y-4 p-5 lg:sticky lg:top-6">
        {data.credential ? (
          <>
            <Badge tone="good" icon={Award}>
              {t.t("home.completed")}
            </Badge>
            <Link href={`/verify/${data.credential.publicId}`} className="btn btn-primary w-full">
              {t.t("course.viewCredential")}
            </Link>
          </>
        ) : data.enrollment ? (
          <>
            <p className="text-sm font-semibold">
              {t.t("course.progress", { done: progress.done, total: progress.total })}
            </p>
            <Progress
              value={progress.percent}
              label={t.t("course.progress", { done: progress.done, total: progress.total })}
            />
            <Link
              href={resume ? `/courses/${slug}/learn/${resume}` : `/courses/${slug}/assignment`}
              className="btn btn-primary w-full"
            >
              {t.t("course.continue")}
            </Link>
            <Link href={`/courses/${slug}/assignment`} className="btn btn-secondary w-full">
              {t.t("course.openAssignment")}
            </Link>
          </>
        ) : (
          <>
            <a href={continueUrl(entry)} className="btn btn-primary w-full">
              {t.t("home.start")}
            </a>
            {!session && <p className="text-sm text-muted">{t.t("course.signInToStart")}</p>}
          </>
        )}
      </aside>
    </article>
  );
}

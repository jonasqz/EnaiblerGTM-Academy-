import {
  Award,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CircleCheck,
  Circle,
  Hammer,
  Languages,
  ListChecks,
  Timer,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { SessionBadge } from "@/app/(academy)/courses/[slug]/learn/[key]/session-panel";
import { cohortDateLine } from "@/components/cohort-dates";
import { continueUrl } from "@/components/entry-links";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/ui/markdown";
import { Progress } from "@/components/ui/progress";
import { deadlineState, formatDeadline } from "@/core/assignments/deadline";
import { requiresWork } from "@/core/courses/completion";
import { courseProgress, resumeLessonKey, type LessonProgressMap } from "@/core/courses/lessons";
import { nextStep, nextStepHref } from "@/core/courses/next-step";
import { requiresSessions, sessionsOverview, waitingSessionKeys } from "@/core/courses/sessions";
import { decodeEntryContext } from "@/core/entry/context";
import { localize } from "@/core/i18n/locales";
import { formatWebinarTime } from "@/core/webinars/time";
import { getDb } from "@/db/client";
import { getSession } from "@/server/access";
import { learnerCohorts } from "@/server/cohorts";
import { loadLearnerCourse } from "@/server/learning";
import { getTenant, getTranslator } from "@/server/request";
import { appTimeZone } from "@/server/time-zone";

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
  // A series: "continue" skips sessions still to come (or gone); they complete themselves.
  const waiting = waitingSessionKeys(data.sessions);
  const resume = resumeLessonKey(
    keys.filter((key) => !waiting.has(key)),
    progressMap,
  );
  const sessionOf = new Map(data.sessions.map((session) => [session.lessonKey, session]));
  const sessions = sessionsOverview(data.sessions);
  const sessionRule = data.sessionRequirement.rule;
  // What learners finish with follows the authors' choice: the work, the test or both.
  const work = requiresWork(data.completionMode) && data.assignment !== null;
  const { test } = data;
  const both = work && test !== null;
  const needsSessions = requiresSessions(sessionRule) && sessions.total > 0;
  // More than one part: the aside lists them, each with where the learner stands.
  const parts = [work, test !== null, needsSessions].filter(Boolean).length;
  const dueAt = work && data.assignment ? data.assignment.dueAt : null;
  const deadline = deadlineState(dueAt, new Date());
  const zone = appTimeZone();
  const { catchUpDays } = data.sessionRequirement;
  const ruleText =
    sessionRule === "attended"
      ? t.t("series.rule.attended")
      : catchUpDays === null
        ? t.t("series.rule.attended_or_watchedOpen")
        : t.t("series.rule.attended_or_watched", { days: catchUpDays });
  const workOutcome = data.attempts[0]?.outcome ?? null;
  const next = nextStep({
    mode: data.completionMode,
    resumeKey: resume,
    work: workOutcome,
    test: {
      taken: (test?.attempts.count ?? 0) > 0,
      passed: Boolean(test?.attempts.passed),
    },
  });
  const artifact =
    work && data.assignment ? localize(data.assignment.artifactName, data.locale, fallback) : null;
  const testCall = test?.attempts.latest ? t.t("course.test.retake") : t.t("course.test.take");
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

        {test && (
          <section className="card space-y-3 p-6" aria-labelledby="test-heading">
            <h2 id="test-heading" className="flex items-center gap-2 font-display text-2xl">
              <ListChecks aria-hidden size={22} className="shrink-0" /> {t.term("test")}
            </h2>
            <p className="font-semibold">
              {test.questions.length === 1
                ? t.t("course.test.questionsOne")
                : t.t("course.test.questions", { n: test.questions.length })}{" "}
              · {t.t("assignment.passAt", { threshold: test.passPercent })}
            </p>
            <p className="text-muted">
              {test.maxAttempts === null
                ? t.t("course.test.intro")
                : t.t("course.test.introLimited", { max: test.maxAttempts })}
            </p>
            {both && <p>{t.t("course.test.needsBoth")}</p>}
            {data.enrollment &&
              (test.attempts.passed ? (
                <Badge tone="good" icon={CircleCheck}>
                  {t.t("course.test.passed", { percent: test.attempts.passed.percent })}
                </Badge>
              ) : (
                !data.credential && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                    <Link href={`/courses/${slug}/test`} className="btn btn-secondary">
                      <ListChecks aria-hidden size={16} /> {testCall}
                    </Link>
                    {test.attempts.latest && (
                      <span className="text-sm text-muted">
                        {t.t("course.test.lastAttempt", { percent: test.attempts.latest.percent })}
                        {test.attempts.best &&
                          test.attempts.best.attemptNo !== test.attempts.latest.attemptNo &&
                          ` · ${t.t("course.test.best", { percent: test.attempts.best.percent })}`}
                      </span>
                    )}
                  </div>
                )
              ))}
          </section>
        )}

        <section className="space-y-4" aria-labelledby="lessons-heading">
          <h2 id="lessons-heading" className="font-display text-2xl">
            {t.term("lesson", { plural: true })}
          </h2>
          <ol className="card-flat divide-y divide-line overflow-hidden">
            {data.lessons.map((lesson, index) => {
              const done = Boolean(progressMap[lesson.key]);
              const session = sessionOf.get(lesson.key);
              const label = (
                <>
                  <span className="w-6 text-sm text-muted">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    {lesson.title}
                    {session && (
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                        <span>
                          {formatWebinarTime(
                            session.webinar.startsAt,
                            session.webinar.durationMinutes,
                            session.webinar.timeZone,
                            t.locale,
                          )}
                        </span>
                        {data.enrollment && <SessionBadge t={t} session={session} />}
                      </span>
                    )}
                  </span>
                  {done ? (
                    <CircleCheck
                      aria-label={t.t("lesson.done")}
                      size={18}
                      style={{ color: "var(--status-good)" }}
                    />
                  ) : session ? (
                    <CalendarDays
                      aria-label={t.t("session.eyebrow")}
                      size={18}
                      className="text-muted"
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
            {work && (
              <FinalStep
                href={data.enrollment ? `/courses/${slug}/assignment` : null}
                icon={<Hammer aria-hidden size={16} className="w-6" />}
                label={t.term("assignment")}
                passed={data.workPassed ? t.t("assignment.passed") : null}
              />
            )}
            {test && (
              <FinalStep
                href={data.enrollment ? `/courses/${slug}/test` : null}
                icon={<ListChecks aria-hidden size={16} className="w-6" />}
                label={t.term("test")}
                passed={test.attempts.passed ? t.t("assignment.passed") : null}
              />
            )}
          </ol>
        </section>

        {work && data.rubric && (
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
            {/* The progress view of a series (webinar brief §2.7): sessions, the next date, homework. */}
            {(sessions.total > 0 || (dueAt && !data.workPassed)) && (
              <ul className="space-y-2 border-t border-line pt-4 text-sm">
                {sessions.total > 0 && (
                  <li className="flex items-start gap-2">
                    <CalendarDays aria-hidden size={16} className="mt-0.5 shrink-0" />
                    <span>
                      <span className="block font-semibold">
                        {t.t("series.progress", { done: sessions.done, total: sessions.total })}
                      </span>
                      {sessions.next && (
                        <Link
                          href={`/courses/${slug}/learn/${sessions.next.lessonKey}`}
                          className="text-muted hover:underline"
                        >
                          {t.t("series.next", {
                            time: formatWebinarTime(
                              sessions.next.webinar.startsAt,
                              sessions.next.webinar.durationMinutes,
                              sessions.next.webinar.timeZone,
                              t.locale,
                            ),
                          })}
                        </Link>
                      )}
                    </span>
                  </li>
                )}
                {dueAt && !data.workPassed && (
                  <li className="flex items-start gap-2">
                    <CalendarClock aria-hidden size={16} className="mt-0.5 shrink-0" />
                    <Link href={`/courses/${slug}/assignment`} className="hover:underline">
                      <span className="block font-semibold">{t.term("assignment")}</span>
                      <span className={deadline === "passed" ? "text-muted" : ""}>
                        {t.t(deadline === "passed" ? "deadline.passed" : "deadline.due", {
                          date: formatDeadline(dueAt, zone, t.locale),
                        })}
                      </span>
                    </Link>
                  </li>
                )}
              </ul>
            )}
            {parts > 1 && (
              <div className="space-y-2 border-t border-line pt-4">
                <p className="text-sm font-semibold">
                  {both && !needsSessions
                    ? t.t("course.test.needsBothTitle")
                    : t.t("course.needsTitle")}
                </p>
                <ul className="space-y-1.5 text-sm">
                  {work && (
                    <PartState
                      label={t.term("artifact")}
                      passed={data.workPassed}
                      state={
                        workOutcome === "passed"
                          ? t.t("assignment.passed")
                          : workOutcome === "pending"
                            ? t.t("assignment.inReview")
                            : workOutcome === "needs_revision"
                              ? t.t("assignment.needsRevision")
                              : t.t("course.test.workToDo")
                      }
                    />
                  )}
                  {test && (
                    <PartState
                      label={t.term("test")}
                      passed={Boolean(test.attempts.passed)}
                      state={
                        test.attempts.passed
                          ? t.t("assignment.passed")
                          : test.attempts.latest
                            ? t.t("course.test.lastAttempt", {
                                percent: test.attempts.latest.percent,
                              })
                            : t.t("course.test.notTaken")
                      }
                    />
                  )}
                  {needsSessions && (
                    <PartState
                      label={t.t("series.sessionsTitle")}
                      passed={sessions.done === sessions.total}
                      state={`${sessions.done} / ${sessions.total}`}
                    />
                  )}
                </ul>
                {needsSessions && <p className="text-xs text-muted">{ruleText}</p>}
              </div>
            )}
            <Link href={nextStepHref(slug, next)} className="btn btn-primary w-full">
              {t.t("course.continue")}
            </Link>
            {work && (
              <Link href={`/courses/${slug}/assignment`} className="btn btn-secondary w-full">
                {t.t("course.openAssignment")}
              </Link>
            )}
            {test && !test.attempts.passed && (
              <Link href={`/courses/${slug}/test`} className="btn btn-secondary w-full">
                {testCall}
              </Link>
            )}
          </>
        ) : (
          <>
            {/* One registration for the whole series: starting is registering (webinar brief §2.7). */}
            {sessions.total > 0 && (
              <div className="space-y-2 text-sm">
                <p className="flex items-start gap-2">
                  <CalendarDays aria-hidden size={16} className="mt-0.5 shrink-0" />
                  <span>
                    {sessions.total === 1
                      ? t.t("series.introOne")
                      : t.t("series.intro", { n: sessions.total })}
                  </span>
                </p>
                {needsSessions && <p className="text-muted">{ruleText}</p>}
                {data.sessions.some((row) => row.webinar.recorded) && (
                  <p className="text-xs text-muted">
                    {t.t("webinar.form.recording", {
                      academy: tenant.settings.author_display_name,
                    })}
                  </p>
                )}
              </div>
            )}
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

/** The last rows of the syllabus: what the course ends with. */
function FinalStep(props: {
  href: string | null;
  icon: ReactNode;
  label: string;
  /** Set once passed: the words for the check mark. */
  passed: string | null;
}) {
  const content = (
    <>
      {props.icon}
      <span className="flex-1">{props.label}</span>
      {props.passed && (
        <CircleCheck aria-label={props.passed} size={18} style={{ color: "var(--status-good)" }} />
      )}
    </>
  );
  return (
    <li>
      {props.href ? (
        <Link
          href={props.href}
          className="flex items-center gap-3 px-5 py-4 font-semibold hover:bg-subtle"
        >
          {content}
        </Link>
      ) : (
        <span className="flex items-center gap-3 px-5 py-4 font-semibold">{content}</span>
      )}
    </li>
  );
}

function PartState(props: { label: string; passed: boolean; state: string }) {
  return (
    <li className="flex items-center gap-2">
      {props.passed ? (
        <CircleCheck aria-hidden size={16} style={{ color: "var(--status-good)" }} />
      ) : (
        <Circle aria-hidden size={16} className="text-muted" />
      )}
      <span className="flex-1 font-medium">{props.label}</span>
      <span className="text-muted">{props.state}</span>
    </li>
  );
}

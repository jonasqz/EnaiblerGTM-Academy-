import { ArrowRight, Circle, CircleCheck, TriangleAlert } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseSharingCard } from "@/app/studio/sharing-card";
import { StatTile } from "@/components/ui/stat-tile";
import { can } from "@/core/access/roles";
import { DEFAULT_PERIOD, periodWindow } from "@/core/analytics/sharing";
import { requiresTest, requiresWork } from "@/core/courses/completion";
import { starterRubric } from "@/core/courses/starter-rubric";
import { isLocale, localize } from "@/core/i18n/locales";
import { DEFAULT_PASS_PERCENT } from "@/core/questions/questions";
import { rubricSchema } from "@/core/review/rubric";
import { sameJson } from "@/core/shared/json";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { getCourseEditor } from "@/server/studio/course-context";
import { publishCheckFor } from "@/server/studio/courses";
import { courseStats } from "@/server/studio/insights";
import { sharingNumbers } from "@/server/studio/sharing";
import { getStudioText } from "@/server/studio-text";

type StepState = "done" | "todo" | "attention";

const STATE_ICON = {
  done: { icon: CircleCheck, color: "var(--status-good)" },
  todo: { icon: Circle, color: "var(--ui-muted)" },
  attention: { icon: TriangleAlert, color: "var(--status-warning)" },
} as const;

const USD: Intl.NumberFormatOptions = {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
};

export default async function StudioCoursePage({
  params,
}: PageProps<"/studio/courses/[courseId]">) {
  const { courseId } = await params;
  const { tenant, roles } = await requireCapability("courses.view", `/studio/courses/${courseId}`);
  const t = await getStudioText();
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor) notFound();
  const stats = await courseStats(getDb(), tenant.id, courseId);
  const sharing = await sharingNumbers(getDb(), tenant.id, {
    ...periodWindow(DEFAULT_PERIOD),
    courseId,
  });
  // Only once there is something to share: drafts keep their page to the steps.
  const showSharing = stats.credentials > 0 || sharing.views.total > 0 || sharing.newLearners > 0;
  const check = publishCheckFor(editor, {
    legalLinks: tenant.settings.legal_links,
    aiReview: tenant.settings.features.ai_review,
  });
  const base = `/studio/courses/${courseId}`;
  const canEdit = can(roles, "courses.edit");
  const primary = tenant.settings.default_locale;

  const rubric = editor.rubric ? rubricSchema.parse(editor.rubric.definition) : null;
  const issues = [...check.errors, ...check.warnings];
  const has = (code: string) => issues.some((issue) => issue.code === code);
  const keys = new Set(editor.lessons.map((lesson) => lesson.key));
  const taught = check.coverage.filter((row) => row.lessonKeys.length > 0).length;
  // Unchanged since creation: the generic criteria still need to become specific.
  const starter = rubric
    ? sameJson(rubric.criteria, starterRubric(editor.course.languages.filter(isLocale)).criteria)
    : false;
  const work = requiresWork(editor.course.completionMode);
  const test = requiresTest(editor.course.completionMode);
  const questions = editor.test?.questions.length ?? 0;
  const passPercent = editor.test?.passPercent ?? DEFAULT_PASS_PERCENT;

  type Step = { title: string; detail: string; state: StepState; href: string };
  const workSteps: Step[] = [
    {
      title: t.t("courses.step.outcome"),
      detail: editor.assignment
        ? t.t("courses.overview.outcome.done", {
            artifact: localize(editor.assignment.artifactName, primary),
          })
        : t.t("courses.overview.outcome.todo"),
      state: editor.assignment && !has("missing_assignment_text") ? "done" : "todo",
      href: `${base}/outcome`,
    },
    {
      title: t.t("courses.step.rubric"),
      detail: rubric
        ? `${t.n("courses.overview.rubric.done", rubric.criteria.length, { threshold: rubric.pass_threshold })}${starter ? ` · ${t.t("courses.overview.rubric.starter")}` : ""}`
        : t.t("courses.overview.rubric.todo"),
      state: !rubric ? "todo" : starter ? "attention" : "done",
      href: `${base}/outcome#rubric`,
    },
  ];
  const testStep: Step = {
    title: t.t("courses.step.test"),
    detail: questions
      ? t.n("courses.overview.test.done", questions, { percent: passPercent })
      : t.t("courses.overview.test.todo"),
    // Done once nothing about the test blocks publishing.
    state:
      has("no_test") || has("missing_test_text")
        ? "todo"
        : has("test_too_short") ||
            issues.some((issue) => issue.finding?.context === "test_question")
          ? "attention"
          : "done",
    href: `${base}/test`,
  };

  const steps: Step[] = [
    ...(work ? workSteps : []),
    ...(test ? [testStep] : []),
    {
      title: t.t("courses.step.lessons"),
      detail: !keys.size
        ? t.t("courses.overview.lessons.todo")
        : work
          ? `${t.n("common.lesson", keys.size)} · ${t.n("courses.overview.lessons.taught", check.coverage.length, { taught })}`
          : t.n("common.lesson", keys.size),
      state:
        keys.size === 0 || has("no_lessons")
          ? "todo"
          : has("criterion_not_taught") || has("missing_translation") || has("empty_lesson")
            ? "attention"
            : "done",
      href: `${base}/lessons`,
    },
    {
      title: t.t("courses.step.details"),
      detail: editor.course.estMinutes
        ? t.n("courses.overview.details.duration", editor.course.estMinutes)
        : t.t("courses.overview.details.todo"),
      state: has("missing_title") ? "todo" : has("no_duration") ? "attention" : "done",
      href: `${base}/details`,
    },
    {
      title: t.t("courses.step.publish"),
      detail:
        editor.course.status === "published"
          ? t.t("courses.overview.publish.live")
          : check.ok
            ? t.t("courses.overview.publish.ready")
            : t.n("courses.overview.publish.blocking", check.errors.length),
      state: editor.course.status === "published" ? "done" : check.ok ? "attention" : "todo",
      href: `${base}/publish`,
    },
  ];

  return (
    <div className="space-y-10">
      <section
        aria-label={t.t("courses.overview.learners")}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <StatTile
          locale={t.locale}
          label={t.t("courses.overview.started")}
          value={stats.enrolled}
        />
        <StatTile
          locale={t.locale}
          label={t.t("courses.overview.completed")}
          value={stats.completed}
        />
        {work ? (
          <StatTile
            locale={t.locale}
            label={t.t("courses.overview.waiting")}
            value={stats.pendingReviews}
          />
        ) : (
          <StatTile
            locale={t.locale}
            label={t.t("courses.overview.tookTest")}
            value={stats.test.takers}
          />
        )}
        <StatTile
          locale={t.locale}
          label={t.t("courses.overview.certificates")}
          value={stats.credentials}
          hint={t.t("courses.overview.public", { n: stats.publicCredentials })}
        />
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="steps-heading" className="card-flat p-5">
          <h2 id="steps-heading" className="text-lg font-semibold">
            {t.t("courses.overview.steps")}
          </h2>
          <p className="text-sm text-muted">{t.t("courses.overview.stepsIntro")}</p>
          <ol className="mt-4 divide-y divide-line">
            {steps.map((step, index) => {
              const state = STATE_ICON[step.state];
              const body = (
                <>
                  <state.icon
                    role="img"
                    aria-label={t.t(`courses.overview.state.${step.state}`)}
                    size={20}
                    className="mt-0.5 shrink-0"
                    style={{ color: state.color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      {index + 1}. {step.title}
                    </span>
                    <span className="text-sm text-muted">{step.detail}</span>
                  </span>
                  {canEdit && (
                    <ArrowRight aria-hidden size={18} className="mt-0.5 shrink-0 text-muted" />
                  )}
                </>
              );
              return (
                <li key={step.title}>
                  {canEdit ? (
                    <Link
                      href={step.href as Route}
                      className="-mx-2 flex gap-3 rounded-control px-2 py-3 hover:bg-subtle"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex gap-3 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <div className="space-y-6">
          {work && (
            <section aria-labelledby="review-heading" className="card-flat space-y-4 p-5">
              <div>
                <h2 id="review-heading" className="text-lg font-semibold">
                  {t.t("courses.overview.review.title")}
                </h2>
                <p className="text-sm text-muted">{t.t("courses.overview.review.intro")}</p>
              </div>
              <dl className="grid gap-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">{t.t("courses.overview.review.aiReviews")}</dt>
                  <dd className="font-semibold tabular-nums">{stats.aiReviews}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">{t.t("courses.overview.review.agreement")}</dt>
                  <dd className="text-right font-semibold tabular-nums">
                    {stats.agreement ? (
                      <>
                        {Math.round(stats.agreement.rate * 100)} %
                        <span className="block text-xs font-normal text-muted">
                          {t.t("courses.overview.review.sample", { n: stats.agreement.sample })}
                        </span>
                      </>
                    ) : (
                      <span className="font-normal text-muted">
                        {t.t("courses.overview.review.noChecks")}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">{t.t("courses.overview.review.cost")}</dt>
                  <dd className="font-semibold tabular-nums">
                    {stats.avgCostMicroUsd === null ? (
                      <span className="font-normal text-muted">
                        {t.t("courses.overview.review.notReported")}
                      </span>
                    ) : (
                      t.number(stats.avgCostMicroUsd / 1_000_000, USD)
                    )}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">{t.t("courses.overview.review.mode")}</dt>
                  <dd className="font-semibold">
                    {rubric?.review_policy.mode === "human_only"
                      ? t.t("courses.overview.review.mode.human_only")
                      : rubric?.review_policy.mode === "ai_then_human"
                        ? t.t("courses.overview.review.mode.ai_then_human")
                        : t.t("courses.overview.review.mode.ai_auto")}
                  </dd>
                </div>
              </dl>
              {stats.pendingReviews > 0 && can(roles, "reviews.decide") && (
                <Link href="/studio/reviews" className="btn btn-secondary btn-sm">
                  {t.t("courses.overview.review.openQueue")}
                </Link>
              )}
            </section>
          )}

          {test && (
            <section aria-labelledby="test-heading" className="card-flat space-y-4 p-5">
              <div>
                <h2 id="test-heading" className="text-lg font-semibold">
                  {t.t("courses.overview.testCard.title")}
                </h2>
                <p className="text-sm text-muted">{t.t("courses.overview.testCard.intro")}</p>
              </div>
              <dl className="grid gap-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">{t.t("courses.overview.testCard.attempts")}</dt>
                  <dd className="font-semibold tabular-nums">{t.number(stats.test.attempts)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">{t.t("courses.overview.testCard.passed")}</dt>
                  <dd className="font-semibold tabular-nums">
                    {t.t("courses.overview.testCard.passedOf", {
                      passed: stats.test.passed,
                      takers: stats.test.takers,
                    })}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">{t.t("courses.overview.testCard.rate")}</dt>
                  <dd className="text-right font-semibold tabular-nums">
                    {stats.test.takers > 0 ? (
                      <>
                        {Math.round((stats.test.passed / stats.test.takers) * 100)} %
                        <span className="block text-xs font-normal text-muted">
                          {t.t("courses.overview.testCard.rateHint")}
                        </span>
                      </>
                    ) : (
                      <span className="font-normal text-muted">
                        {t.t("courses.overview.testCard.none")}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">{t.t("courses.overview.testCard.passMark")}</dt>
                  <dd className="font-semibold tabular-nums">{passPercent} %</dd>
                </div>
              </dl>
              {canEdit && (
                <Link href={`${base}/test` as Route} className="btn btn-secondary btn-sm">
                  {t.t("courses.overview.testCard.edit")}
                </Link>
              )}
            </section>
          )}

          {showSharing && <CourseSharingCard t={t} summary={sharing} days={DEFAULT_PERIOD} />}
        </div>
      </div>
    </div>
  );
}

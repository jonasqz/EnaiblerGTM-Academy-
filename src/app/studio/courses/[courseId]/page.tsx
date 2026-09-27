import { ArrowRight, Circle, CircleCheck, TriangleAlert } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatTile } from "@/components/ui/stat-tile";
import { can } from "@/core/access/roles";
import { starterRubric } from "@/core/courses/starter-rubric";
import { isLocale, localize } from "@/core/i18n/locales";
import { rubricSchema } from "@/core/review/rubric";
import { sameJson } from "@/core/shared/json";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { getCourseEditor } from "@/server/studio/course-context";
import { publishCheckFor } from "@/server/studio/courses";
import { courseStats } from "@/server/studio/insights";

type StepState = "done" | "todo" | "attention";

const STATE_ICON = {
  done: { icon: CircleCheck, color: "var(--status-good)", label: "Done" },
  todo: { icon: Circle, color: "var(--ui-muted)", label: "To do" },
  attention: { icon: TriangleAlert, color: "var(--status-warning)", label: "Needs attention" },
} as const;

const usd = new Intl.NumberFormat("en", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});

export default async function StudioCoursePage({
  params,
}: PageProps<"/studio/courses/[courseId]">) {
  const { courseId } = await params;
  const { tenant, roles } = await requireCapability("studio.view", `/studio/courses/${courseId}`);
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor) notFound();
  const stats = await courseStats(getDb(), tenant.id, courseId);
  const check = publishCheckFor(editor, { legalLinks: tenant.settings.legal_links });
  const base = `/studio/courses/${courseId}`;
  const canEdit = can(roles, "courses.edit");
  const primary = tenant.settings.default_locale;

  const rubric = editor.rubric ? rubricSchema.parse(editor.rubric.definition) : null;
  const has = (code: string) =>
    [...check.errors, ...check.warnings].some((issue) => issue.code === code);
  const keys = new Set(editor.lessons.map((lesson) => lesson.key));
  const taught = check.coverage.filter((row) => row.lessonKeys.length > 0).length;
  // Unchanged since creation: the generic criteria still need to become specific.
  const starter = rubric
    ? sameJson(rubric.criteria, starterRubric(editor.course.languages.filter(isLocale)).criteria)
    : false;

  const steps: Array<{ title: string; detail: string; state: StepState; href: string }> = [
    {
      title: "Outcome",
      detail: editor.assignment
        ? `Learners build: ${localize(editor.assignment.artifactName, primary)}`
        : "Define what learners build.",
      state: editor.assignment && !has("missing_assignment_text") ? "done" : "todo",
      href: `${base}/outcome`,
    },
    {
      title: "Rubric",
      detail: rubric
        ? `${rubric.criteria.length} criteria, pass at ${rubric.pass_threshold} %${starter ? " · still the starter rubric" : ""}`
        : "Add criteria.",
      state: !rubric ? "todo" : starter ? "attention" : "done",
      href: `${base}/outcome#rubric`,
    },
    {
      title: "Lessons",
      detail: keys.size
        ? `${keys.size} ${keys.size === 1 ? "lesson" : "lessons"} · ${taught} of ${check.coverage.length} criteria taught`
        : "Write the first lesson.",
      state:
        keys.size === 0 || has("no_lessons")
          ? "todo"
          : has("criterion_not_taught") || has("missing_translation") || has("empty_lesson")
            ? "attention"
            : "done",
      href: `${base}/lessons`,
    },
    {
      title: "Details",
      detail: editor.course.estMinutes
        ? `About ${editor.course.estMinutes} minutes`
        : "Title, summary and duration per language.",
      state: has("missing_title") ? "todo" : has("no_duration") ? "attention" : "done",
      href: `${base}/details`,
    },
    {
      title: "Publish",
      detail:
        editor.course.status === "published"
          ? "Live for learners."
          : check.ok
            ? "Ready: every blocking check passes."
            : `${check.errors.length} blocking ${check.errors.length === 1 ? "issue" : "issues"} left.`,
      state: editor.course.status === "published" ? "done" : check.ok ? "attention" : "todo",
      href: `${base}/publish`,
    },
  ];

  return (
    <div className="space-y-10">
      <section aria-label="Learners" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Started" value={stats.enrolled} />
        <StatTile label="Completed" value={stats.completed} />
        <StatTile label="Waiting for review" value={stats.pendingReviews} />
        <StatTile
          label="Certificates"
          value={stats.credentials}
          hint={`${stats.publicCredentials} public`}
        />
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="steps-heading" className="card-flat p-5">
          <h2 id="steps-heading" className="text-lg font-semibold">
            Build steps
          </h2>
          <p className="text-sm text-muted">Outcome first, then everything that leads to it.</p>
          <ol className="mt-4 divide-y divide-line">
            {steps.map((step, index) => {
              const state = STATE_ICON[step.state];
              const body = (
                <>
                  <state.icon
                    role="img"
                    aria-label={state.label}
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

        <section aria-labelledby="review-heading" className="card-flat space-y-4 p-5">
          <div>
            <h2 id="review-heading" className="text-lg font-semibold">
              Review quality
            </h2>
            <p className="text-sm text-muted">
              How far the AI review can be trusted for this course (brief §8).
            </p>
          </div>
          <dl className="grid gap-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">AI reviews</dt>
              <dd className="font-semibold tabular-nums">{stats.aiReviews}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Agreement with human reviewers</dt>
              <dd className="text-right font-semibold tabular-nums">
                {stats.agreement ? (
                  <>
                    {Math.round(stats.agreement.rate * 100)} %
                    <span className="block text-xs font-normal text-muted">
                      of {stats.agreement.sample} checked
                    </span>
                  </>
                ) : (
                  <span className="font-normal text-muted">No human checks yet</span>
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Average cost per AI review</dt>
              <dd className="font-semibold tabular-nums">
                {stats.avgCostMicroUsd === null ? (
                  <span className="font-normal text-muted">Not reported</span>
                ) : (
                  usd.format(stats.avgCostMicroUsd / 1_000_000)
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Review mode</dt>
              <dd className="font-semibold">
                {rubric?.review_policy.mode === "human_only"
                  ? "Humans only"
                  : rubric?.review_policy.mode === "ai_then_human"
                    ? "AI drafts, human confirms"
                    : "AI decides, humans spot-check"}
              </dd>
            </div>
          </dl>
          {stats.pendingReviews > 0 && can(roles, "reviews.decide") && (
            <Link href="/studio/reviews" className="btn btn-secondary btn-sm">
              Open the review queue
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}

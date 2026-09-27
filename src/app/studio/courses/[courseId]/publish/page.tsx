import { CircleCheck, CircleX, Eye, Rocket, TriangleAlert } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { publishCourseAction, unpublishCourseAction } from "@/app/studio/actions";
import { LANGUAGE_NAMES } from "@/components/studio/language-names";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { can } from "@/core/access/roles";
import type { PublishIssue } from "@/core/courses/publish-check";
import { isLocale } from "@/core/i18n/locales";
import { requireCapability } from "@/server/access";
import { getCourseEditor } from "@/server/studio/course-context";
import { publishCheckFor } from "@/server/studio/courses";

export const metadata: Metadata = { title: "Publish" };

const dates = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** Where each finding is fixed. Wording findings name their context in the message. */
function fixTab(issue: PublishIssue): string {
  if (issue.code !== "wording") return FIX_TAB[issue.code];
  if (issue.message.includes("lesson text")) return "lessons";
  if (issue.message.includes("artifact name") || issue.message.includes("assignment prompt"))
    return "outcome";
  return "details";
}

const FIX_TAB: Record<PublishIssue["code"], string> = {
  no_languages: "details",
  missing_title: "details",
  wording: "details",
  no_lessons: "lessons",
  missing_translation: "lessons",
  empty_lesson: "lessons",
  no_assignment: "outcome",
  missing_assignment_text: "outcome",
  no_rubric: "outcome",
  criterion_not_taught: "lessons",
  delivery_mode: "details",
  no_duration: "details",
};

export default async function PublishPage({
  params,
  searchParams,
}: PageProps<"/studio/courses/[courseId]/publish">) {
  const { courseId } = await params;
  const { published, blocked, unpublished } = await searchParams;
  const { tenant, roles } = await requireCapability(
    "courses.edit",
    `/studio/courses/${courseId}/publish`,
  );
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor) notFound();
  const check = publishCheckFor(editor);
  const { course } = editor;
  const canPublish = can(roles, "courses.publish");
  const live = course.status === "published";
  const base = `/studio/courses/${courseId}`;

  const issueList = (issues: PublishIssue[], tone: "critical" | "warning") => (
    <ul className="divide-y divide-line">
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${index}`} className="flex items-start gap-3 py-3">
          {tone === "critical" ? (
            <CircleX
              role="img"
              aria-label="Blocks publishing"
              size={20}
              className="mt-0.5 shrink-0"
              style={{ color: "var(--status-critical)" }}
            />
          ) : (
            <TriangleAlert
              role="img"
              aria-label="Warning"
              size={20}
              className="mt-0.5 shrink-0"
              style={{ color: "var(--status-warning)" }}
            />
          )}
          <span className="min-w-0 flex-1 text-sm">
            {issue.message}
            {issue.locale && isLocale(issue.locale) && (
              <span className="text-muted"> · {LANGUAGE_NAMES[issue.locale]}</span>
            )}
          </span>
          <Link
            href={`${base}/${fixTab(issue)}` as Route}
            className="shrink-0 text-sm font-semibold hover:underline"
          >
            Fix
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      {published === "1" && (
        <Notice tone="good" title="Published">
          The course is live in the catalogue. Changes you make now reach learners right away.
        </Notice>
      )}
      {blocked === "1" && (
        <Notice tone="critical" title="Not published: fix the blocking issues first." />
      )}
      {unpublished === "1" && (
        <Notice tone="info" title="Unpublished">
          New learners cannot start it. Learners who started keep their progress and certificates.
        </Notice>
      )}

      <section className="card flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-card bg-primary-soft">
            <Rocket aria-hidden size={24} />
          </span>
          <div>
            <h2 className="text-lg font-semibold">
              {live
                ? "Live"
                : check.ok
                  ? "Ready to publish"
                  : `${check.errors.length} ${check.errors.length === 1 ? "issue blocks" : "issues block"} publishing`}
            </h2>
            <p className="text-sm text-muted">
              {live && course.publishedAt
                ? `Published ${dates.format(course.publishedAt)} · version ${course.version}`
                : "Preview it as a learner first. You can unpublish at any time."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/preview` as Route} className="btn btn-secondary">
            <Eye aria-hidden size={18} /> Preview as learner
          </Link>
          {canPublish && live && (
            <form action={unpublishCourseAction}>
              <input type="hidden" name="courseId" value={course.id} />
              <SubmitButton
                className="btn btn-danger"
                pendingLabel="Unpublishing…"
                confirm="Unpublish? New learners can no longer start this course."
              >
                Unpublish
              </SubmitButton>
            </form>
          )}
          {canPublish && !live && (
            <form action={publishCourseAction}>
              <input type="hidden" name="courseId" value={course.id} />
              <SubmitButton pendingLabel="Publishing…" disabled={!check.ok}>
                Publish
              </SubmitButton>
            </form>
          )}
        </div>
        {!canPublish && (
          <p className="w-full text-sm text-muted">Only authors and admins publish.</p>
        )}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="checks-heading" className="card-flat p-5">
          <h2 id="checks-heading" className="text-lg font-semibold">
            Checklist
          </h2>
          {check.errors.length === 0 && check.warnings.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-sm">
              <CircleCheck aria-hidden size={20} style={{ color: "var(--status-good)" }} /> Every
              check passes.
            </p>
          ) : (
            <>
              {check.errors.length > 0 && (
                <div className="mt-3">
                  <p className="eyebrow">Blocks publishing</p>
                  {issueList(check.errors, "critical")}
                </div>
              )}
              {check.warnings.length > 0 && (
                <div className="mt-3">
                  <p className="eyebrow">Worth a look</p>
                  {issueList(check.warnings, "warning")}
                </div>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="coverage-heading" className="card-flat p-5">
          <h2 id="coverage-heading" className="text-lg font-semibold">
            Coverage map
          </h2>
          <p className="text-sm text-muted">
            Every criterion the review scores should be taught somewhere.
          </p>
          <ul className="mt-3 divide-y divide-line">
            {check.coverage.map((row) => (
              <li
                key={row.criterionId}
                className="flex items-start justify-between gap-3 py-3 text-sm"
              >
                <span className="font-semibold">{row.label}</span>
                <span className="text-right text-muted">
                  {row.lessonKeys.length === 0 ? (
                    <span className="font-semibold" style={{ color: "var(--status-serious)" }}>
                      Not taught
                    </span>
                  ) : (
                    row.lessonKeys
                      .map(
                        (key) => editor.lessons.find((lesson) => lesson.key === key)?.title ?? key,
                      )
                      .join(" · ")
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

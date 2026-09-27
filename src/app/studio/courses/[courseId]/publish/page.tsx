import { CircleCheck, CircleX, Eye, Rocket, TriangleAlert } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { publishCourseAction, unpublishCourseAction } from "@/app/studio/actions";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { can } from "@/core/access/roles";
import { requiresWork } from "@/core/courses/completion";
import type { PublishIssue } from "@/core/courses/publish-check";
import { isLocale } from "@/core/i18n/locales";
import { languageName, publishIssueText } from "@/core/i18n/studio/helpers";
import { requireCapability } from "@/server/access";
import { getCourseEditor } from "@/server/studio/course-context";
import { publishCheckFor } from "@/server/studio/courses";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("courses.step.publish") };
}

/** Where each finding is fixed. Wording findings carry the context the word was found in. */
function fixHref(issue: PublishIssue, base: string): string {
  if (issue.code === "legal_pages_missing") return "/studio/settings";
  return `${base}/${fixTab(issue)}`;
}

function fixTab(issue: PublishIssue): string {
  if (issue.code !== "wording") return FIX_TAB[issue.code];
  const context = issue.finding?.context;
  if (context === "lesson_text") return "lessons";
  if (context === "test_question") return "test";
  if (context === "artifact_name" || context === "assignment_prompt") return "outcome";
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
  no_test: "test",
  missing_test_text: "test",
  test_too_short: "test",
  delivery_mode: "details",
  no_duration: "details",
  legal_pages_missing: "details",
  calibration_missing: "calibrate",
  calibration_low: "calibrate",
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
  const t = await getStudioText();
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor) notFound();
  const check = publishCheckFor(editor, {
    legalLinks: tenant.settings.legal_links,
    aiReview: tenant.settings.features.ai_review,
  });
  const { course } = editor;
  const canPublish = can(roles, "courses.publish");
  const live = course.status === "published";
  const base = `/studio/courses/${courseId}`;
  // Only work has a rubric whose criteria lessons should teach.
  const coverage = requiresWork(course.completionMode);

  const issueList = (issues: PublishIssue[], tone: "critical" | "warning") => (
    <ul className="divide-y divide-line">
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${index}`} className="flex items-start gap-3 py-3">
          {tone === "critical" ? (
            <CircleX
              role="img"
              aria-label={t.t("courses.publish.blocks")}
              size={20}
              className="mt-0.5 shrink-0"
              style={{ color: "var(--status-critical)" }}
            />
          ) : (
            <TriangleAlert
              role="img"
              aria-label={t.t("courses.publish.warning")}
              size={20}
              className="mt-0.5 shrink-0"
              style={{ color: "var(--status-warning)" }}
            />
          )}
          <span className="min-w-0 flex-1 text-sm">
            {publishIssueText(t, issue)}
            {issue.locale && isLocale(issue.locale) && (
              <span className="text-muted"> · {languageName(t, issue.locale)}</span>
            )}
          </span>
          <Link
            href={fixHref(issue, base) as Route}
            className="shrink-0 text-sm font-semibold hover:underline"
          >
            {t.t("courses.publish.fix")}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      {published === "1" && (
        <Notice tone="good" title={t.t("courses.publish.publishedTitle")}>
          {t.t("courses.publish.publishedBody")}
        </Notice>
      )}
      {blocked === "1" && <Notice tone="critical" title={t.t("courses.publish.blockedNotice")} />}
      {unpublished === "1" && (
        <Notice tone="info" title={t.t("courses.publish.unpublishedTitle")}>
          {t.t("courses.publish.unpublishedBody")}
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
                ? t.t("courses.publish.live")
                : check.ok
                  ? t.t("courses.publish.ready")
                  : t.n("courses.publish.blocked", check.errors.length)}
            </h2>
            <p className="text-sm text-muted">
              {live && course.publishedAt
                ? t.t("courses.publish.publishedOn", {
                    date: t.date(course.publishedAt, "dateTime"),
                    version: course.version,
                  })
                : t.t("courses.publish.previewFirst")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/preview` as Route} className="btn btn-secondary">
            <Eye aria-hidden size={18} /> {t.t("courses.previewAsLearner")}
          </Link>
          {canPublish && live && (
            <form action={unpublishCourseAction}>
              <input type="hidden" name="courseId" value={course.id} />
              <SubmitButton
                className="btn btn-danger"
                pendingLabel={t.t("courses.publish.unpublishing")}
                confirm={t.t("courses.publish.unpublishConfirm")}
              >
                {t.t("courses.publish.unpublish")}
              </SubmitButton>
            </form>
          )}
          {canPublish && !live && (
            <form action={publishCourseAction}>
              <input type="hidden" name="courseId" value={course.id} />
              <SubmitButton pendingLabel={t.t("courses.publish.publishing")} disabled={!check.ok}>
                {t.t("courses.publish.publish")}
              </SubmitButton>
            </form>
          )}
        </div>
        {!canPublish && (
          <p className="w-full text-sm text-muted">{t.t("courses.publish.onlyPublishers")}</p>
        )}
      </section>

      <div className={`grid items-start gap-6 ${coverage ? "lg:grid-cols-2" : ""}`}>
        <section aria-labelledby="checks-heading" className="card-flat p-5">
          <h2 id="checks-heading" className="text-lg font-semibold">
            {t.t("courses.publish.checklist")}
          </h2>
          {check.errors.length === 0 && check.warnings.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-sm">
              <CircleCheck aria-hidden size={20} style={{ color: "var(--status-good)" }} />{" "}
              {t.t("courses.publish.allPass")}
            </p>
          ) : (
            <>
              {check.errors.length > 0 && (
                <div className="mt-3">
                  <p className="eyebrow">{t.t("courses.publish.blocks")}</p>
                  {issueList(check.errors, "critical")}
                </div>
              )}
              {check.warnings.length > 0 && (
                <div className="mt-3">
                  <p className="eyebrow">{t.t("courses.publish.worthALook")}</p>
                  {issueList(check.warnings, "warning")}
                </div>
              )}
            </>
          )}
        </section>

        {coverage && (
          <section aria-labelledby="coverage-heading" className="card-flat p-5">
            <h2 id="coverage-heading" className="text-lg font-semibold">
              {t.t("courses.publish.coverage")}
            </h2>
            <p className="text-sm text-muted">{t.t("courses.publish.coverageIntro")}</p>
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
                        {t.t("courses.publish.notTaught")}
                      </span>
                    ) : (
                      row.lessonKeys
                        .map(
                          (key) =>
                            editor.lessons.find((lesson) => lesson.key === key)?.title ?? key,
                        )
                        .join(" · ")
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

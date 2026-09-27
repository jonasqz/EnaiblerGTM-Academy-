import { ArrowLeft, Award, Clock, Hammer, RotateCcw, CircleCheck } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { SubmissionForm } from "@/app/(academy)/courses/[slug]/assignment/submission-form";
import { FeedbackView } from "@/components/feedback-view";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/ui/markdown";
import { Notice } from "@/components/ui/notice";
import { localize } from "@/core/i18n/locales";
import { canResubmit, type Outcome } from "@/core/review/outcome";
import { getDb } from "@/db/client";
import { requireViewer } from "@/server/access";
import { loadLearnerCourse } from "@/server/learning";
import { getTranslator } from "@/server/request";

export default async function AssignmentPage({ params }: PageProps<"/courses/[slug]/assignment">) {
  const { slug } = await params;
  const { tenant, viewer } = await requireViewer(`/courses/${slug}/assignment`);
  const t = await getTranslator();
  const data = await loadLearnerCourse(getDb(), tenant, slug, viewer.userId, t.locale);
  if (!data || !data.assignment || !data.rubric) notFound();
  if (!data.enrollment) redirect(`/courses/${slug}`);

  const fallback = [tenant.settings.default_locale];
  const latest = data.attempts[0] ?? null;
  const outcomeBadge = (outcome: Outcome) =>
    outcome === "passed" ? (
      <Badge tone="good" icon={CircleCheck}>
        {t.t("assignment.passed")}
      </Badge>
    ) : outcome === "needs_revision" ? (
      <Badge tone="warning" icon={RotateCcw}>
        {t.t("assignment.needsRevision")}
      </Badge>
    ) : (
      <Badge tone="info" icon={Clock}>
        {t.t("assignment.inReview")}
      </Badge>
    );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        href={`/courses/${slug}`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> {localize(data.course.title, data.locale, fallback)}
      </Link>

      <header className="space-y-3">
        <p className="eyebrow">{t.term("assignment")}</p>
        <h1 className="flex items-center gap-3 font-display text-3xl leading-tight">
          <Hammer aria-hidden size={28} className="shrink-0" />
          {localize(data.assignment.artifactName, data.locale, fallback)}
        </h1>
        <Markdown source={localize(data.assignment.prompt, data.locale, fallback)} />
      </header>

      <section className="card-flat space-y-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">{t.t("assignment.criteria")}</h2>
          <p className="text-sm text-muted">
            {t.t("assignment.passAt", { threshold: data.rubric.pass_threshold })}
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {data.rubric.criteria.map((criterion) => (
            <li key={criterion.id} className="text-sm">
              <span className="font-semibold">
                {localize(criterion.label, data.locale, fallback)}
              </span>
              <span className="text-muted">
                {" "}
                · {localize(criterion.description, data.locale, fallback)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {data.credential && (
        <Notice tone="good" title={t.t("assignment.passed")}>
          <Link
            href={`/verify/${data.credential.publicId}`}
            className="inline-flex items-center gap-1.5 font-semibold underline"
          >
            <Award aria-hidden size={16} /> {t.t("course.viewCredential")}
          </Link>
        </Notice>
      )}
      {latest?.outcome === "pending" && (
        <Notice tone="info" title={t.t("assignment.inReview")}>
          {t.t("assignment.pending")}
        </Notice>
      )}

      {canResubmit(latest?.outcome ?? null) && (
        <section className="card space-y-4 p-6" aria-labelledby="work-heading">
          <h2 id="work-heading" className="font-display text-2xl">
            {latest ? t.t("assignment.revise") : t.t("assignment.yourWork")}
          </h2>
          <SubmissionForm
            slug={slug}
            acceptsText={data.acceptsText}
            acceptsUrl={data.acceptsUrl}
            fields={data.formFields}
            labels={{
              text: t.t("assignment.textLabel"),
              url: t.t("assignment.urlLabel"),
              submit: t.t("assignment.submit"),
              submitting: t.t("assignment.submitting"),
              required: t.t("assignment.required"),
              errors: {
                empty: t.t("assignment.errorEmpty"),
                not_allowed: t.t("assignment.errorNotAllowed"),
                invalid: t.t("assignment.errorInvalid"),
                not_enrolled: t.t("assignment.errorNotEnrolled"),
              },
            }}
          />
        </section>
      )}

      {data.attempts.length > 0 && (
        <section id="attempts" className="scroll-mt-8 space-y-4" aria-labelledby="attempts-heading">
          <h2 id="attempts-heading" className="font-display text-2xl">
            {t.t("assignment.history")}
          </h2>
          <ol className="space-y-4">
            {data.attempts.map((attempt) => (
              <li key={attempt.id} className="card-flat space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {t.t("assignment.attempt", { n: attempt.attemptNo })}
                    <span className="ml-2 text-sm font-normal text-muted">
                      {attempt.submittedAt.toLocaleDateString(
                        t.locale === "de" ? "de-DE" : "en-GB",
                        { dateStyle: "medium" },
                      )}
                    </span>
                  </p>
                  <span className="flex items-center gap-2">
                    {attempt.feedback && (
                      <span className="text-sm font-semibold tabular-nums">
                        {Math.round(attempt.feedback.overall.percent)} %
                      </span>
                    )}
                    {outcomeBadge(attempt.outcome)}
                  </span>
                </div>
                {attempt.feedback && (
                  <>
                    <p className="text-xs text-muted">
                      {attempt.feedback.reviewer === "ai"
                        ? t.t("assignment.reviewerAi")
                        : t.t("assignment.reviewerHuman")}
                    </p>
                    <FeedbackView
                      rubric={data.rubric!}
                      criteria={attempt.feedback.criteria}
                      summary={attempt.feedback.overall.summary}
                      locale={data.locale}
                      fallback={fallback}
                    />
                  </>
                )}
                {attempt.text && (
                  <details className="text-sm">
                    <summary className="cursor-pointer font-semibold">
                      {t.t("assignment.yourWork")}
                    </summary>
                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-control bg-subtle p-3 font-mono text-xs">
                      {attempt.text}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

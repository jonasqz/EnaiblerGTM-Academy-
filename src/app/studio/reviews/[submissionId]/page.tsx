import { ArrowLeft, Bot, ExternalLink, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { DecisionForm } from "@/app/studio/reviews/[submissionId]/decision-form";
import { FeedbackView } from "@/components/feedback-view";
import { LANGUAGE_NAMES } from "@/components/studio/language-names";
import { AUDIT_LABELS, HOLD_REASON_LABELS, timeAgo } from "@/components/studio/review-labels";
import { SubmissionStatusBadge } from "@/components/studio/status-badges";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/ui/markdown";
import { SubmittedFiles } from "@/components/submitted-files";
import { formFieldsFromSchema } from "@/core/assignments/submission-types";
import { isLocale, localize } from "@/core/i18n/locales";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { loadReviewDetail } from "@/server/studio/reviews";

export const metadata: Metadata = { title: "Review" };

const usd = new Intl.NumberFormat("en", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});

export default async function ReviewDetailPage({
  params,
}: PageProps<"/studio/reviews/[submissionId]">) {
  const { submissionId } = await params;
  const { tenant } = await requireCapability("reviews.decide", `/studio/reviews/${submissionId}`);
  if (!z.uuid().safeParse(submissionId).success) notFound();
  const detail = await loadReviewDetail(getDb(), tenant.id, submissionId);
  if (!detail) notFound();
  const { submission, rubric } = detail;
  const locale = isLocale(detail.locale) ? detail.locale : tenant.settings.default_locale;
  const fallback = [tenant.settings.default_locale];
  const ai = detail.reviews.find((review) => review.reviewerType === "ai") ?? null;
  const humans = detail.reviews.filter((review) => review.reviewerType === "human");
  const latestHuman = humans[0] ?? null;
  const base = latestHuman ?? ai;
  const form = detail.assignment.submissionTypes.find((type) => type.type === "template_form");
  const fields = form?.type === "template_form" ? formFieldsFromSchema(form.schema) : null;
  const mode = latestHuman
    ? "change"
    : submission.status === "submitted" || submission.status === "in_review"
      ? "decide"
      : "check";

  return (
    <div className="space-y-6">
      <Link
        href="/studio/reviews"
        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> Review queue
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="eyebrow">{localize(detail.course.title, tenant.settings.default_locale)}</p>
          <h1 className="font-display text-2xl leading-tight sm:text-3xl">
            Attempt {submission.attemptNo}
          </h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <SubmissionStatusBadge status={submission.status} />
            <span className="font-mono font-semibold text-ink">{detail.alias}</span>
            <span>Handed in {timeAgo(submission.submittedAt)}</span>
            <span>{LANGUAGE_NAMES[locale]}</span>
            <span>Rubric version {detail.rubricVersion}</span>
          </p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section aria-labelledby="work-heading" className="card space-y-4 p-5 sm:p-6">
            <h2 id="work-heading" className="text-lg font-semibold">
              The work
            </h2>
            {submission.formData && (
              <dl className="space-y-3">
                {Object.entries(submission.formData).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-sm font-semibold">
                      {fields?.find((field) => field.key === key)?.title ?? key}
                    </dt>
                    <dd className="whitespace-pre-wrap text-[0.9375rem]">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {submission.url && (
              <p>
                <a
                  href={submission.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1.5 font-semibold underline underline-offset-4"
                >
                  {submission.url} <ExternalLink aria-hidden size={14} />
                </a>
              </p>
            )}
            {submission.extractedText && (
              <div className="max-h-[36rem] overflow-y-auto rounded-control bg-subtle p-4">
                <Markdown source={submission.extractedText} untrusted />
              </div>
            )}
            {submission.files.length > 0 && (
              <SubmittedFiles files={submission.files} label="Files" />
            )}
            {submission.filesText && (
              <details className="rounded-control bg-subtle p-4">
                <summary className="cursor-pointer text-sm font-semibold">
                  Text read from the files (what the AI review saw)
                </summary>
                <pre className="mt-3 max-h-[36rem] overflow-y-auto whitespace-pre-wrap font-mono text-xs">
                  {submission.filesText}
                </pre>
              </details>
            )}
          </section>

          {ai && (
            <section aria-labelledby="ai-heading" className="card-flat space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="ai-heading" className="flex items-center gap-2 text-lg font-semibold">
                  <Bot aria-hidden size={20} /> AI review
                </h2>
                <p className="text-sm font-semibold tabular-nums">
                  {ai.overall.percent} % · {ai.overall.pass ? "pass" : "needs revision"}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ai.routing?.release === false &&
                  ai.routing.reasons.map((reason) => (
                    <Badge key={reason} tone="warning">
                      {HOLD_REASON_LABELS[reason] ?? reason}
                    </Badge>
                  ))}
                {ai.routing?.release === true && (
                  <Badge tone="info">
                    Released
                    {ai.routing.audit
                      ? ` · ${AUDIT_LABELS[ai.routing.audit] ?? ai.routing.audit}`
                      : ""}
                  </Badge>
                )}
              </div>
              <FeedbackView
                rubric={rubric}
                criteria={ai.criteria}
                summary={ai.overall.summary}
                locale={locale}
                fallback={fallback}
              />
              <p className="text-xs text-muted">
                {[
                  ai.model,
                  ai.promptVersion && `prompt ${ai.promptVersion}`,
                  ai.tokensIn !== null && `${ai.tokensIn + (ai.tokensOut ?? 0)} tokens`,
                  ai.costMicroUsd !== null && usd.format(ai.costMicroUsd / 1_000_000),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </section>
          )}

          {humans.length > 0 && (
            <section aria-labelledby="human-heading" className="card-flat space-y-3 p-5 sm:p-6">
              <h2 id="human-heading" className="flex items-center gap-2 text-lg font-semibold">
                <UserCheck aria-hidden size={20} /> Human decisions
              </h2>
              <ol className="space-y-3">
                {humans.map((review) => (
                  <li key={review.id} className="rounded-control border border-line p-3 text-sm">
                    <p className="font-semibold tabular-nums">
                      {review.overall.percent} % · {review.overall.pass ? "pass" : "needs revision"}
                      <span className="font-normal text-muted"> · {timeAgo(review.createdAt)}</span>
                    </p>
                    {review.overrideReason && (
                      <p className="mt-1 text-muted">Reason: {review.overrideReason}</p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <section aria-labelledby="decision-heading" className="space-y-3">
          <h2 id="decision-heading" className="text-lg font-semibold">
            {mode === "change"
              ? "Change the decision"
              : mode === "check"
                ? "Your spot check"
                : "Your decision"}
          </h2>
          <DecisionForm
            submissionId={submission.id}
            rubric={rubric}
            criteria={rubric.criteria.map((criterion) => ({
              id: criterion.id,
              label: localize(criterion.label, locale, fallback),
              description: localize(criterion.description, locale, fallback),
              levels: criterion.score_descriptors.map((level) => ({
                score: level.score,
                description: localize(level.description, locale, fallback),
              })),
            }))}
            initialScores={Object.fromEntries(
              (base?.criteria ?? []).map((row) => [row.criterionId, row.score]),
            )}
            initialFeedback={Object.fromEntries(
              (base?.criteria ?? []).map((row) => [row.criterionId, row.feedback]),
            )}
            initialSummary={base?.overall.summary ?? ""}
            aiPass={ai ? ai.overall.pass : null}
            learnerLanguage={LANGUAGE_NAMES[locale]}
            mode={mode}
          />
        </section>
      </div>
    </div>
  );
}

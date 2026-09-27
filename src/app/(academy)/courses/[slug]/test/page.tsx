import { ArrowLeft, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { TestForm, type TestStanding } from "@/app/(academy)/courses/[slug]/test/test-form";
import { requiresWork } from "@/core/courses/completion";
import { localize } from "@/core/i18n/locales";
import { getDb } from "@/db/client";
import { requireViewer } from "@/server/access";
import { loadLearnerCourse } from "@/server/learning";
import { getTranslator } from "@/server/request";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t.term("test"), robots: { index: false } };
}

/** The final test of a course whose authors chose one (core/courses/completion). */
export default async function TestPage({ params }: PageProps<"/courses/[slug]/test">) {
  const { slug } = await params;
  const { tenant, viewer } = await requireViewer(`/courses/${slug}/test`);
  const t = await getTranslator();
  const data = await loadLearnerCourse(getDb(), tenant, slug, viewer.userId, t.locale);
  if (!data || !data.test) notFound();
  if (!data.enrollment) redirect(`/courses/${slug}`);

  const { test } = data;
  const fallback = [tenant.settings.default_locale];
  const { passed, latest } = test.attempts;
  const standing: TestStanding = passed
    ? {
        kind: "passed",
        credentialId: data.credential?.publicId ?? null,
        correct: passed.correct,
        total: passed.total,
        percent: passed.percent,
      }
    : data.credential
      ? { kind: "completed", credentialId: data.credential.publicId }
      : {
          kind: "open",
          last: latest
            ? { correct: latest.correct, total: latest.total, percent: latest.percent }
            : null,
        };
  const count = test.questions.length;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        href={`/courses/${slug}`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> {localize(data.course.title, data.locale, fallback)}
      </Link>

      <header className="space-y-3">
        <h1 className="flex items-center gap-3 font-display text-3xl leading-tight">
          <ListChecks aria-hidden size={28} className="shrink-0" />
          {t.term("test")}
        </h1>
        <p className="text-sm font-semibold">
          {count === 1
            ? t.t("course.test.questionsOne")
            : t.t("course.test.questions", { n: count })}{" "}
          · {t.t("assignment.passAt", { threshold: test.passPercent })}
        </p>
        {standing.kind === "open" && <p className="text-muted">{t.t("test.intro")}</p>}
      </header>

      <TestForm
        slug={slug}
        version={test.version}
        questions={test.questions}
        standing={standing}
        work={{
          missing:
            requiresWork(data.completionMode) && !data.workPassed && data.credential === null,
          inReview: data.attempts[0]?.outcome === "pending",
        }}
        labels={{
          questionOf: t.t("test.questionOf"),
          questionN: t.t("test.questionN"),
          chooseAll: t.t("test.chooseAll"),
          answerMissing: t.t("test.answerMissing"),
          submit: t.t("test.submit"),
          submitting: t.t("test.submitting"),
          lastAttempt: t.t("test.lastAttempt"),
          passAt: t.t("assignment.passAt", { threshold: test.passPercent }),
          errors: {
            not_enrolled: t.t("assignment.errorNotEnrolled"),
            no_test: t.t("test.errorNoTest"),
            changed: t.t("test.errorChanged"),
            unanswered: t.t("test.errorUnanswered"),
            passed: t.t("test.errorPassed"),
            completed: t.t("test.errorCompleted"),
          },
          resultPassed: t.t("test.resultPassed"),
          resultFailed: t.t("test.resultFailed"),
          score: t.t("test.score"),
          wrongTitle: t.t("test.wrongTitle"),
          wrongHint: t.t("test.wrongHint"),
          tryAgainHint: t.t("test.tryAgainHint"),
          retake: t.t("course.test.retake"),
          credentialReady: t.t("test.credentialReady"),
          credentialPrivate: t.t("test.credentialPrivate"),
          viewCredential: t.t("course.viewCredential"),
          oneStepLeft: t.t("test.oneStepLeft"),
          workMissing: t.t("test.workMissing"),
          workInReview: t.t("test.workInReview"),
          openAssignment: t.t("course.openAssignment"),
        }}
      />
    </div>
  );
}

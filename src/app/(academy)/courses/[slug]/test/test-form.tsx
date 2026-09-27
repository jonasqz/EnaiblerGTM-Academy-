"use client";

import { Award, Hammer, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { submitTestAction, type TestState } from "@/app/(academy)/courses/[slug]/actions";
import { Notice } from "@/components/ui/notice";
import { useActionForm } from "@/components/ui/use-action-form";
import type { PublicQuestion } from "@/core/questions/questions";

type TestError = Extract<TestState, { status: "error" }>["error"];

/** Learner text, already in the page's language; {placeholders} are filled in here. */
export interface TestLabels {
  questionOf: string;
  questionN: string;
  chooseAll: string;
  answerMissing: string;
  /** For questions with several right answers. */
  answersMissing: string;
  submit: string;
  submitting: string;
  lastAttempt: string;
  passAt: string;
  errors: Record<TestError, string>;
  resultPassed: string;
  resultFailed: string;
  score: string;
  wrongTitle: string;
  wrongHint: string;
  tryAgainHint: string;
  retake: string;
  credentialReady: string;
  credentialPrivate: string;
  viewCredential: string;
  oneStepLeft: string;
  workMissing: string;
  workInReview: string;
  openAssignment: string;
}

type Score = { correct: number; total: number; percent: number };

/** Where the learner stood with the test when the page was rendered. */
export type TestStanding =
  | { kind: "open"; last: Score | null }
  | ({ kind: "passed"; credentialId: string | null } & Score)
  /** A credential earned before the course asked for a test. */
  | { kind: "completed"; credentialId: string };

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/**
 * The final test: every question on one page, handed in at once and graded on
 * the server. Submitting through useActionForm keeps the choices when the
 * answers come back with an error; a retake starts from an empty form.
 */
export function TestForm(props: {
  slug: string;
  version: number;
  questions: PublicQuestion[];
  standing: TestStanding;
  /** Whether a pass still waits for the work, and whether that work is being reviewed. */
  work: { missing: boolean; inReview: boolean };
  labels: TestLabels;
}) {
  const { labels, questions } = props;
  const { state, pending, onSubmit } = useActionForm<TestState>(submitTestAction, {
    status: "idle",
  });
  // The attempt whose result the learner closed to retake the test.
  const [closed, setClosed] = useState<number | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const result = state.status === "graded" && state.attemptNo !== closed ? state : null;
  const error = state.status === "error" ? state : null;

  useEffect(() => {
    if (state.status === "graded") resultRef.current?.focus();
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (closed !== null)
      formRef.current?.querySelector<HTMLInputElement>("fieldset input")?.focus();
  }, [closed]);

  const focusQuestion = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById(`q-${id}`)?.querySelector<HTMLInputElement>("input")?.focus();
  };

  const summary = result
    ? `${result.passed ? labels.resultPassed : labels.resultFailed}. ${fill(labels.score, { correct: result.correct, total: result.total })}, ${result.percent} %.`
    : "";

  let view: ReactNode;
  if (result) {
    const wrong = questions.flatMap((question, index) =>
      result.wrong?.includes(question.id) ? [{ question, n: index + 1 }] : [],
    );
    view = (
      <section
        ref={resultRef}
        tabIndex={-1}
        aria-labelledby="test-result-heading"
        className="card space-y-5 p-6 outline-none"
      >
        <ScoreHeader
          id="test-result-heading"
          title={result.passed ? labels.resultPassed : labels.resultFailed}
          score={result}
          labels={labels}
        />
        {result.passed ? (
          <PassedNext
            slug={props.slug}
            credentialId={result.credential?.publicId ?? null}
            levelLine={result.credential?.levelLine ?? null}
            work={{ ...props.work, missing: result.missing.includes("work") }}
            labels={labels}
          />
        ) : (
          <>
            {wrong.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-semibold">{labels.wrongTitle}</h3>
                <ul className="space-y-1.5 text-sm">
                  {wrong.map(({ question, n }) => (
                    <li key={question.id}>
                      <span className="font-semibold">{fill(labels.questionN, { n })}:</span>{" "}
                      {question.prompt}
                    </li>
                  ))}
                </ul>
                <p className="hint">{labels.wrongHint}</p>
              </div>
            ) : (
              <p className="text-sm text-muted">{labels.tryAgainHint}</p>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setClosed(result.attemptNo)}
            >
              <RotateCcw aria-hidden size={16} /> {labels.retake}
            </button>
          </>
        )}
      </section>
    );
  } else if (props.standing.kind === "passed") {
    view = (
      <section aria-labelledby="test-result-heading" className="card space-y-5 p-6">
        <ScoreHeader
          id="test-result-heading"
          title={labels.resultPassed}
          score={props.standing}
          labels={labels}
        />
        <PassedNext
          slug={props.slug}
          credentialId={props.standing.credentialId}
          levelLine={null}
          work={props.work}
          labels={labels}
        />
      </section>
    );
  } else if (props.standing.kind === "completed") {
    view = (
      <Notice tone="good" title={labels.errors.completed}>
        <CredentialLink publicId={props.standing.credentialId} label={labels.viewCredential} />
      </Notice>
    );
  } else {
    const unanswered = error?.error === "unanswered" ? error.unanswered : [];
    const last = props.standing.last;
    view = (
      <div className="space-y-5">
        {last && (
          <p className="text-sm text-muted">
            {fill(labels.lastAttempt, last)} {labels.passAt}
          </p>
        )}
        {/* A fresh form for every retake; within an attempt the choices stay put. */}
        <form
          key={closed ?? "first"}
          ref={formRef}
          onSubmit={onSubmit}
          noValidate
          className="space-y-5"
        >
          <input type="hidden" name="slug" value={props.slug} />
          <input type="hidden" name="version" value={props.version} />
          {error && (
            <div ref={errorRef} tabIndex={-1} className="outline-none">
              <Notice tone="critical" title={labels.errors[error.error]}>
                {unanswered.length > 0 && (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1">
                    {questions.map((question, index) =>
                      unanswered.includes(question.id) ? (
                        <li key={question.id}>
                          <a
                            href={`#q-${question.id}`}
                            onClick={focusQuestion(question.id)}
                            className="font-semibold underline"
                          >
                            {fill(labels.questionN, { n: index + 1 })}
                          </a>
                        </li>
                      ) : null,
                    )}
                  </ul>
                )}
              </Notice>
            </div>
          )}
          {questions.map((question, index) => {
            const missing = unanswered.includes(question.id);
            const described = [
              question.several ? `q-${question.id}-hint` : null,
              missing ? `q-${question.id}-error` : null,
            ].filter(Boolean);
            return (
              <div key={question.id} id={`q-${question.id}`} className="card-flat scroll-mt-8 p-5">
                <fieldset
                  className="min-w-0"
                  aria-describedby={described.length > 0 ? described.join(" ") : undefined}
                >
                  <legend className="w-full">
                    <span className="eyebrow block">
                      {fill(labels.questionOf, { n: index + 1, total: questions.length })}
                    </span>
                    <span className="mt-1 block font-semibold">{question.prompt}</span>
                  </legend>
                  {question.several && (
                    <p id={`q-${question.id}-hint`} className="hint mt-1">
                      {labels.chooseAll}
                    </p>
                  )}
                  {missing && (
                    <p
                      id={`q-${question.id}-error`}
                      className="mt-2 text-sm font-semibold"
                      style={{ color: "var(--status-critical)" }}
                    >
                      {question.several ? labels.answersMissing : labels.answerMissing}
                    </p>
                  )}
                  <div className="mt-3 grid gap-2">
                    {question.options.map((option) => (
                      <label
                        key={option.id}
                        className="flex cursor-pointer items-start gap-3 rounded-control border border-line p-3 has-checked:border-primary has-checked:bg-primary-soft"
                      >
                        <input
                          type={question.several ? "checkbox" : "radio"}
                          name={`answer.${question.id}`}
                          value={option.id}
                          className="mt-0.5 size-4 shrink-0 accent-(--tenant-primary)"
                        />
                        <span>{option.text}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            );
          })}
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? labels.submitting : labels.submit}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {summary}
      </p>
      {view}
    </div>
  );
}

function ScoreHeader(props: { id: string; title: string; score: Score; labels: TestLabels }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 id={props.id} className="font-display text-2xl">
          {props.title}
        </h2>
        <p className="text-sm text-muted">
          {fill(props.labels.score, props.score)} · {props.labels.passAt}
        </p>
      </div>
      <p className="font-display text-4xl tabular-nums">{props.score.percent} %</p>
    </div>
  );
}

/** After a pass: the credential and its share moment, or the part it still waits for. */
function PassedNext(props: {
  slug: string;
  credentialId: string | null;
  levelLine: string | null;
  work: { missing: boolean; inReview: boolean };
  labels: TestLabels;
}) {
  const { labels } = props;
  if (props.credentialId) {
    return (
      <Notice tone="good" title={labels.credentialReady}>
        <div className="space-y-2">
          {props.levelLine && <p className="font-semibold">{props.levelLine}</p>}
          <p>{labels.credentialPrivate}</p>
          <CredentialLink publicId={props.credentialId} label={labels.viewCredential} />
        </div>
      </Notice>
    );
  }
  if (!props.work.missing) return null;
  return (
    <Notice tone="info" title={labels.oneStepLeft}>
      <div className="space-y-2">
        <p>{props.work.inReview ? labels.workInReview : labels.workMissing}</p>
        <Link
          href={`/courses/${props.slug}/assignment`}
          className="inline-flex items-center gap-1.5 font-semibold underline"
        >
          <Hammer aria-hidden size={16} /> {labels.openAssignment}
        </Link>
      </div>
    </Notice>
  );
}

function CredentialLink(props: { publicId: string; label: string }) {
  return (
    <Link
      href={`/verify/${props.publicId}`}
      className="inline-flex items-center gap-1.5 font-semibold underline"
    >
      <Award aria-hidden size={16} /> {props.label}
    </Link>
  );
}

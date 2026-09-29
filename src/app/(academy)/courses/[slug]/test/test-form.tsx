"use client";

import { Award, CalendarDays, Hammer, RotateCcw } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { submitTestAction, type TestState } from "@/app/(academy)/courses/[slug]/actions";
import { CredentialReady } from "@/components/credential-ready";
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
  shareCredential: string;
  oneStepLeft: string;
  workMissing: string;
  workInReview: string;
  openAssignment: string;
  sessionsMissing: string;
  sessionsTitle: string;
  /** "Attempt {n} of {max}", where the authors limit attempts. */
  attemptOf: string;
  attemptsLeft: string;
  noAttemptsLeft: string;
  noAttemptsLeftHint: string;
}

type Score = { correct: number; total: number; percent: number };

/** Where the learner stood with the test when the page was rendered. */
export type TestStanding =
  | { kind: "open"; last: Score | null }
  | ({ kind: "passed"; credentialId: string | null; credentialPublic: boolean } & Score)
  /** A credential earned before the course asked for a test. */
  | { kind: "completed"; credentialId: string }
  /** Every attempt the authors allow is used, none passed. */
  | { kind: "closed"; last: Score | null };

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/**
 * The final test: every served question on one page, handed in at once and
 * graded on the server. Submitting through useActionForm keeps the choices
 * when the answers come back with an error; a retake starts from an empty
 * form, and the page it reloads serves the next attempt's questions.
 */
export function TestForm(props: {
  slug: string;
  version: number;
  /** The attempt the questions were served for (core/questions/quiz). */
  attemptNo: number;
  maxAttempts: number | null;
  questions: PublicQuestion[];
  standing: TestStanding;
  /** Whether a pass still waits for the work, and whether that work is being reviewed. */
  work: { missing: boolean; inReview: boolean };
  /** Whether a pass still waits for the live sessions of a series. */
  sessionsMissing: boolean;
  labels: TestLabels;
}) {
  const { labels, questions } = props;
  const { state, pending, onSubmit } = useActionForm<TestState>(submitTestAction, {
    status: "idle",
  });
  // The questions as handed in: once graded, the page reloads with the next attempt's draw.
  const [answered, setAnswered] = useState<PublicQuestion[]>(questions);
  const handIn = (event: FormEvent<HTMLFormElement>) => {
    setAnswered(questions);
    onSubmit(event);
  };
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
    const wrong = answered.flatMap((question, index) =>
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
            // Issued with this pass: private until the learner shares it.
            credentialPublic={false}
            levelLine={result.credential?.levelLine ?? null}
            work={{ ...props.work, missing: result.missing.includes("work") }}
            sessionsMissing={result.missing.includes("sessions")}
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
            {result.attemptsLeft === 0 ? (
              <Notice tone="warning" title={labels.noAttemptsLeft}>
                {labels.noAttemptsLeftHint}
              </Notice>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setClosed(result.attemptNo)}
                >
                  <RotateCcw aria-hidden size={16} /> {labels.retake}
                </button>
                {result.attemptsLeft !== null && (
                  <p className="text-sm text-muted">
                    {fill(labels.attemptsLeft, { n: result.attemptsLeft })}
                  </p>
                )}
              </div>
            )}
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
          credentialPublic={props.standing.credentialPublic}
          levelLine={null}
          work={props.work}
          sessionsMissing={props.sessionsMissing}
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
  } else if (props.standing.kind === "closed") {
    const last = props.standing.last;
    view = (
      <Notice tone="warning" title={labels.noAttemptsLeft}>
        <div className="space-y-2">
          {last && (
            <p>
              {fill(labels.lastAttempt, last)} {labels.passAt}
            </p>
          )}
          <p>{labels.noAttemptsLeftHint}</p>
        </div>
      </Notice>
    );
  } else {
    const unanswered = error?.error === "unanswered" ? error.unanswered : [];
    const last = props.standing.last;
    view = (
      <div className="space-y-5">
        {(last || props.maxAttempts !== null) && (
          <p className="text-sm text-muted">
            {props.maxAttempts !== null &&
              `${fill(labels.attemptOf, { n: props.attemptNo, max: props.maxAttempts })}. `}
            {last && `${fill(labels.lastAttempt, last)} ${labels.passAt}`}
          </p>
        )}
        {/* A fresh form for every retake; within an attempt the choices stay put. */}
        <form
          key={closed ?? "first"}
          ref={formRef}
          onSubmit={handIn}
          noValidate
          className="space-y-5"
        >
          <input type="hidden" name="slug" value={props.slug} />
          <input type="hidden" name="version" value={props.version} />
          <input type="hidden" name="attempt" value={props.attemptNo} />
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
  credentialPublic: boolean;
  levelLine: string | null;
  work: { missing: boolean; inReview: boolean };
  sessionsMissing: boolean;
  labels: TestLabels;
}) {
  const { labels } = props;
  if (props.credentialId) {
    return (
      <CredentialReady
        publicId={props.credentialId}
        isPublic={props.credentialPublic}
        levelLine={props.levelLine}
        labels={{
          title: labels.credentialReady,
          private: labels.credentialPrivate,
          share: labels.shareCredential,
          view: labels.viewCredential,
        }}
      />
    );
  }
  if (!props.work.missing) {
    // A series: the credential waits for its live sessions.
    if (!props.sessionsMissing) return null;
    return (
      <Notice tone="info" title={labels.oneStepLeft}>
        <div className="space-y-2">
          <p>{labels.sessionsMissing}</p>
          <Link
            href={`/courses/${props.slug}`}
            className="inline-flex items-center gap-1.5 font-semibold underline"
          >
            <CalendarDays aria-hidden size={16} /> {labels.sessionsTitle}
          </Link>
        </div>
      </Notice>
    );
  }
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

"use client";

import { ArrowDown, ArrowUp, ListChecks, Plus, Trash, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { FormState } from "@/app/studio/actions";
import { saveTestAction } from "@/app/studio/courses/[courseId]/test/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import { lintLocalizedWording } from "@/core/compliance/wording-lint";
import type { Locale } from "@/core/i18n/locales";
import { languageName, wordingText } from "@/core/i18n/studio/helpers";
import {
  MIN_USEFUL_TEST_QUESTIONS,
  QUESTION_LIMITS,
  testQuestionTexts,
  type CourseTestDefinition,
  type TestQuestion,
} from "@/core/questions/questions";
import { cleanTestDraft, questionGaps } from "@/core/questions/test-editing";
import { sameJson } from "@/core/shared/json";

/*
 * Final test editor. Works on a draft and posts it as JSON; the server
 * cleans and validates it with courseTestSchema. Question and option ids are
 * made here and never change, so attempts keep pointing at the same answers.
 */

/** Short ids, unique within one test (the schema checks that too). */
function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID().slice(0, 8);
  // Development hosts on plain HTTP have no randomUUID; random bytes work everywhere.
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function newQuestion(): TestQuestion {
  return {
    id: newId(),
    prompt: {},
    options: [0, 1, 2].map(() => ({ id: newId(), text: {} })),
    correct: [],
  };
}

function moved<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

function hasText(question: TestQuestion): boolean {
  return testQuestionTexts(question).some((text) =>
    Object.values(text).some((value) => value?.trim()),
  );
}

export interface TestEditorProps {
  courseId: string;
  /** The course languages: every question needs each of them before publishing. */
  languages: Locale[];
  test: CourseTestDefinition;
}

export function TestEditor(props: TestEditorProps) {
  const { languages } = props;
  const t = useStudioText();
  const uid = useId();
  const [draft, setDraft] = useState<CourseTestDefinition>(props.test);
  const [saved, setSaved] = useState<unknown>(() => cleanTestDraft(props.test));
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useActionForm<FormState>(async (previous, formData) => {
    const result = await saveTestAction(previous, formData);
    if (result.ok) setSaved(cleanTestDraft(JSON.parse(String(formData.get("test")))));
    return result;
  }, {});
  // Compared as saved: whitespace and the order answers were ticked in are no change.
  const dirty = !sameJson(cleanTestDraft(draft), saved);
  const twoColumns = languages.length > 1 ? "lg:grid-cols-2" : "";

  // Cmd/Ctrl+S saves; leaving with unsaved changes asks first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    const onLeave = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [dirty]);

  const setQuestions = (update: (questions: TestQuestion[]) => TestQuestion[]) =>
    setDraft((current) => ({ ...current, questions: update(current.questions) }));
  const setQuestion = (index: number, change: (question: TestQuestion) => TestQuestion) =>
    setQuestions((questions) =>
      questions.map((question, i) => (i === index ? change(question) : question)),
    );

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="courseId" value={props.courseId} />
      <input type="hidden" name="test" value={JSON.stringify(draft)} />

      <section aria-labelledby={`${uid}-settings`} className="card-flat space-y-5 p-5 sm:p-6">
        <h2 id={`${uid}-settings`} className="text-lg font-semibold">
          {t.t("courses.test.settings")}
        </h2>
        <div className="grid gap-5 md:grid-cols-[12rem_1fr]">
          <div className="field">
            <label htmlFor={`${uid}-pass`} className="label">
              {t.t("courses.test.passPercent")}
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`${uid}-pass`}
                type="number"
                min={1}
                max={100}
                step={1}
                required
                className="input w-24"
                aria-describedby={`${uid}-pass-hint`}
                // Empty while retyping (NaN), instead of jumping to 0.
                value={Number.isNaN(draft.passPercent) ? "" : draft.passPercent}
                onChange={(event) =>
                  setDraft({ ...draft, passPercent: event.target.valueAsNumber })
                }
              />
              <span className="font-semibold">%</span>
            </div>
            <p id={`${uid}-pass-hint`} className="hint">
              {t.t("courses.test.passPercentHint")}
            </p>
          </div>
          <label className="flex gap-3 self-start rounded-control border border-line p-3">
            <input
              type="checkbox"
              checked={draft.showMistakes}
              onChange={(event) => setDraft({ ...draft, showMistakes: event.target.checked })}
              className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
            />
            <span>
              <span className="block text-sm font-semibold">
                {t.t("courses.test.showMistakes")}
              </span>
              <span className="text-xs text-muted">{t.t("courses.test.showMistakesHint")}</span>
            </span>
          </label>
        </div>
      </section>

      <section aria-labelledby={`${uid}-questions`} className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id={`${uid}-questions`} className="text-lg font-semibold">
              {t.t("courses.test.questions")}
            </h2>
            <p className="max-w-3xl text-sm text-muted">{t.t("courses.test.questionsIntro")}</p>
          </div>
          <p className="text-sm text-muted tabular-nums">
            {t.t("courses.test.count", {
              n: draft.questions.length,
              max: QUESTION_LIMITS.testQuestions,
            })}
          </p>
        </div>

        {draft.questions.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title={t.t("courses.test.empty.title")}
            body={t.t("courses.test.empty.body", { min: MIN_USEFUL_TEST_QUESTIONS })}
          />
        ) : (
          <ol className="space-y-4">
            {draft.questions.map((question, index) => {
              const n = index + 1;
              const gaps = questionGaps(question, languages);
              const wordingFindings = [
                ...new Set(
                  testQuestionTexts(question)
                    .flatMap((text) => lintLocalizedWording(text, "test_question"))
                    .map((finding) => wordingText(t, finding)),
                ),
              ];
              return (
                <li
                  key={question.id}
                  className="space-y-4 rounded-card border border-line bg-card p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{t.t("courses.test.question", { n })}</p>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title={t.t("courses.test.questionUp", { n })}
                        aria-label={t.t("courses.test.questionUp", { n })}
                        disabled={index === 0}
                        onClick={() => setQuestions((all) => moved(all, index, index - 1))}
                      >
                        <ArrowUp aria-hidden size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title={t.t("courses.test.questionDown", { n })}
                        aria-label={t.t("courses.test.questionDown", { n })}
                        disabled={index === draft.questions.length - 1}
                        onClick={() => setQuestions((all) => moved(all, index, index + 1))}
                      >
                        <ArrowDown aria-hidden size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title={t.t("courses.test.removeQuestion", { n })}
                        aria-label={t.t("courses.test.removeQuestion", { n })}
                        onClick={() => {
                          if (
                            !hasText(question) ||
                            window.confirm(t.t("courses.test.removeQuestionConfirm", { n }))
                          ) {
                            setQuestions((all) => all.filter((_, i) => i !== index));
                          }
                        }}
                      >
                        <Trash aria-hidden size={16} />
                      </button>
                    </div>
                  </div>

                  <div className={`grid gap-3 ${twoColumns}`}>
                    {languages.map((locale) => (
                      <label key={locale} className="field">
                        <span className="text-sm font-semibold">
                          {t.t("courses.test.questionText")}{" "}
                          <span className="text-muted">({languageName(t, locale)})</span>
                        </span>
                        <textarea
                          className="textarea min-h-0"
                          rows={2}
                          maxLength={QUESTION_LIMITS.prompt}
                          value={question.prompt[locale] ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setQuestion(index, (current) => ({
                              ...current,
                              prompt: { ...current.prompt, [locale]: value },
                            }));
                          }}
                        />
                      </label>
                    ))}
                  </div>

                  <fieldset className="space-y-2">
                    <legend className="text-sm font-semibold">{t.t("courses.test.options")}</legend>
                    <ol className="space-y-2">
                      {question.options.map((option, optionIndex) => {
                        const m = optionIndex + 1;
                        const right = question.correct.includes(option.id);
                        return (
                          <li
                            key={option.id}
                            className={`grid gap-2 rounded-control border p-2 sm:grid-cols-[6rem_1fr_auto] sm:items-center ${
                              right ? "border-primary bg-primary-soft" : "border-line"
                            }`}
                          >
                            <label className="inline-flex items-center gap-2 text-sm font-semibold">
                              <input
                                type="checkbox"
                                checked={right}
                                aria-label={t.t("courses.test.rightLabel", { n: m })}
                                onChange={(event) => {
                                  const checked = event.target.checked;
                                  setQuestion(index, (current) => ({
                                    ...current,
                                    correct: checked
                                      ? [...current.correct, option.id]
                                      : current.correct.filter((id) => id !== option.id),
                                  }));
                                }}
                                className="size-4 shrink-0 accent-(--tenant-primary)"
                              />
                              {t.t("courses.test.right")}
                            </label>
                            <div className={`grid gap-2 ${twoColumns}`}>
                              {languages.map((locale) => {
                                const label = t.t("courses.test.optionLabel", {
                                  n: m,
                                  language: languageName(t, locale),
                                });
                                return (
                                  <input
                                    key={locale}
                                    className="input py-1"
                                    aria-label={label}
                                    placeholder={label}
                                    maxLength={QUESTION_LIMITS.option}
                                    value={option.text[locale] ?? ""}
                                    onChange={(event) => {
                                      const value = event.target.value;
                                      setQuestion(index, (current) => ({
                                        ...current,
                                        options: current.options.map((item) =>
                                          item.id === option.id
                                            ? { ...item, text: { ...item.text, [locale]: value } }
                                            : item,
                                        ),
                                      }));
                                    }}
                                  />
                                );
                              })}
                            </div>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                title={t.t("courses.test.optionUp", { n: m })}
                                aria-label={t.t("courses.test.optionUp", { n: m })}
                                disabled={optionIndex === 0}
                                onClick={() =>
                                  setQuestion(index, (current) => ({
                                    ...current,
                                    options: moved(current.options, optionIndex, optionIndex - 1),
                                  }))
                                }
                              >
                                <ArrowUp aria-hidden size={16} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                title={t.t("courses.test.optionDown", { n: m })}
                                aria-label={t.t("courses.test.optionDown", { n: m })}
                                disabled={optionIndex === question.options.length - 1}
                                onClick={() =>
                                  setQuestion(index, (current) => ({
                                    ...current,
                                    options: moved(current.options, optionIndex, optionIndex + 1),
                                  }))
                                }
                              >
                                <ArrowDown aria-hidden size={16} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                title={t.t("courses.test.removeOption", { n: m })}
                                aria-label={t.t("courses.test.removeOption", { n: m })}
                                disabled={question.options.length <= QUESTION_LIMITS.minOptions}
                                onClick={() =>
                                  setQuestion(index, (current) => ({
                                    ...current,
                                    options: current.options.filter(
                                      (item) => item.id !== option.id,
                                    ),
                                    correct: current.correct.filter((id) => id !== option.id),
                                  }))
                                }
                              >
                                <Trash aria-hidden size={16} />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                    {question.options.length < QUESTION_LIMITS.maxOptions && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          setQuestion(index, (current) => ({
                            ...current,
                            options: [...current.options, { id: newId(), text: {} }],
                          }))
                        }
                      >
                        <Plus aria-hidden size={16} /> {t.t("courses.test.addOption")}
                      </button>
                    )}
                  </fieldset>

                  {question.correct.length > 1 && (
                    <p className="text-sm text-muted">{t.t("courses.test.several")}</p>
                  )}

                  {(gaps.prompt.length > 0 ||
                    gaps.options.length > 0 ||
                    gaps.noRightAnswer ||
                    wordingFindings.length > 0) && (
                    <ul className="space-y-1 text-sm" aria-live="polite">
                      {[
                        ...gaps.prompt.map((locale) =>
                          t.t("courses.test.gap.prompt", { language: languageName(t, locale) }),
                        ),
                        ...gaps.options.map((locale) =>
                          t.t("courses.test.gap.options", { language: languageName(t, locale) }),
                        ),
                        ...(gaps.noRightAnswer ? [t.t("courses.test.gap.right")] : []),
                        ...wordingFindings,
                      ].map((message) => (
                        <li key={message} className="flex items-start gap-2">
                          <TriangleAlert
                            aria-hidden
                            size={16}
                            className="mt-0.5 shrink-0"
                            style={{ color: "var(--status-warning)" }}
                          />
                          {message}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {draft.questions.length < QUESTION_LIMITS.testQuestions && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setQuestions((all) => [...all, newQuestion()])}
          >
            <Plus aria-hidden size={18} /> {t.t("courses.test.addQuestion")}
          </button>
        )}
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t border-line bg-surface/95 px-4 py-4 backdrop-blur-sm sm:mx-0 sm:rounded-card sm:border">
        {/* Wording findings show at each question as it is written. */}
        <FormFeedback state={{ ...state, warnings: undefined }} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted" aria-live="polite">
            {dirty ? t.t("courses.test.unsaved") : t.t("courses.test.allSaved")} ·{" "}
            {t.t("courses.test.nextAttempts")}
          </p>
          <SubmitButton pending={pending} pendingLabel={t.t("common.saving")} disabled={!dirty}>
            {t.t("courses.test.save")}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

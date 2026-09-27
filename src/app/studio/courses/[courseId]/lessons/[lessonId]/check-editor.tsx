"use client";

import { ArrowDown, ArrowUp, ListChecks, Plus, Trash, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { lintWording } from "@/core/compliance/wording-lint";
import { wordingText } from "@/core/i18n/studio/helpers";
import { checkIds, moveItem, newCheckQuestion, unusedId } from "@/core/questions/knowledge-check";
import { QUESTION_LIMITS, questionTexts, type CheckQuestion } from "@/core/questions/questions";

/**
 * Short ids for questions and answers. randomUUID only exists in a secure
 * context (HTTPS, localhost); getRandomValues works everywhere.
 */
function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID().slice(0, 8);
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

const written = (question: CheckQuestion) => questionTexts(question).some((text) => text.trim());

/**
 * The lesson's knowledge check: practice questions learners answer at the end
 * of the lesson. It is part of the lesson editor's form, so it is saved with
 * the lesson and every version keeps it.
 */
export function CheckEditor(props: {
  questions: CheckQuestion[];
  onChange: (questions: CheckQuestion[]) => void;
}) {
  const { questions, onChange } = props;
  const t = useStudioText();
  const uid = useId();
  // Where focus goes once a change is on screen: into a new field, or away from a removed one.
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (!focusNext.current) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });

  const fieldId = (question: CheckQuestion, part: string) => `${uid}-${question.id}-${part}`;
  const addId = `${uid}-add`;

  const update = (index: number, change: Partial<CheckQuestion>) =>
    onChange(questions.map((question, i) => (i === index ? { ...question, ...change } : question)));

  const addQuestion = () => {
    const question = newCheckQuestion(questions, randomId);
    focusNext.current = fieldId(question, "prompt");
    onChange([...questions, question]);
  };

  const removeQuestion = (index: number) => {
    const question = questions[index]!;
    if (
      written(question) &&
      !window.confirm(t.t("lessons.check.removeConfirm", { n: index + 1 }))
    ) {
      return;
    }
    const rest = questions.filter((_, i) => i !== index);
    const neighbour = rest[index] ?? rest[index - 1];
    focusNext.current = neighbour ? fieldId(neighbour, "prompt") : addId;
    onChange(rest);
  };

  const move = (index: number, offset: -1 | 1) => {
    const lands = index + offset;
    // Stay on the pressed button, unless the question lands first or last, where it is disabled.
    const button =
      offset < 0 ? (lands === 0 ? "down" : "up") : lands === questions.length - 1 ? "up" : "down";
    focusNext.current = fieldId(questions[index]!, button);
    onChange(moveItem(questions, index, offset));
  };

  const addOption = (index: number) => {
    const question = questions[index]!;
    const option = { id: unusedId(randomId, checkIds(questions)), text: "" };
    focusNext.current = fieldId(question, `option-${option.id}`);
    update(index, { options: [...question.options, option] });
  };

  const removeOption = (index: number, optionIndex: number) => {
    const question = questions[index]!;
    const removed = question.options[optionIndex]!;
    const options = question.options.filter((_, i) => i !== optionIndex);
    const neighbour = options[optionIndex] ?? options[optionIndex - 1];
    if (neighbour) focusNext.current = fieldId(question, `option-${neighbour.id}`);
    update(index, { options, correct: question.correct.filter((id) => id !== removed.id) });
  };

  const setRight = (index: number, optionId: string, right: boolean) => {
    const correct = questions[index]!.correct.filter((id) => id !== optionId);
    update(index, { correct: right ? [...correct, optionId] : correct });
  };

  const findings = lintWording(
    questions.map((question) => questionTexts(question).join("\n")).join("\n"),
    "lesson_text",
  );

  return (
    <section aria-labelledby={`${uid}-heading`} className="card-flat space-y-4 p-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id={`${uid}-heading`} className="font-semibold">
            {t.t("lessons.check.title")}{" "}
            <span className="font-normal text-muted">({t.t("common.optional")})</span>
          </h2>
          {questions.length > 0 && (
            <p className="text-sm text-muted tabular-nums">
              {t.n("lessons.check.count", questions.length)}
            </p>
          )}
        </div>
        {questions.length > 0 && <p className="text-sm text-muted">{t.t("lessons.check.intro")}</p>}
      </div>

      {questions.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-control border border-dashed border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm text-muted">
            <ListChecks aria-hidden size={18} className="mt-0.5 shrink-0" />
            {t.t("lessons.check.empty")}
          </p>
          <button
            id={addId}
            type="button"
            className="btn btn-secondary btn-sm shrink-0"
            onClick={addQuestion}
          >
            <Plus aria-hidden size={16} /> {t.t("lessons.check.addFirst")}
          </button>
        </div>
      ) : (
        <>
          <ol className="space-y-4">
            {questions.map((question, index) => {
              const n = index + 1;
              const answersHint = fieldId(question, "answers-hint");
              const explanationHint = fieldId(question, "explanation-hint");
              return (
                <li key={question.id} className="rounded-card border border-line p-4">
                  <fieldset className="min-w-0">
                    {/* Floated, so the legend and the buttons share a line inside the card. */}
                    <legend className="float-left py-1.5 font-semibold">
                      {t.t("lessons.check.question", { n })}
                    </legend>
                    <div className="float-right flex gap-1">
                      <button
                        id={fieldId(question, "up")}
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title={t.t("lessons.check.moveUp", { n })}
                        aria-label={t.t("lessons.check.moveUp", { n })}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp aria-hidden size={16} />
                      </button>
                      <button
                        id={fieldId(question, "down")}
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title={t.t("lessons.check.moveDown", { n })}
                        aria-label={t.t("lessons.check.moveDown", { n })}
                        disabled={index === questions.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown aria-hidden size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title={t.t("lessons.check.remove", { n })}
                        aria-label={t.t("lessons.check.remove", { n })}
                        onClick={() => removeQuestion(index)}
                      >
                        <Trash aria-hidden size={16} />
                      </button>
                    </div>

                    <div className="clear-both space-y-4 pt-3">
                      <div className="field">
                        <label
                          htmlFor={fieldId(question, "prompt")}
                          className="text-sm font-semibold"
                        >
                          {t.t("lessons.check.prompt")}
                        </label>
                        <textarea
                          id={fieldId(question, "prompt")}
                          className="textarea min-h-0"
                          rows={2}
                          required
                          maxLength={QUESTION_LIMITS.prompt}
                          value={question.prompt}
                          onChange={(event) => update(index, { prompt: event.target.value })}
                        />
                      </div>

                      <fieldset className="min-w-0 space-y-2" aria-describedby={answersHint}>
                        <legend className="text-sm font-semibold">
                          {t.t("lessons.check.answers")}
                        </legend>
                        <p id={answersHint} className="hint">
                          {t.t("lessons.check.answersHint")}
                        </p>
                        <ul className="space-y-2">
                          {question.options.map((option, optionIndex) => {
                            const right = question.correct.includes(option.id);
                            const label = t.t("lessons.check.answer", { n: optionIndex + 1 });
                            const inputId = fieldId(question, `option-${option.id}`);
                            return (
                              <li key={option.id} className="flex flex-wrap items-center gap-2">
                                <label htmlFor={inputId} className="sr-only">
                                  {label}
                                </label>
                                <input
                                  id={inputId}
                                  className="input min-w-0 flex-1 basis-56"
                                  required
                                  maxLength={QUESTION_LIMITS.option}
                                  placeholder={label}
                                  value={option.text}
                                  onChange={(event) =>
                                    update(index, {
                                      options: question.options.map((item, i) =>
                                        i === optionIndex
                                          ? { ...item, text: event.target.value }
                                          : item,
                                      ),
                                    })
                                  }
                                />
                                <label
                                  className={`inline-flex min-h-11 items-center gap-2 rounded-control border px-3 text-sm font-semibold ${
                                    right ? "border-primary bg-primary-soft" : "border-line"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="size-4 shrink-0 accent-(--tenant-primary)"
                                    checked={right}
                                    onChange={(event) =>
                                      setRight(index, option.id, event.target.checked)
                                    }
                                  />
                                  <span className="sr-only">{label}: </span>
                                  {t.t("lessons.check.right")}
                                </label>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  title={t.t("lessons.check.removeAnswer", { n: optionIndex + 1 })}
                                  aria-label={t.t("lessons.check.removeAnswer", {
                                    n: optionIndex + 1,
                                  })}
                                  disabled={question.options.length <= QUESTION_LIMITS.minOptions}
                                  onClick={() => removeOption(index, optionIndex)}
                                >
                                  <X aria-hidden size={16} />
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                        {question.correct.length === 0 && written(question) && (
                          <p className="hint flex items-center gap-1.5 font-semibold">
                            <TriangleAlert
                              aria-hidden
                              size={14}
                              className="shrink-0"
                              style={{ color: "var(--status-warning)" }}
                            />
                            {t.t("lessons.check.noRight")}
                          </p>
                        )}
                        {question.options.length < QUESTION_LIMITS.maxOptions && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => addOption(index)}
                          >
                            <Plus aria-hidden size={16} /> {t.t("lessons.check.addAnswer")}
                          </button>
                        )}
                      </fieldset>

                      <div className="field">
                        <label
                          htmlFor={fieldId(question, "explanation")}
                          className="text-sm font-semibold"
                        >
                          {t.t("lessons.check.explanation")}{" "}
                          <span className="font-normal text-muted">({t.t("common.optional")})</span>
                        </label>
                        <textarea
                          id={fieldId(question, "explanation")}
                          className="textarea min-h-0"
                          rows={2}
                          maxLength={QUESTION_LIMITS.explanation}
                          aria-describedby={explanationHint}
                          value={question.explanation ?? ""}
                          onChange={(event) => update(index, { explanation: event.target.value })}
                        />
                        <p id={explanationHint} className="hint">
                          {t.t("lessons.check.explanationHint")}
                        </p>
                      </div>
                    </div>
                  </fieldset>
                </li>
              );
            })}
          </ol>
          {questions.length < QUESTION_LIMITS.checkQuestions ? (
            <button
              id={addId}
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={addQuestion}
            >
              <Plus aria-hidden size={16} /> {t.t("lessons.check.add")}
            </button>
          ) : (
            <p className="hint">
              {t.t("lessons.check.limit", { max: QUESTION_LIMITS.checkQuestions })}
            </p>
          )}
        </>
      )}

      {findings.length > 0 && (
        <FormFeedback
          state={{ warnings: [...new Set(findings.map((finding) => wordingText(t, finding)))] }}
        />
      )}
    </section>
  );
}

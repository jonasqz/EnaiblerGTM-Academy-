"use client";

import { CircleCheck, CircleDashed, CircleX, RotateCcw, type LucideIcon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { checkOutcome, toggleChoice, type CheckOutcome } from "@/core/questions/knowledge-check";
import { hasSeveralAnswers, type CheckQuestion } from "@/core/questions/questions";

/** Learner-facing words in the page's language (see ./knowledge-check-labels). */
export interface KnowledgeCheckLabels {
  title: string;
  intro: string;
  several: string;
  submit: string;
  retry: string;
  right: string;
  wrong: string;
  unanswered: string;
  /** With {right} and {total}, filled in here. */
  score: string;
  allRight: string;
}

const OUTCOMES: Record<
  CheckOutcome,
  { tone: BadgeTone; icon: LucideIcon; label: "right" | "wrong" | "unanswered" }
> = {
  right: { tone: "good", icon: CircleCheck, label: "right" },
  wrong: { tone: "critical", icon: CircleX, label: "wrong" },
  unanswered: { tone: "neutral", icon: CircleDashed, label: "unanswered" },
};

/**
 * The knowledge check at the end of a lesson: practice, checked right here in
 * the browser. Nothing is stored or sent, and it never stands between a
 * learner and the next lesson. No <form>: the Studio's preview renders it
 * inside the lesson editor's form.
 */
export function KnowledgeCheck(props: {
  questions: readonly CheckQuestion[];
  labels: KnowledgeCheckLabels;
  /** 3 where the lesson title is an h2 (the Studio's previews). */
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const { questions, labels } = props;
  const uid = useId();
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [checked, setChecked] = useState(false);
  const firstOption = useRef<HTMLInputElement>(null);
  if (questions.length === 0) return null;

  const Heading = props.headingLevel === 3 ? "h3" : "h2";
  const outcomes = questions.map((question) => checkOutcome(question, answers[question.id]));
  const right = outcomes.filter((outcome) => outcome === "right").length;

  const choose = (question: CheckQuestion, optionId: string, on: boolean) => {
    setAnswers((current) => ({
      ...current,
      [question.id]: toggleChoice(
        current[question.id] ?? [],
        optionId,
        hasSeveralAnswers(question),
        on,
      ),
    }));
    // Results only ever describe the answers on screen: a change hides them until the next check.
    setChecked(false);
  };

  const retry = () => {
    setAnswers({});
    setChecked(false);
    firstOption.current?.focus();
  };

  return (
    <section aria-labelledby={`${uid}-title`} className={`space-y-5 ${props.className ?? ""}`}>
      <div className="space-y-1">
        <Heading id={`${uid}-title`} className="font-display text-2xl leading-tight">
          {labels.title}
        </Heading>
        <p className="text-sm text-muted">{labels.intro}</p>
      </div>

      <ol className="space-y-4">
        {questions.map((question, index) => {
          const several = hasSeveralAnswers(question);
          const chosen = answers[question.id] ?? [];
          const outcome = checked ? OUTCOMES[outcomes[index]!] : null;
          const hintId = `${uid}-${question.id}-hint`;
          const resultId = `${uid}-${question.id}-result`;
          const describedBy = [several && hintId, outcome && resultId].filter(Boolean).join(" ");
          return (
            <li key={question.id} className="card-flat p-4 sm:p-5">
              <fieldset className="min-w-0" aria-describedby={describedBy || undefined}>
                <legend className="font-semibold leading-snug break-words">
                  {index + 1}. {question.prompt}
                </legend>
                {several && (
                  <p id={hintId} className="hint mt-1">
                    {labels.several}
                  </p>
                )}
                <div className="mt-3 grid gap-2">
                  {question.options.map((option, optionIndex) => {
                    const on = chosen.includes(option.id);
                    return (
                      <label
                        key={option.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-control border p-3 ${
                          on ? "border-primary bg-primary-soft" : "border-line hover:bg-subtle"
                        }`}
                      >
                        <input
                          ref={index === 0 && optionIndex === 0 ? firstOption : undefined}
                          type={several ? "checkbox" : "radio"}
                          // Radios need a shared name to act as one group (arrow keys).
                          name={several ? undefined : `${uid}-${question.id}`}
                          value={option.id}
                          checked={on}
                          onChange={(event) => choose(question, option.id, event.target.checked)}
                          className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
                        />
                        <span className="min-w-0 break-words">{option.text}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {outcome && (
                <div id={resultId} className="mt-3 space-y-2">
                  <Badge tone={outcome.tone} icon={outcome.icon}>
                    {labels[outcome.label]}
                  </Badge>
                  {question.explanation && (
                    <p className="text-sm break-words">{question.explanation}</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* One button that changes its words, so focus stays on it after checking. */}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={checked ? retry : () => setChecked(true)}
        >
          {checked && <RotateCcw aria-hidden size={16} />}
          {checked ? labels.retry : labels.submit}
        </button>
        <p role="status" className="font-semibold">
          {checked
            ? right === questions.length
              ? labels.allRight
              : labels.score
                  .replaceAll("{right}", String(right))
                  .replaceAll("{total}", String(questions.length))
            : null}
        </p>
      </div>
    </section>
  );
}

"use client";

import { Plus, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import type { FormState } from "@/app/studio/actions";
import {
  saveInterviewAction,
  suggestQuestionsAction,
} from "@/app/studio/courses/[courseId]/sources/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { LANGUAGE_NAMES } from "@/components/studio/language-names";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import type { Locale } from "@/core/i18n/locales";

export function InterviewForm(props: {
  courseId: string;
  languages: Locale[];
  initial: string[];
  aiAvailable: boolean;
}) {
  const [locale, setLocale] = useState<Locale>(props.languages[0] ?? "en");
  const [questions, setQuestions] = useState<string[]>(props.initial);
  const [answers, setAnswers] = useState<string[]>(props.initial.map(() => ""));
  const [note, setNote] = useState<string | null>(null);
  const [suggesting, startSuggest] = useTransition();
  const { state, pending, onSubmit } = useActionForm<FormState>(saveInterviewAction, {});

  const suggest = () => {
    const data = new FormData();
    data.set("courseId", props.courseId);
    data.set("locale", locale);
    startSuggest(async () => {
      const result = await suggestQuestionsAction(data);
      setQuestions(result.questions);
      setAnswers((current) => result.questions.map((_, index) => current[index] ?? ""));
      setNote(result.message ?? null);
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="courseId" value={props.courseId} />
      <input type="hidden" name="locale" value={locale} />
      <div className="flex flex-wrap items-end gap-4">
        {props.languages.length > 1 && (
          <div className="field">
            <label htmlFor="interview-locale" className="label">
              Language
            </label>
            <select
              id="interview-locale"
              className="select"
              value={locale}
              onChange={(event) => setLocale(event.target.value as Locale)}
            >
              {props.languages.map((language) => (
                <option key={language} value={language}>
                  {LANGUAGE_NAMES[language]}
                </option>
              ))}
            </select>
          </div>
        )}
        {props.aiAvailable && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={suggest}
            disabled={suggesting}
          >
            <Sparkles aria-hidden size={16} />
            {suggesting ? "Thinking…" : "Suggest questions for this course"}
          </button>
        )}
      </div>
      {note && <p className="hint">{note}</p>}

      <ol className="space-y-5">
        {questions.map((question, index) => (
          <li key={index} className="card-flat space-y-2 p-4">
            <input type="hidden" name="question" value={question} />
            <label htmlFor={`answer-${index}`} className="label">
              {index + 1}. {question}
            </label>
            <textarea
              id={`answer-${index}`}
              name="answer"
              className="textarea min-h-28"
              value={answers[index] ?? ""}
              onChange={(event) =>
                setAnswers((current) =>
                  current.map((value, i) => (i === index ? event.target.value : value)),
                )
              }
              placeholder="Answer as you would to a colleague: examples, mistakes you see, rules of thumb."
            />
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => {
          const question = window.prompt("Your own question");
          if (question?.trim()) {
            setQuestions((current) => [...current, question.trim()]);
            setAnswers((current) => [...current, ""]);
          }
        }}
      >
        <Plus aria-hidden size={16} /> Add a question
      </button>
      <FormFeedback state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save interview as a source
      </SubmitButton>
    </form>
  );
}

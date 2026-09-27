import { z } from "zod";

import { LANGUAGE_LABELS, WRITING_GUIDANCE } from "@/core/authoring/language";
import type { Locale } from "@/core/i18n/locales";

/**
 * Expertise interview (brief §7, step 2): the AI asks the author targeted
 * questions, and the answers become a source for the lessons.
 */
export const INTERVIEW_PROMPT_VERSION = "interview-2026-09-a";

/** Used without a model, and as the model's starting point. */
export function defaultQuestions(locale: Locale, artifact: string): string[] {
  return locale === "de"
    ? [
        "Was machen Einsteiger am häufigsten falsch?",
        "Was macht dein Ansatz anders als andere?",
        "Welches Beispiel aus deiner Arbeit zeigt am besten, wie es richtig geht?",
        "Welcher Schritt dauert für Lernende am längsten, und warum?",
        `Woran erkennt man, dass ein ${artifact} wirklich gut ist?`,
      ]
    : [
        "What do beginners get wrong most often?",
        "What does your approach do that others don't?",
        "Which example from your own work shows best how it is done right?",
        "Which step takes learners the longest, and why?",
        `How can someone tell that a ${artifact} is really good?`,
      ];
}

export const INTERVIEW_JSON_SCHEMA = {
  name: "interview_questions",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["questions"],
    properties: { questions: { type: "array", items: { type: "string" } } },
  },
} as const;

export function buildInterviewPrompt(input: {
  locale: Locale;
  artifactName: string;
  assignmentPrompt: string;
  criteria: ReadonlyArray<{ label: string; description: string }>;
}): { system: string; user: string } {
  const system = [
    "You interview an expert who is building an online course. Their answers become source material for the lessons.",
    "Ask 5 to 7 open questions that draw out what only an experienced practitioner knows: typical mistakes, trade-offs, concrete examples, rules of thumb, and how to recognise good work.",
    "Tie the questions to the artifact learners build and to the review criteria. One question per line of thought; no yes/no questions.",
    `Write in ${WRITING_GUIDANCE[input.locale]}, addressing the expert.`,
    "Respond with JSON only.",
  ].join("\n");
  const criteria = input.criteria
    .map((criterion) => `- ${criterion.label}: ${criterion.description}`)
    .join("\n");
  const user = [
    `# Artifact learners build\n${input.artifactName}`,
    `# Assignment\n${input.assignmentPrompt}`,
    `# Review criteria\n${criteria}`,
    `# Language\n${LANGUAGE_LABELS[input.locale]}`,
  ].join("\n\n");
  return { system, user };
}

const answer = z.strictObject({ questions: z.array(z.string()).min(3).max(10) });

export function parseInterviewQuestions(content: string): string[] | null {
  try {
    const parsed = answer.safeParse(JSON.parse(content));
    if (!parsed.success) return null;
    const questions = parsed.data.questions
      .map((question) => question.trim().slice(0, 300))
      .filter((question) => question.length > 8);
    return questions.length >= 3 ? questions.slice(0, 7) : null;
  } catch {
    return null;
  }
}

/** The interview as source text: question headings with the expert's answers. */
export function interviewText(
  entries: ReadonlyArray<{ question: string; answer: string }>,
): string {
  return entries
    .filter((entry) => entry.answer.trim())
    .map((entry) => `## ${entry.question.trim()}\n\n${entry.answer.trim()}`)
    .join("\n\n");
}

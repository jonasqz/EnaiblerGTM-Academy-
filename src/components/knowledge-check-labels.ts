import type { KnowledgeCheckLabels } from "@/components/knowledge-check";
import type { Translator } from "@/core/i18n/translator";

/** Learner-facing labels for <KnowledgeCheck> in the current language. */
export function knowledgeCheckLabels(t: Translator): KnowledgeCheckLabels {
  return {
    title: t.t("lesson.check.title"),
    intro: t.t("lesson.check.intro"),
    several: t.t("lesson.check.several"),
    submit: t.t("lesson.check.submit"),
    retry: t.t("lesson.check.retry"),
    right: t.t("lesson.check.right"),
    wrong: t.t("lesson.check.wrong"),
    unanswered: t.t("lesson.check.unanswered"),
    // {right} and {total} stay in: the component counts the answers.
    score: t.t("lesson.check.score"),
    allRight: t.t("lesson.check.allRight"),
  };
}

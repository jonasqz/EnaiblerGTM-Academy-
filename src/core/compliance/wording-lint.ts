import { localizedEntries, type Locale, type LocalizedText } from "@/core/i18n/locales";

/**
 * Wording guardrail (brief §9). Words that suggest a formal or state
 * recognised qualification are a legal risk in DACH. They are BLOCKED where
 * the text makes a promise about the credential (titles, names, templates)
 * and a WARNING in running lesson text, where they may be used descriptively
 * ("unlike certification programmes, …").
 *
 * Lists are maintained per locale but applied to every text, because titles
 * mix languages ("Certified Product Owner" in a German course).
 */

export type WordingSeverity = "error" | "warning";

export const WORDING_CONTEXTS = {
  credential_template: "error",
  course_title: "error",
  path_name: "error",
  level_name: "error",
  artifact_name: "error",
  terminology: "error",
  brand_name: "error",
  cta_label: "error",
  /** A learner's excerpt on their public credential page. */
  showcase: "error",
  lesson_text: "warning",
  /** The final test's questions: running text like lessons (knowledge checks are lesson text). */
  test_question: "warning",
  course_description: "warning",
  assignment_prompt: "warning",
} as const satisfies Record<string, WordingSeverity>;

export type WordingContext = keyof typeof WORDING_CONTEXTS;

interface WordingRule {
  id: string;
  locale: Locale;
  label: string;
  pattern: RegExp;
  hint: string;
}

export const WORDING_RULES: readonly WordingRule[] = [
  {
    id: "en.certified",
    locale: "en",
    label: "certified / certify",
    pattern: /\b(?:un)?certif(?:y|ies|ied|ying)\b/giu,
    hint: 'Say "Certificate of Completion" or describe what the learner built.',
  },
  {
    id: "en.certification",
    locale: "en",
    label: "certification",
    pattern: /\b(?:re)?certifications?\b/giu,
    hint: 'Say "Certificate of Completion" or describe what the learner built.',
  },
  {
    id: "en.accredited",
    locale: "en",
    label: "accredited / accreditation",
    pattern: /\baccredit(?:ed|ation|ations|ing|s)?\b/giu,
    hint: "Only use accreditation wording for an actual accreditation, confirmed by counsel.",
  },
  {
    // Substring match on purpose: catches compounds such as "IHK-zertifiziert",
    // "Zertifizierungskurs" and "Rezertifizierung".
    id: "de.zertifiziert",
    locale: "de",
    label: "zertifiziert / Zertifizierung",
    pattern: /zertifizier\p{L}*/giu,
    hint: 'Sprich von "Abschlussbescheinigung" oder beschreibe, was gebaut wurde.',
  },
  {
    id: "de.akkreditiert",
    locale: "de",
    label: "akkreditiert / Akkreditierung",
    pattern: /akkreditier\p{L}*/giu,
    hint: "Nur für eine tatsächliche, geprüfte Akkreditierung verwenden.",
  },
  {
    id: "de.staatlich-anerkannt",
    locale: "de",
    label: "staatlich anerkannt",
    pattern: /staatlich[\s-]+anerkannt\p{L}*/giu,
    hint: "Nur für eine tatsächliche staatliche Anerkennung verwenden.",
  },
];

export interface WordingFinding {
  ruleId: string;
  label: string;
  match: string;
  index: number;
  severity: WordingSeverity;
  context: WordingContext;
  hint: string;
  /** Locale of the text that contained the match, when linting localized text. */
  locale?: Locale;
}

export function lintWording(text: string, context: WordingContext): WordingFinding[] {
  const severity = WORDING_CONTEXTS[context];
  const findings: WordingFinding[] = [];
  for (const rule of WORDING_RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      findings.push({
        ruleId: rule.id,
        label: rule.label,
        match: match[0],
        index: match.index ?? 0,
        severity,
        context,
        hint: rule.hint,
      });
    }
  }
  return findings.sort((a, b) => a.index - b.index);
}

export function lintLocalizedWording(
  text: LocalizedText,
  context: WordingContext,
): WordingFinding[] {
  return localizedEntries(text).flatMap(([locale, value]) =>
    lintWording(value, context).map((finding) => ({ ...finding, locale })),
  );
}

export function hasBlockingWording(findings: readonly WordingFinding[]): boolean {
  return findings.some((finding) => finding.severity === "error");
}

export function describeFinding(finding: WordingFinding): string {
  const where = finding.context.replaceAll("_", " ");
  const verdict = finding.severity === "error" ? "is not allowed in" : "should be avoided in";
  return `"${finding.match}" ${verdict} ${where}. ${finding.hint}`;
}

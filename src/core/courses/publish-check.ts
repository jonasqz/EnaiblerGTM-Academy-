import type { SubmissionType } from "@/core/assignments/submission-types";
import {
  checkDeliveryMode,
  type DeliveryMode,
  type DeliveryModeIssueCode,
  type PlatformCapabilities,
  type ZfuApproval,
} from "@/core/compliance/delivery-mode";
import {
  describeFinding,
  lintLocalizedWording,
  lintWording,
  type WordingContext,
  type WordingFinding,
} from "@/core/compliance/wording-lint";
import { localize, type Locale, type LocalizedText } from "@/core/i18n/locales";
import { GOOD_AGREEMENT } from "@/core/review/calibration";
import type { Rubric } from "@/core/review/rubric";

/**
 * Pre-publish checks (brief §7 step 6, §9). Errors block publishing; warnings
 * are shown to the author. The coverage map answers "which lesson teaches
 * which rubric criterion" and flags gaps ("No lesson teaches criterion 3").
 */
export interface PublishCheckInput {
  course: {
    title: LocalizedText;
    summary?: LocalizedText | null;
    languages: readonly Locale[];
    deliveryMode: DeliveryMode;
    offersRecordings?: boolean;
    zfuApproval?: ZfuApproval | null;
    estMinutes?: number | null;
  };
  lessons: ReadonlyArray<{
    key: string;
    locale: Locale;
    title: string;
    markdown: string;
    criterionIds: readonly string[];
  }>;
  assignment: {
    prompt: LocalizedText;
    artifactName: LocalizedText;
    submissionTypes: readonly SubmissionType[];
  } | null;
  rubric: Rubric | null;
  platform?: PlatformCapabilities;
  /** The academy around the course; omitted, academy-level checks are skipped. */
  academy?: { legalLinks: { imprint?: string; privacy?: string } };
  /**
   * Review calibration (brief §7, step 5): only when the AI reviews this
   * course. `latest` is the newest finished run, `current` whether it ran on
   * today's rubric.
   */
  calibration?: { latest: { agreement: number | null; current: boolean } | null };
}

export type PublishIssueCode =
  | "no_languages"
  | "missing_title"
  | "wording"
  | "no_lessons"
  | "missing_translation"
  | "empty_lesson"
  | "no_assignment"
  | "missing_assignment_text"
  | "no_rubric"
  | "criterion_not_taught"
  | "delivery_mode"
  | "no_duration"
  | "legal_pages_missing"
  | "calibration_missing"
  | "calibration_low";

export interface PublishIssue {
  code: PublishIssueCode;
  severity: "error" | "warning";
  /** English, for logs and scripts; the Studio words it from the code and the fields below. */
  message: string;
  locale?: Locale;
  params?: Record<string, string | number>;
  /** For `wording`: the finding, which also says where the word is. */
  finding?: WordingFinding;
  /** For `delivery_mode`: which rule. */
  deliveryMode?: DeliveryModeIssueCode;
}

export interface CoverageRow {
  criterionId: string;
  label: string;
  lessonKeys: string[];
}

export interface PublishCheck {
  ok: boolean;
  errors: PublishIssue[];
  warnings: PublishIssue[];
  coverage: CoverageRow[];
}

export function checkCoursePublishable(input: PublishCheckInput): PublishCheck {
  const issues: PublishIssue[] = [];
  const add = (issue: PublishIssue) => issues.push(issue);
  const { course, lessons, assignment, rubric } = input;
  const primary = course.languages[0] ?? "en";

  const lint = (text: LocalizedText | string, context: WordingContext) => {
    const findings =
      typeof text === "string" ? lintWording(text, context) : lintLocalizedWording(text, context);
    for (const finding of findings) {
      add({
        code: "wording",
        severity: finding.severity,
        message: describeFinding(finding),
        finding,
        ...(finding.locale ? { locale: finding.locale } : {}),
      });
    }
  };

  if (course.languages.length === 0) {
    add({
      code: "no_languages",
      severity: "error",
      message: "Choose at least one course language.",
    });
  }

  for (const locale of course.languages) {
    if (!course.title[locale]) {
      add({
        code: "missing_title",
        severity: "error",
        locale,
        message: `Add the course title in ${locale.toUpperCase()}.`,
      });
    }
  }
  lint(course.title, "course_title");
  if (course.summary) lint(course.summary, "course_description");

  // Lessons: every language needs at least one; translations should line up.
  const keysByLocale = new Map<Locale, Set<string>>();
  for (const lesson of lessons) {
    if (!course.languages.includes(lesson.locale)) continue;
    const keys = keysByLocale.get(lesson.locale) ?? new Set<string>();
    keys.add(lesson.key);
    keysByLocale.set(lesson.locale, keys);
    if (!lesson.markdown.trim()) {
      add({
        code: "empty_lesson",
        severity: "warning",
        locale: lesson.locale,
        params: { title: lesson.title },
        message: `Lesson "${lesson.title}" (${lesson.locale.toUpperCase()}) has no content yet.`,
      });
    }
    lint(lesson.markdown, "lesson_text");
  }
  const allKeys = new Set(
    lessons.filter((l) => course.languages.includes(l.locale)).map((l) => l.key),
  );
  for (const locale of course.languages) {
    const keys = keysByLocale.get(locale);
    if (!keys || keys.size === 0) {
      add({
        code: "no_lessons",
        severity: "error",
        locale,
        message: `Add at least one lesson in ${locale.toUpperCase()}.`,
      });
      continue;
    }
    const missing = [...allKeys].filter((key) => !keys.has(key));
    if (missing.length > 0) {
      add({
        code: "missing_translation",
        severity: "warning",
        locale,
        params: { count: missing.length },
        message: `${missing.length} lesson(s) have no ${locale.toUpperCase()} version yet.`,
      });
    }
  }

  // The one required artifact.
  if (!assignment) {
    add({
      code: "no_assignment",
      severity: "error",
      message: "Define what learners build (the assignment).",
    });
  } else {
    for (const locale of course.languages) {
      if (!assignment.prompt[locale] || !assignment.artifactName[locale]) {
        add({
          code: "missing_assignment_text",
          severity: "error",
          locale,
          message: `Add the assignment prompt and artifact name in ${locale.toUpperCase()}.`,
        });
      }
    }
    lint(assignment.artifactName, "artifact_name");
    lint(assignment.prompt, "assignment_prompt");
  }

  // Rubric and coverage map.
  const coverage: CoverageRow[] = [];
  if (!rubric) {
    add({
      code: "no_rubric",
      severity: "error",
      message: "Add a rubric so submissions can be reviewed.",
    });
  } else {
    for (const criterion of rubric.criteria) {
      const teaching = [
        ...new Set(lessons.filter((l) => l.criterionIds.includes(criterion.id)).map((l) => l.key)),
      ];
      const label = localize(criterion.label, primary);
      coverage.push({ criterionId: criterion.id, label, lessonKeys: teaching });
      if (teaching.length === 0) {
        add({
          code: "criterion_not_taught",
          severity: "warning",
          params: { label },
          message: `No lesson teaches "${label}".`,
        });
      }
    }
  }

  if (input.calibration && rubric) {
    const { latest } = input.calibration;
    if (!latest || !latest.current) {
      add({
        code: "calibration_missing",
        severity: "warning",
        params: { rubricChanged: latest ? 1 : 0 },
        message: latest
          ? "The rubric changed since the last calibration: run it again on your examples."
          : "Calibrate the AI review: run it on a few examples you would and would not pass.",
      });
    } else if (latest.agreement !== null && latest.agreement < GOOD_AGREEMENT) {
      add({
        code: "calibration_low",
        severity: "warning",
        params: { percent: Math.round(latest.agreement * 100) },
        message: `The AI agreed with you on ${Math.round(latest.agreement * 100)} % of your examples. Sharpen the rubric's level descriptions, then calibrate again.`,
      });
    }
  }

  for (const issue of checkDeliveryMode(
    {
      deliveryMode: course.deliveryMode,
      offersRecordings: course.offersRecordings,
      zfuApproval: course.zfuApproval,
      texts: [...Object.values(course.title), ...Object.values(course.summary ?? {})].filter(
        (value): value is string => typeof value === "string",
      ),
    },
    input.platform,
  )) {
    add({
      code: "delivery_mode",
      severity: issue.severity,
      message: issue.message,
      deliveryMode: issue.code,
      ...(issue.text ? { params: { text: issue.text } } : {}),
    });
  }

  if (!course.estMinutes) {
    add({
      code: "no_duration",
      severity: "warning",
      message: "Add an estimated duration for the catalogue.",
    });
  }

  // A public academy needs an imprint and a privacy page (TMG/DDG, GDPR).
  if (input.academy && !hasLegalPages(input.academy.legalLinks)) {
    add({
      code: "legal_pages_missing",
      severity: "error",
      message: "Add your academy's imprint and privacy page in Settings.",
    });
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  return {
    ok: errors.length === 0,
    errors,
    warnings: issues.filter((issue) => issue.severity === "warning"),
    coverage,
  };
}

export function hasLegalPages(links: { imprint?: string; privacy?: string }): boolean {
  return Boolean(links.imprint && links.privacy);
}

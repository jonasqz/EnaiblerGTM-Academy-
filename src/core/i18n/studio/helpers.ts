import { isJobError } from "@/core/authoring/job-errors";
import type { WordingFinding } from "@/core/compliance/wording-lint";
import type { PublishIssue } from "@/core/courses/publish-check";
import type { CheckIssue, CheckIssueCode } from "@/core/questions/knowledge-check";
import type { ManifestWarning } from "@/core/tenant/manifest";
import { MIN_BUTTON_CONTRAST, MIN_TEXT_CONTRAST, type ContrastIssue } from "@/core/theme/contrast";
import type { Locale } from "@/core/i18n/locales";
import type { StudioKey } from "@/core/i18n/studio/index";
import type { StudioText } from "@/core/i18n/studio/translator";

/** Studio wording for things the core rules report by code (they keep English for logs). */

export function languageName(t: StudioText, locale: Locale | string): string {
  return locale === "de" || locale === "en" ? t.t(`common.language.${locale}`) : locale;
}

const HINTS: Record<string, StudioKey> = {
  "en.certified": "common.wording.hint.certified",
  "en.certification": "common.wording.hint.certified",
  "de.zertifiziert": "common.wording.hint.certified",
  "en.accredited": "common.wording.hint.accredited",
  "de.akkreditiert": "common.wording.hint.accredited",
  "de.staatlich-anerkannt": "common.wording.hint.state",
};

export function wordingText(t: StudioText, finding: WordingFinding): string {
  return t.t(finding.severity === "error" ? "common.wording.error" : "common.wording.warning", {
    match: finding.match,
    where: t.t(`common.wording.where.${finding.context}`),
    hint: t.t(HINTS[finding.ruleId] ?? "common.wording.hint.certified"),
  });
}

const CHECK_ISSUES: Record<CheckIssueCode, StudioKey> = {
  unreadable: "lessons.check.error.unreadable",
  too_many: "lessons.check.error.tooMany",
  prompt_missing: "lessons.check.error.promptMissing",
  prompt_long: "lessons.check.error.promptLong",
  options_few: "lessons.check.error.optionsFew",
  options_many: "lessons.check.error.optionsMany",
  option_missing: "lessons.check.error.optionMissing",
  option_long: "lessons.check.error.optionLong",
  no_right_answer: "lessons.check.error.noRight",
  explanation_long: "lessons.check.error.explanationLong",
};

/** Why a lesson's knowledge check could not be saved. */
export function checkIssueText(t: StudioText, issue: CheckIssue): string {
  return t.t(CHECK_ISSUES[issue.code], {
    n: issue.question,
    answer: issue.option,
    min: issue.min,
    max: issue.max,
  });
}

export function publishIssueText(t: StudioText, issue: PublishIssue): string {
  const language = issue.locale ? languageName(t, issue.locale) : "";
  const params = issue.params ?? {};
  switch (issue.code) {
    case "wording":
      return issue.finding ? wordingText(t, issue.finding) : issue.message;
    case "delivery_mode":
      return issue.deliveryMode
        ? t.t(`common.publish.delivery.${issue.deliveryMode}`, { text: params.text })
        : issue.message;
    case "missing_translation":
      return t.n("common.publish.missing_translation", Number(params.count ?? 0), { language });
    case "missing_test_text":
      return t.n("common.publish.missing_test_text", Number(params.count ?? 0), { language });
    case "test_too_short":
      return t.n("common.publish.test_too_short", Number(params.count ?? 0), {
        min: params.min ?? 5,
      });
    case "calibration_missing":
      return t.t(
        params.rubricChanged
          ? "common.publish.calibration_stale"
          : "common.publish.calibration_missing",
      );
    default:
      return t.t(`common.publish.${issue.code}`, { language, ...params });
  }
}

export function cohortDates(t: StudioText, startsOn: string | null, endsOn: string | null): string {
  const format = (value: string) => t.date(`${value}T12:00:00Z`);
  if (startsOn && endsOn)
    return t.t("common.dates.range", { from: format(startsOn), to: format(endsOn) });
  if (startsOn) return t.t("common.dates.from", { date: format(startsOn) });
  if (endsOn) return t.t("common.dates.until", { date: format(endsOn) });
  return t.t("common.dates.none");
}

export function holdReasonText(t: StudioText, reason: string): string {
  const key = `common.hold.${reason}`;
  return key in HOLD_KEYS ? t.t(key as StudioKey) : reason;
}

const HOLD_KEYS = {
  "common.hold.human_only": 1,
  "common.hold.policy_requires_human": 1,
  "common.hold.near_threshold": 1,
  "common.hold.repeated_failure": 1,
  "common.hold.ai_unavailable": 1,
  "common.hold.ai_invalid_output": 1,
} satisfies Partial<Record<StudioKey, 1>>;

export function auditText(t: StudioText, reason: string): string {
  return reason === "initial_phase" || reason === "sampled"
    ? t.t(`common.audit.${reason}`)
    : reason;
}

/** "5 minutes ago", "vor 5 Minuten". */
export function timeAgo(t: StudioText, date: Date, now = new Date()): string {
  const relative = new Intl.RelativeTimeFormat(t.locale, { numeric: "auto" });
  const minutes = Math.round((date.getTime() - now.getTime()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

/** Labels for <FileUpload> in the Studio. */
export function studioUploadLabels(t: StudioText) {
  return {
    choose: t.t("common.upload.choose"),
    drop: t.t("common.upload.drop"),
    uploading: t.t("common.upload.uploading"),
    remove: t.t("common.upload.remove"),
    errors: {
      too_large: t.t("common.upload.tooLarge"),
      type_not_allowed: t.t("common.upload.type"),
      invalid_content: t.t("common.upload.invalid"),
      too_many: t.t("common.upload.tooMany"),
      rate_limited: t.t("common.upload.rateLimited"),
      failed: t.t("common.upload.failed"),
    },
  };
}

/** A background job's stored error: a code in the team member's language, older rows as stored. */
export function jobErrorText(t: StudioText, stored: string | null | undefined): string | null {
  if (!stored) return null;
  return isJobError(stored) ? t.t(`common.jobError.${stored}`) : stored;
}

/** Core words contrast problems in English (for manifests); the Studio words them from the code. */
export function contrastIssueText(t: StudioText, issue: ContrastIssue): string {
  const needs =
    issue.code === "text_on_primary" && issue.severity === "error"
      ? MIN_BUTTON_CONTRAST
      : MIN_TEXT_CONTRAST;
  return t.t(`brand.contrast.${issue.code}`, {
    ratio: t.number(issue.ratio, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    needs,
  });
}

/** What saving the academy's settings or brand found worth a second look. */
export function manifestWarningText(t: StudioText, warning: ManifestWarning): string {
  switch (warning.code) {
    case "contrast":
      return contrastIssueText(t, warning.issue);
    case "font_unavailable":
      return t.t("settings.warning.font_unavailable", { family: warning.family });
    case "course_not_publishable":
      return t.t("settings.warning.course_not_publishable", {
        course: warning.course,
        reason: t.t(`common.publish.delivery.${warning.issue.code}`, { text: warning.issue.text }),
      });
    default:
      return t.t(`settings.warning.${warning.code}`);
  }
}

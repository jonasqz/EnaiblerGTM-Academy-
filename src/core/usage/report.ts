import { emptyTotals, mergeTotals, USAGE_TIME_ZONE, type KindUsage } from "@/core/usage/ai-usage";
import { AUDIO_MINUTE_MICRO_USD, percentUsed } from "@/core/usage/allowance";

/*
 * The operator's monthly report across academies (scripts/usage-report.ts):
 * what AI review costs per hand-in (brief §8 aims for under €0.10), what the
 * teams' authoring costs, each academy's total, and how much of its monthly
 * allowance that was. Costs are the gateway's, in US dollars: enaibler's own
 * costs, which academies never see.
 */

/** The month against an academy's allowance (aiAllowanceStatus in server/ai-allowance). */
export interface MonthAllowance {
  /** The allowance in force; null means no limit. */
  allowanceMicroUsd: number | null;
  /** What the month counted against it: the costs, and fallback prices where none was reported. */
  spentMicroUsd: number;
}

export interface AcademyUsage {
  slug: string;
  name: string;
  /** The month's totals by kind (usageByKind in server/studio/usage). */
  kinds: readonly KindUsage[];
  allowance: MonthAllowance;
}

export interface UsageReportLine {
  slug: string;
  name: string;
  /** Hand-ins the AI reviewed. */
  reviews: number;
  reviewCostMicroUsd: number;
  /** Null without reviews. */
  costPerReviewMicroUsd: number | null;
  /** Everything but reviews: the team's authoring and the academy's setup (brand import). */
  authoringCalls: number;
  authoringCostMicroUsd: number;
  transcriptionSeconds: number;
  totalCostMicroUsd: number;
  /** Some calls had no reported price, so the costs are lower bounds. */
  costIncomplete: boolean;
  /** What counts against the allowance: the total cost, with fallback prices for calls without one. */
  countedMicroUsd: number;
  /** The academy's allowance; null means no limit (and on the total line, none). */
  allowanceMicroUsd: number | null;
  /** Whole percent of the allowance used, past 100 when the last calls went over; null without one. */
  allowancePercent: number | null;
}

export interface UsageReport {
  month: string;
  /** The most expensive academy first. */
  lines: UsageReportLine[];
  /** All academies together. */
  total: UsageReportLine;
}

export function usageReportLine(
  academy: { slug: string; name: string },
  kinds: readonly KindUsage[],
  allowance: MonthAllowance,
): UsageReportLine {
  const review = emptyTotals();
  const authoring = emptyTotals();
  let reviews = 0;
  let transcriptionSeconds = 0;
  for (const usage of kinds) {
    if (usage.kind === "review") {
      mergeTotals(review, usage);
      reviews += usage.items;
    } else {
      mergeTotals(authoring, usage);
    }
    if (usage.kind === "transcription") transcriptionSeconds += usage.audioSeconds;
  }
  return {
    slug: academy.slug,
    name: academy.name,
    reviews,
    reviewCostMicroUsd: review.costMicroUsd,
    costPerReviewMicroUsd: reviews > 0 ? Math.round(review.costMicroUsd / reviews) : null,
    authoringCalls: authoring.calls,
    authoringCostMicroUsd: authoring.costMicroUsd,
    transcriptionSeconds,
    totalCostMicroUsd: review.costMicroUsd + authoring.costMicroUsd,
    costIncomplete: review.costIncomplete || authoring.costIncomplete,
    countedMicroUsd: allowance.spentMicroUsd,
    allowanceMicroUsd: allowance.allowanceMicroUsd,
    allowancePercent:
      allowance.allowanceMicroUsd === null
        ? null
        : percentUsed(allowance.spentMicroUsd, allowance.allowanceMicroUsd),
  };
}

export function usageReport(month: string, academies: readonly AcademyUsage[]): UsageReport {
  return {
    month,
    lines: academies
      .map((academy) => usageReportLine(academy, academy.kinds, academy.allowance))
      .sort((a, b) => b.totalCostMicroUsd - a.totalCostMicroUsd || a.slug.localeCompare(b.slug)),
    total: usageReportLine(
      {
        slug: "total",
        name: `${academies.length} ${academies.length === 1 ? "academy" : "academies"}`,
      },
      academies.flatMap((academy) => academy.kinds),
      {
        allowanceMicroUsd: null,
        spentMicroUsd: academies.reduce((sum, academy) => sum + academy.allowance.spentMicroUsd, 0),
      },
    ),
  };
}

const usd = (microUsd: number) => (microUsd / 1_000_000).toFixed(4);
const dollars = (microUsd: number) => (microUsd / 1_000_000).toFixed(2);
const minutes = (seconds: number) => (Math.round(seconds / 6) / 10).toFixed(1);
/** Names are the academies' own: nothing in them may steer the terminal or break a line. */
const plain = (text: string) => text.replace(/\p{Cc}/gu, " ").trim();

const COLUMNS: ReadonlyArray<{ title: string; left?: true }> = [
  { title: "academy", left: true },
  { title: "name", left: true },
  { title: "AI reviews" },
  { title: "review cost" },
  { title: "per review" },
  { title: "authoring calls" },
  { title: "authoring cost" },
  { title: "transcribed min" },
  { title: "total cost" },
  { title: "counted" },
  { title: "allowance" },
  { title: "used" },
];

function tableCells(line: UsageReportLine, total = false): string[] {
  const name = plain(line.name);
  return [
    plain(line.slug),
    name.length > 32 ? `${name.slice(0, 31)}…` : name,
    String(line.reviews),
    usd(line.reviewCostMicroUsd),
    line.costPerReviewMicroUsd === null ? "-" : usd(line.costPerReviewMicroUsd),
    String(line.authoringCalls),
    usd(line.authoringCostMicroUsd),
    minutes(line.transcriptionSeconds),
    usd(line.totalCostMicroUsd),
    usd(line.countedMicroUsd),
    // Academies have an allowance each; all of them together have none.
    total ? "" : line.allowanceMicroUsd === null ? "unlimited" : dollars(line.allowanceMicroUsd),
    line.allowancePercent === null ? (total ? "" : "-") : `${line.allowancePercent} %`,
  ];
}

/** Aligned columns for the terminal, a total line, and a star where prices were missing. */
export function usageReportTable(report: UsageReport): string {
  const rows = [...report.lines.map((line) => tableCells(line)), tableCells(report.total, true)];
  const widths = COLUMNS.map((column, index) =>
    Math.max(column.title.length, ...rows.map((row) => row[index]!.length)),
  );
  const format = (cells: string[], incomplete = false) =>
    cells
      .map((cell, index) =>
        COLUMNS[index]!.left ? cell.padEnd(widths[index]!) : cell.padStart(widths[index]!),
      )
      .join("  ") + (incomplete ? " *" : "");
  const rule = widths.map((width) => "-".repeat(width)).join("  ");
  return [
    `AI usage in ${report.month} (calendar month in ${USAGE_TIME_ZONE} time), costs in USD as the gateway reported them`,
    "",
    format(COLUMNS.map((column) => column.title)),
    rule,
    ...report.lines.map((line, index) => format(rows[index]!, line.costIncomplete)),
    rule,
    format(rows.at(-1)!, report.total.costIncomplete),
    "",
    `counted: what counts against the monthly allowance, with a fallback price where the gateway reported none (AI_UNPRICED_CALL_USD a call, ${(AUDIO_MINUTE_MICRO_USD / 1_000_000).toFixed(3)} a minute of transcribed audio). Allowances as set today.`,
    ...(report.total.costIncomplete
      ? ["* Some calls had no reported price: these costs are lower bounds."]
      : []),
  ].join("\n");
}

const CSV_HEADER = [
  "month",
  "academy",
  "name",
  "ai_reviews",
  "review_cost_usd",
  "cost_per_review_usd",
  "authoring_calls",
  "authoring_cost_usd",
  "transcription_minutes",
  "total_cost_usd",
  "costs_incomplete",
  "counted_usd",
  "allowance_usd",
  "allowance_used_percent",
];

/** RFC 4180 quoting; a leading =, +, - or @ is defused so no spreadsheet runs a name as a formula. */
function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** One line per academy for a spreadsheet; the total is left to it. */
export function usageReportCsv(report: UsageReport): string {
  const rows = report.lines.map((line) => [
    report.month,
    plain(line.slug),
    plain(line.name),
    String(line.reviews),
    usd(line.reviewCostMicroUsd),
    line.costPerReviewMicroUsd === null ? "" : usd(line.costPerReviewMicroUsd),
    String(line.authoringCalls),
    usd(line.authoringCostMicroUsd),
    minutes(line.transcriptionSeconds),
    usd(line.totalCostMicroUsd),
    String(line.costIncomplete),
    usd(line.countedMicroUsd),
    line.allowanceMicroUsd === null ? "unlimited" : dollars(line.allowanceMicroUsd),
    line.allowancePercent === null ? "" : String(line.allowancePercent),
  ]);
  return `${[CSV_HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

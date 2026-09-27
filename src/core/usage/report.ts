import { emptyTotals, mergeTotals, USAGE_TIME_ZONE, type KindUsage } from "@/core/usage/ai-usage";

/*
 * The operator's monthly report across academies (scripts/usage-report.ts):
 * what AI review costs per hand-in (brief §8 aims for under €0.10), what the
 * teams' authoring costs, and each academy's total. Costs are the gateway's,
 * in US dollars: enaibler's own costs, which academies never see.
 */

export interface AcademyUsage {
  slug: string;
  name: string;
  /** The month's totals by kind (usageByKind in server/studio/usage). */
  kinds: readonly KindUsage[];
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
  };
}

export function usageReport(month: string, academies: readonly AcademyUsage[]): UsageReport {
  return {
    month,
    lines: academies
      .map((academy) => usageReportLine(academy, academy.kinds))
      .sort((a, b) => b.totalCostMicroUsd - a.totalCostMicroUsd || a.slug.localeCompare(b.slug)),
    total: usageReportLine(
      {
        slug: "total",
        name: `${academies.length} ${academies.length === 1 ? "academy" : "academies"}`,
      },
      academies.flatMap((academy) => academy.kinds),
    ),
  };
}

const usd = (microUsd: number) => (microUsd / 1_000_000).toFixed(4);
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
];

function tableCells(line: UsageReportLine): string[] {
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
  ];
}

/** Aligned columns for the terminal, a total line, and a star where prices were missing. */
export function usageReportTable(report: UsageReport): string {
  const lines = [...report.lines, report.total];
  const rows = lines.map(tableCells);
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
    ...(report.total.costIncomplete
      ? ["", "* Some calls had no reported price: these costs are lower bounds."]
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
  ]);
  return `${[CSV_HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

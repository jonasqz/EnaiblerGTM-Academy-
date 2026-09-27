/**
 * Every call to a model is metered per academy (brief §8 and §11: tokens and
 * cost of every call), so AI features can be priced on what they use (brief
 * §15, decision 6). Learners cause reviews; everything else is authoring or
 * setup work of the academy's team.
 */
export const AI_USAGE_KINDS = [
  "review",
  "calibration",
  "rubric_draft",
  "interview",
  "lesson_draft",
  "recording_topics",
  "transcription",
  "embedding",
  "brand_import",
] as const;

export type AiUsageKind = (typeof AI_USAGE_KINDS)[number];

export const AI_USAGE_GROUPS = {
  /** AI review of learners' hand-ins: grows with learners, the natural unit of a price tier. */
  review: ["review"],
  /** The team building courses: drafts, calibration, transcripts, source search. */
  authoring: [
    "calibration",
    "rubric_draft",
    "interview",
    "lesson_draft",
    "recording_topics",
    "transcription",
    "embedding",
  ],
  setup: ["brand_import"],
} as const satisfies Record<string, readonly AiUsageKind[]>;

export type AiUsageGroup = keyof typeof AI_USAGE_GROUPS;

export function usageGroupOf(kind: AiUsageKind): AiUsageGroup {
  for (const [group, kinds] of Object.entries(AI_USAGE_GROUPS) as Array<
    [AiUsageGroup, readonly AiUsageKind[]]
  >) {
    if (kinds.includes(kind)) return group;
  }
  return "setup";
}

/** One metered call (or batch) as the server records it. */
export interface AiUsageRecord {
  kind: AiUsageKind;
  model: string | null;
  calls: number;
  tokensIn: number | null;
  tokensOut: number | null;
  /** Transcription: seconds of audio. */
  audioSeconds: number | null;
  /** Provider cost as the gateway reports it, in millionths of a US dollar; null when unknown. */
  costMicroUsd: number | null;
}

/** US dollars (as LiteLLM reports them) to the integer micro-dollars we store. */
export function toMicroUsd(cost: number | null | undefined): number | null {
  return cost === null || cost === undefined || !Number.isFinite(cost)
    ? null
    : Math.round(cost * 1_000_000);
}

/** Usage is counted by calendar month in Berlin time, in the Studio and the operator's report alike. */
export const USAGE_TIME_ZONE = "Europe/Berlin";

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isUsageMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH.test(value);
}

function parseMonth(month: string): { year: number; index: number } {
  const match = MONTH.exec(month);
  if (!match) throw new Error(`Not a month: ${month}`);
  return { year: Number(match[1]), index: Number(match[2]) - 1 };
}

/** "2026-09" for the month a moment falls in, in the given time zone (Berlin by default). */
export function usageMonth(date: Date, timeZone = USAGE_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

/** The first moment of a "2026-09" month and of the month after, in the given time zone. */
export function monthRange(month: string, timeZone = USAGE_TIME_ZONE): { from: Date; to: Date } {
  const { year, index } = parseMonth(month);
  return {
    from: zonedMidnight(year, index, timeZone),
    to: zonedMidnight(index === 11 ? year + 1 : year, (index + 1) % 12, timeZone),
  };
}

/** The month `delta` months after a "2026-09" month (before it when negative). */
export function shiftMonth(month: string, delta: number): string {
  const { year, index } = parseMonth(month);
  const shifted = year * 12 + index + delta;
  return `${Math.floor(shifted / 12)}-${String((shifted % 12) + 1).padStart(2, "0")}`;
}

/** `count` months ending with `month`, the newest first. */
export function recentMonths(month: string, count: number): string[] {
  return Array.from({ length: count }, (_, back) => shiftMonth(month, -back));
}

/** The 15th at noon UTC: inside the month in every time zone, so naming the month never slips. */
export function midMonth(month: string): Date {
  const { year, index } = parseMonth(month);
  return new Date(Date.UTC(year, index, 15, 12));
}

/** Midnight on the first of a month in a time zone, as a UTC instant. */
function zonedMidnight(year: number, monthIndex: number, timeZone: string): Date {
  const utc = Date.UTC(year, monthIndex, 1);
  // The zone's offset at that moment: format the UTC instant there and compare.
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  })
    .formatToParts(new Date(utc))
    .reduce<Record<string, number>>((all, part) => {
      if (part.type !== "literal") all[part.type] = Number(part.value);
      return all;
    }, {});
  const asLocal = Date.UTC(local.year!, local.month! - 1, local.day!, local.hour!, local.minute!);
  return new Date(utc - (asLocal - utc));
}

export interface UsageTotals {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  audioSeconds: number;
  costMicroUsd: number;
  /** Some calls had no reported price: the cost is a lower bound. */
  costIncomplete: boolean;
}

export function emptyTotals(): UsageTotals {
  return {
    calls: 0,
    tokensIn: 0,
    tokensOut: 0,
    audioSeconds: 0,
    costMicroUsd: 0,
    costIncomplete: false,
  };
}

export function addUsage(totals: UsageTotals, record: Omit<AiUsageRecord, "kind" | "model">) {
  totals.calls += record.calls;
  totals.tokensIn += record.tokensIn ?? 0;
  totals.tokensOut += record.tokensOut ?? 0;
  totals.audioSeconds += record.audioSeconds ?? 0;
  if (record.costMicroUsd === null) totals.costIncomplete = true;
  else totals.costMicroUsd += record.costMicroUsd;
  return totals;
}

/** Adds totals that are already added up, such as one kind's month to an academy's. */
export function mergeTotals(totals: UsageTotals, more: UsageTotals): UsageTotals {
  totals.calls += more.calls;
  totals.tokensIn += more.tokensIn;
  totals.tokensOut += more.tokensOut;
  totals.audioSeconds += more.audioSeconds;
  totals.costMicroUsd += more.costMicroUsd;
  totals.costIncomplete ||= more.costIncomplete;
  return totals;
}

/** One kind's totals over a period, as the database adds them up. */
export interface KindUsage extends UsageTotals {
  kind: AiUsageKind;
  /**
   * The hand-ins, runs, sources or drafts the calls were for, each once (a
   * call without one counts on its own). For reviews: the hand-ins the AI
   * reviewed, however many attempts the model needed.
   */
  items: number;
}

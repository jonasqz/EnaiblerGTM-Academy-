import { JobFailure } from "@/core/authoring/job-errors";
import { monthRange, usageMonth } from "@/core/usage/ai-usage";

/**
 * The monthly AI allowance of an academy, set by the operator (never by the
 * academy): until AI use is priced (brief §15, decision 6), anyone who
 * creates an academy could otherwise run up enaibler's provider bill. It is
 * counted like the usage report, per calendar month in Berlin time, in US
 * dollars of provider cost as ai_usage records it. The metering path checks
 * it before every model call (server/ai-usage.ts); academies see only the
 * share they used, never an amount.
 */

/** What the operator set for one academy: an amount, the platform default, or no limit. */
export type AllowanceSetting =
  { kind: "default" } | { kind: "unlimited" } | { kind: "amount"; microUsd: number };

/** tenants.ai_allowance_micro_usd stores "no limit" as -1; null is the platform default. */
export const UNLIMITED_COLUMN = -1;

export function allowanceFromColumn(value: number | null): AllowanceSetting {
  if (value === null) return { kind: "default" };
  if (value < 0) return { kind: "unlimited" };
  return { kind: "amount", microUsd: value };
}

export function allowanceToColumn(setting: AllowanceSetting): number | null {
  switch (setting.kind) {
    case "default":
      return null;
    case "unlimited":
      return UNLIMITED_COLUMN;
    case "amount":
      if (!Number.isSafeInteger(setting.microUsd) || setting.microUsd < 0) {
        throw new Error(`Not an allowance: ${setting.microUsd} micro-dollars`);
      }
      return setting.microUsd;
  }
}

/** The allowance in force: the academy's own, else the platform default; null means no limit. */
export function effectiveAllowance(
  setting: AllowanceSetting,
  platformDefaultMicroUsd: number | null,
): number | null {
  switch (setting.kind) {
    case "default":
      return platformDefaultMicroUsd;
    case "unlimited":
      return null;
    case "amount":
      return setting.microUsd;
  }
}

const USD = /^(\d{1,9})(?:\.(\d{1,6}))?$/;

/** "25" or "12.50" as micro-dollars, without a detour through floating point; null otherwise. */
export function parseUsd(text: string): number | null {
  const match = USD.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 1_000_000 + Number((match[2] ?? "").padEnd(6, "0"));
}

/** The operator's input: an amount in US dollars, "default" or "unlimited"; null for anything else. */
export function parseAllowance(text: string): AllowanceSetting | null {
  const value = text.trim().toLowerCase();
  if (value === "default") return { kind: "default" };
  if (value === "unlimited") return { kind: "unlimited" };
  const microUsd = parseUsd(value);
  return microUsd === null ? null : { kind: "amount", microUsd };
}

/**
 * What a call counts when nobody put a price on it, so that no model is free
 * by accident. The gateway reports no price for a model missing from its
 * price table; our own Whisper has no price per call and records 0.
 */
export interface AllowanceRates {
  /** A call without a reported price (AI_UNPRICED_CALL_USD). */
  unpricedCallMicroUsd: number;
  /** A minute of audio transcribed without a price. */
  audioMinuteMicroUsd: number;
}

/** $0.05: more than a typical review call, so a missing price shows rather than saves. */
export const DEFAULT_UNPRICED_CALL_MICRO_USD = 50_000;
/** $0.006: what hosted Whisper charges a minute; our own server stands in at that price. */
export const AUDIO_MINUTE_MICRO_USD = 6_000;

export interface AllowanceConfig {
  /** AI_MONTHLY_ALLOWANCE_USD; null (unset) means no limit. */
  defaultMicroUsd: number | null;
  rates: AllowanceRates;
}

/** From the environment's values: unset or empty means the default; anything unreadable throws. */
export function parseAllowanceConfig(values: {
  AI_MONTHLY_ALLOWANCE_USD?: string;
  AI_UNPRICED_CALL_USD?: string;
}): AllowanceConfig {
  const amount = (name: keyof typeof values): number | null => {
    const raw = values[name]?.trim();
    if (!raw) return null;
    const microUsd = parseUsd(raw);
    if (microUsd === null) {
      throw new Error(`${name} must be an amount in US dollars, such as 25 or 12.50`);
    }
    return microUsd;
  };
  return {
    defaultMicroUsd: amount("AI_MONTHLY_ALLOWANCE_USD"),
    rates: {
      unpricedCallMicroUsd: amount("AI_UNPRICED_CALL_USD") ?? DEFAULT_UNPRICED_CALL_MICRO_USD,
      audioMinuteMicroUsd: AUDIO_MINUTE_MICRO_USD,
    },
  };
}

/** A month's usage rows added up by the database, in the three ways the allowance counts them. */
export interface AllowanceSpend {
  /** The costs the gateway reported. */
  pricedMicroUsd: number;
  /** Calls without a price, audio excepted. */
  unpricedCalls: number;
  /** Seconds of audio transcribed without a price. */
  unpricedAudioSeconds: number;
}

/** What the month counts against the allowance, in micro-dollars. */
export function countedMicroUsd(spend: AllowanceSpend, rates: AllowanceRates): number {
  return Math.round(
    spend.pricedMicroUsd +
      spend.unpricedCalls * rates.unpricedCallMicroUsd +
      (spend.unpricedAudioSeconds * rates.audioMinuteMicroUsd) / 60,
  );
}

/**
 * Another call may start while the month's spend is below the allowance. The
 * check comes before a call and its cost after it, so the last call of a
 * month can go a little over.
 */
export function allowanceLeft(spentMicroUsd: number, allowanceMicroUsd: number | null): boolean {
  return allowanceMicroUsd === null || spentMicroUsd < allowanceMicroUsd;
}

/** Whole percent, rounded down: 100 % only once it is used up, which an allowance of 0 is. */
export function percentUsed(spentMicroUsd: number, allowanceMicroUsd: number): number {
  if (allowanceMicroUsd <= 0) return 100;
  return Math.floor((spentMicroUsd * 100) / allowanceMicroUsd);
}

/** From here the Studio warns that the allowance is running out. */
export const ALLOWANCE_WARNING_PERCENT = 80;

export type AllowanceLevel = "ok" | "warning" | "used_up";

export function allowanceLevel(spentMicroUsd: number, allowanceMicroUsd: number): AllowanceLevel {
  if (!allowanceLeft(spentMicroUsd, allowanceMicroUsd)) return "used_up";
  return percentUsed(spentMicroUsd, allowanceMicroUsd) >= ALLOWANCE_WARNING_PERCENT
    ? "warning"
    : "ok";
}

/** The start of the next month in Berlin: from then on the allowance is whole again. */
export function allowanceResetsAt(now: Date = new Date()): Date {
  return monthRange(usageMonth(now)).to;
}

export interface AllowanceStatus {
  /** The month counted, "2026-09", in Berlin time. */
  month: string;
  setting: AllowanceSetting;
  /** The allowance in force; null means no limit. */
  allowanceMicroUsd: number | null;
  /** The month's usage as the allowance counts it, fallback prices included. */
  spentMicroUsd: number;
  /** Whole percent used, past 100 when the last calls went over; null without a limit. */
  percentUsed: number | null;
  level: AllowanceLevel | null;
  /** The start of the next month in Berlin, when the allowance is whole again. */
  resetsAt: Date;
}

export function allowanceStatus(input: {
  month: string;
  setting: AllowanceSetting;
  platformDefaultMicroUsd: number | null;
  spentMicroUsd: number;
}): AllowanceStatus {
  const allowance = effectiveAllowance(input.setting, input.platformDefaultMicroUsd);
  return {
    month: input.month,
    setting: input.setting,
    allowanceMicroUsd: allowance,
    spentMicroUsd: input.spentMicroUsd,
    percentUsed: allowance === null ? null : percentUsed(input.spentMicroUsd, allowance),
    level: allowance === null ? null : allowanceLevel(input.spentMicroUsd, allowance),
    resetsAt: monthRange(input.month).to,
  };
}

/**
 * Thrown before a model call once the academy's allowance for the month is
 * used up. A job failure that trying again this month will not fix: reviews
 * wait for a person, authoring jobs stop with the code.
 */
export class AiAllowanceUsedUp extends JobFailure {
  constructor() {
    super("ai_allowance_used_up");
    this.name = "AiAllowanceUsedUp";
  }
}

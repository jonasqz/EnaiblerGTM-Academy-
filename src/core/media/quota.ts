/**
 * Video storage per academy (webinar brief §6, open question 2): every
 * re-live keeps its original and its renditions, so storage grows with each
 * one. Until storage is priced, the operator sets a quota, like the AI
 * allowance: a platform default (MEDIA_STORAGE_QUOTA_GB, unset means no
 * limit) and, per academy, its own amount, no limit or the default again.
 * Never the academy's own setting: it is in neither the manifest nor the
 * Studio settings. Academies see the share they use.
 */

/** Decimal gigabytes, as storage is sold. */
export const BYTES_PER_GB = 1_000_000_000;

export type QuotaSetting =
  { kind: "default" } | { kind: "unlimited" } | { kind: "amount"; bytes: number };

/** tenants.media_storage_quota_bytes stores "no limit" as -1; null is the platform default. */
export const UNLIMITED_COLUMN = -1;

export function quotaFromColumn(value: number | null): QuotaSetting {
  if (value === null) return { kind: "default" };
  if (value < 0) return { kind: "unlimited" };
  return { kind: "amount", bytes: value };
}

export function quotaToColumn(setting: QuotaSetting): number | null {
  switch (setting.kind) {
    case "default":
      return null;
    case "unlimited":
      return UNLIMITED_COLUMN;
    case "amount":
      if (!Number.isSafeInteger(setting.bytes) || setting.bytes < 0) {
        throw new Error(`Not a storage quota: ${setting.bytes} bytes`);
      }
      return setting.bytes;
  }
}

const GB = /^(\d{1,7})(?:\.(\d{1,3}))?$/;

/** "50" or "2.5" gigabytes as bytes, without floating point; null otherwise. */
export function parseGb(text: string): number | null {
  const match = GB.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * BYTES_PER_GB + Number((match[2] ?? "").padEnd(3, "0")) * 1_000_000;
}

/** The operator's input: gigabytes, "default" or "unlimited"; null for anything else. */
export function parseQuota(text: string): QuotaSetting | null {
  const value = text.trim().toLowerCase();
  if (value === "default") return { kind: "default" };
  if (value === "unlimited") return { kind: "unlimited" };
  const bytes = parseGb(value);
  return bytes === null ? null : { kind: "amount", bytes };
}

/** MEDIA_STORAGE_QUOTA_GB: unset or empty means no limit; anything unreadable throws. */
export function parseQuotaDefault(value: string | undefined): number | null {
  const raw = value?.trim();
  if (!raw) return null;
  const bytes = parseGb(raw);
  if (bytes === null) {
    throw new Error("MEDIA_STORAGE_QUOTA_GB must be an amount in gigabytes, such as 50 or 2.5");
  }
  return bytes;
}

/** The quota in force: the academy's own, else the platform default; null means no limit. */
export function effectiveQuota(
  setting: QuotaSetting,
  platformDefaultBytes: number | null,
): number | null {
  switch (setting.kind) {
    case "default":
      return platformDefaultBytes;
    case "unlimited":
      return null;
    case "amount":
      return setting.bytes;
  }
}

/**
 * Whether `addingBytes` more fit. The check comes before an upload or a
 * transcode, and a transcode's renditions are estimated by its original, so
 * the last video can go a little over.
 */
export function quotaAdmits(usedBytes: number, addingBytes: number, quotaBytes: number | null) {
  return quotaBytes === null || usedBytes + Math.max(0, addingBytes) <= quotaBytes;
}

/** Whole percent, rounded down; a quota of 0 is used up. */
export function quotaPercent(usedBytes: number, quotaBytes: number): number {
  if (quotaBytes <= 0) return 100;
  return Math.floor((usedBytes * 100) / quotaBytes);
}

/** From here the Studio warns that video storage is running out. */
export const QUOTA_WARNING_PERCENT = 80;

export interface QuotaStatus {
  setting: QuotaSetting;
  /** The quota in force; null means no limit. */
  quotaBytes: number | null;
  usedBytes: number;
  /** Null without a limit. */
  percentUsed: number | null;
  level: "ok" | "warning" | "full" | null;
}

export function quotaStatus(input: {
  setting: QuotaSetting;
  platformDefaultBytes: number | null;
  usedBytes: number;
}): QuotaStatus {
  const quotaBytes = effectiveQuota(input.setting, input.platformDefaultBytes);
  if (quotaBytes === null) {
    return {
      setting: input.setting,
      quotaBytes,
      usedBytes: input.usedBytes,
      percentUsed: null,
      level: null,
    };
  }
  const percent = quotaPercent(input.usedBytes, quotaBytes);
  return {
    setting: input.setting,
    quotaBytes,
    usedBytes: input.usedBytes,
    percentUsed: percent,
    level: percent >= 100 ? "full" : percent >= QUOTA_WARNING_PERCENT ? "warning" : "ok",
  };
}

/** "1.25 GB" for the operator's command line. */
export function formatGb(bytes: number): string {
  return `${(bytes / BYTES_PER_GB).toFixed(2)} GB`;
}

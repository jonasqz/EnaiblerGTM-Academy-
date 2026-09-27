import { fromSharedCredential, shareChannelOf, type ShareChannel } from "@/core/credentials/share";

/*
 * What shared certificates bring an academy (brief §2 steps 7–8, §14): the
 * Studio's sharing numbers for a period. The queries count events by one
 * property; which LinkedIn channel or entry that is, and the rates, are
 * decided here, so the overview and a course page count the same way.
 */

/** Periods the overview offers, in days. */
export const OVERVIEW_PERIODS = [7, 30, 90] as const;
export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number];
export const DEFAULT_PERIOD: OverviewPeriod = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `?days=90` → 90; anything else is the default, so an edited address still shows the page. */
export function overviewPeriod(value: unknown): OverviewPeriod {
  const days = Number(Array.isArray(value) ? value[0] : value);
  return OVERVIEW_PERIODS.find((period) => period === days) ?? DEFAULT_PERIOD;
}

/** The last `days` days up to now. */
export function periodWindow(days: number, now = new Date()): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - days * DAY_MS), to: now };
}

/** Events counted by one property: `props.via` of a visit, `props.target` of a share. */
export interface KeyCount {
  key: string | null;
  n: number;
}

/** Sign-ups or course starts counted by the utm values of their entry link. */
export interface EntryCount {
  source: string | null;
  medium: string | null;
  n: number;
}

export type ChannelCounts = Record<ShareChannel | "other", number> & { total: number };

/**
 * By the LinkedIn channel a certificate was shared on: a post, the learner's
 * profile, or "other" for a link passed on any other way (or not known).
 */
export function byChannel(rows: readonly KeyCount[]): ChannelCounts {
  const counts: ChannelCounts = { post: 0, profile: 0, other: 0, total: 0 };
  for (const row of rows) {
    counts[shareChannelOf(row.key) ?? "other"] += row.n;
    counts.total += row.n;
  }
  return counts;
}

/** How many of these entries came through the call to action of a shared certificate. */
export function viaSharedCredentials(rows: readonly EntryCount[]): number {
  return rows
    .filter((row) =>
      fromSharedCredential({ source: row.source ?? undefined, medium: row.medium ?? undefined }),
    )
    .reduce((sum, row) => sum + row.n, 0);
}

/** `part` of `whole` as a whole percentage; null when there is nothing to compare with. */
export function percentOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** What the queries count in one period. */
export interface SharingCounts {
  /** Certificates issued in the period (not imported ones, not revoked ones). */
  issued: number;
  /** Of those, the ones their learners made public (share rate, brief §14). */
  madePublic: number;
  /** "Share on LinkedIn" by target: a post or the learner's profile. */
  shares: readonly KeyCount[];
  /** Views of certificate pages by the channel the visitor came from. */
  views: readonly KeyCount[];
  /** Clicks on the certificate page's call to action, by channel. */
  clicks: readonly KeyCount[];
  /** New learners (or, for one course, starts) by the utm values of their entry link. */
  entries: readonly EntryCount[];
  /** Learners who agreed to be contacted in the period and still agree. */
  newLeads: number;
}

export interface SharingSummary {
  issued: number;
  madePublic: number;
  /** Percent of the certificates issued in the period that learners made public. */
  shareRate: number | null;
  shared: ChannelCounts;
  views: ChannelCounts;
  clicks: ChannelCounts;
  /** Percent of certificate page views that led to a click on the call to action. */
  clickRate: number | null;
  newLearners: number;
  newLeads: number;
}

export function summarizeSharing(counts: SharingCounts): SharingSummary {
  const views = byChannel(counts.views);
  const clicks = byChannel(counts.clicks);
  return {
    issued: counts.issued,
    madePublic: counts.madePublic,
    shareRate: percentOf(counts.madePublic, counts.issued),
    shared: byChannel(counts.shares),
    views,
    clicks,
    clickRate: percentOf(clicks.total, views.total),
    newLearners: viaSharedCredentials(counts.entries),
    newLeads: counts.newLeads,
  };
}

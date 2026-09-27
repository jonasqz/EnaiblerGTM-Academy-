/**
 * Auto-update (brief §7, "later"): web pages a course was written from are
 * read again once a day. When one changed, the lessons written from it are
 * flagged until an author marked them as reviewed. Uploaded documents,
 * recordings and interviews do not change on their own.
 */
export const RECHECK_INTERVAL_HOURS = 24;

export function recheckDue(
  source: { kind: string; status: string; checkedAt: Date | null },
  now: Date,
): boolean {
  if (source.kind !== "url" || source.status !== "ready") return false;
  if (!source.checkedAt) return true;
  return now.getTime() - source.checkedAt.getTime() >= RECHECK_INTERVAL_HOURS * 60 * 60_000;
}

/** A lesson's flag says which source changed, so the Studio can name and link it. */
export function sourceChangedReason(sourceId: string): string {
  return `source_changed:${sourceId}`;
}

export function changedSourceOf(reason: string | null | undefined): string | null {
  const match = /^source_changed:([0-9a-f-]{36})$/i.exec(reason ?? "");
  return match ? match[1]! : null;
}

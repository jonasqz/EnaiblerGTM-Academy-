/** Why a result waits for a human, or why a released one is spot-checked (brief §8). */
export const HOLD_REASON_LABELS: Record<string, string> = {
  human_only: "Humans review this course",
  policy_requires_human: "Every result is confirmed",
  near_threshold: "Close to the pass mark",
  repeated_failure: "Repeated failed attempt",
  ai_unavailable: "AI review unavailable",
  ai_invalid_output: "AI answer was unusable",
};

export const AUDIT_LABELS: Record<string, string> = {
  initial_phase: "One of the first passes",
  sampled: "Random sample",
};

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(date: Date, now = new Date()): string {
  const minutes = Math.round((date.getTime() - now.getTime()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

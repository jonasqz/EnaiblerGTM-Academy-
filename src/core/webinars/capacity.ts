/**
 * Seats and the waitlist (webinar brief §2.2): registration closes at
 * capacity, later confirmations join the waitlist, and a freed seat goes to
 * whoever has waited longest. No capacity means no limit.
 */
export type Seat = "registered" | "waitlist";

/** Where a newly confirmed registration lands, given how many seats are taken. */
export function seatFor(capacity: number | null, taken: number): Seat {
  return capacity === null || taken < capacity ? "registered" : "waitlist";
}

export function seatsLeft(capacity: number | null, taken: number): number | null {
  return capacity === null ? null : Math.max(0, capacity - taken);
}

export type CapacityState = "open" | "few_left" | "full";

/** What the landing page says about seats: "few left" from a tenth of the room (at least 3). */
export function capacityState(capacity: number | null, taken: number): CapacityState {
  const left = seatsLeft(capacity, taken);
  if (left === null) return "open";
  if (left === 0) return "full";
  return left <= Math.max(3, Math.ceil(capacity! * 0.1)) ? "few_left" : "open";
}

export interface WaitlistEntry {
  id: string;
  /** When they joined the waitlist; the order never depends on anything else. */
  queuedAt: Date;
}

/** First come, first served; the id breaks ties so the order is stable. */
export function waitlistOrder<T extends WaitlistEntry>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) => a.queuedAt.getTime() - b.queuedAt.getTime() || a.id.localeCompare(b.id),
  );
}

/**
 * Who moves up now that seats may be free: as many as there are free seats,
 * in waitlist order. Lowering the capacity never takes a seat away.
 */
export function toPromote<T extends WaitlistEntry>(
  capacity: number | null,
  taken: number,
  waitlist: readonly T[],
): T[] {
  const ordered = waitlistOrder(waitlist);
  if (capacity === null) return ordered;
  return ordered.slice(0, Math.max(0, capacity - taken));
}

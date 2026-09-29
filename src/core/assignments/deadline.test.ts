import { describe, expect, it } from "vitest";

import {
  deadlineState,
  formatDeadline,
  handInDecision,
  homeworkReminderAt,
  homeworkReminderDue,
} from "@/core/assignments/deadline";

const HOUR = 60 * 60_000;
const due = new Date("2026-10-13T16:00:00Z");
const at = (hours: number) => new Date(due.getTime() + hours * HOUR);

describe("homework deadline", () => {
  it("says how close it is", () => {
    expect(deadlineState(null, at(0))).toBe("none");
    expect(deadlineState(due, at(-49))).toBe("open");
    expect(deadlineState(due, at(-48))).toBe("soon");
    expect(deadlineState(due, due)).toBe("soon");
    expect(deadlineState(due, new Date(due.getTime() + 1))).toBe("passed");
  });

  it("takes late hand-ins or refuses them, as the academy decided", () => {
    const late = new Date(due.getTime() + 1);
    const decide = (policy: "accepted" | "refused", now: Date, revision = false) =>
      handInDecision({ dueAt: due, policy, revision, now });
    expect(decide("refused", due)).toBe("on_time");
    expect(decide("refused", late)).toBe("refused");
    expect(decide("accepted", late)).toBe("late");
    // Work handed in once may always be revised.
    expect(decide("refused", late, true)).toBe("on_time");
    expect(handInDecision({ dueAt: null, policy: "refused", revision: false, now: late })).toBe(
      "on_time",
    );
  });

  it("plans the reminder two days before, unless that has passed", () => {
    expect(homeworkReminderAt(due, at(-72))).toEqual(at(-48));
    // Due within the minute still goes.
    expect(homeworkReminderAt(due, new Date(at(-48).getTime() + 30_000))).toEqual(at(-48));
    expect(homeworkReminderAt(due, at(-24))).toBeNull();
    expect(homeworkReminderAt(null, at(-72))).toBeNull();
  });

  it("names the deadline in the zone it was set in", () => {
    expect(formatDeadline(due, "Europe/Berlin", "en")).toBe("Tue, 13 Oct 2026, 18:00 CEST");
    expect(formatDeadline(due, "Europe/Berlin", "de")).toBe("Di., 13. Okt. 2026, 18:00 MESZ");
  });

  it("sends a reminder only while it is still true", () => {
    const state = {
      plannedFor: due.toISOString(),
      dueAt: due,
      enrolled: true,
      completed: false,
      handedIn: false,
      asksForWork: true,
    };
    expect(homeworkReminderDue(state)).toBe("send");
    expect(homeworkReminderDue({ ...state, handedIn: true })).toBe("handed_in");
    expect(homeworkReminderDue({ ...state, dueAt: at(24) })).toBe("rescheduled");
    expect(homeworkReminderDue({ ...state, dueAt: null })).toBe("rescheduled");
    expect(homeworkReminderDue({ ...state, enrolled: false })).toBe("not_enrolled");
    expect(homeworkReminderDue({ ...state, completed: true })).toBe("completed");
    expect(homeworkReminderDue({ ...state, asksForWork: false })).toBe("no_work");
  });
});

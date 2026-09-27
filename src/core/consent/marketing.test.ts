import { describe, expect, it } from "vitest";

import {
  canConfirm,
  consentState,
  newsOptInLocale,
  type ConsentRecord,
} from "@/core/consent/marketing";

const requestedAt = new Date("2026-10-01T10:00:00Z");
const pending: ConsentRecord = {
  requestedAt,
  confirmTokenHash: "hash",
  confirmedAt: null,
  revokedAt: null,
};
const days = (n: number) => new Date(requestedAt.getTime() + n * 24 * 60 * 60_000);

describe("marketing double opt-in", () => {
  it("is pending until the link is clicked, for a week", () => {
    expect(consentState(null, days(0))).toBe("none");
    expect(consentState(pending, days(6))).toBe("pending");
    expect(canConfirm(pending, days(6))).toBe(true);
    expect(consentState(pending, days(7))).toBe("expired");
    expect(canConfirm(pending, days(8))).toBe(false);
  });

  it("counts only a confirmed, unrevoked consent", () => {
    const confirmed = { ...pending, confirmTokenHash: null, confirmedAt: days(1) };
    expect(consentState(confirmed, days(30))).toBe("confirmed");
    expect(canConfirm(confirmed, days(2))).toBe(false);
    expect(consentState({ ...confirmed, revokedAt: days(3) }, days(4))).toBe("revoked");
  });

  it("takes the sign-up box's language only if the academy offers it", () => {
    expect(newsOptInLocale("de", ["de", "en"])).toBe("de");
    expect(newsOptInLocale("en", ["de"])).toBeNull();
    expect(newsOptInLocale("1", ["de", "en"])).toBeNull();
    expect(newsOptInLocale(null, ["de", "en"])).toBeNull();
  });
});

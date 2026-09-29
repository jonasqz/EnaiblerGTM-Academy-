import { describe, expect, it } from "vitest";

import { canPublishWithDeliveryMode, checkDeliveryMode } from "@/core/compliance/delivery-mode";
import {
  hasBlockingWording,
  lintLocalizedWording,
  lintWording,
} from "@/core/compliance/wording-lint";

describe("wording guardrail", () => {
  it.each([
    "Certified Product Manager",
    "ISO-certified method",
    "A certification programme",
    "Get certified today",
    "Accredited by the Board",
    "Accreditation pending",
    "Zertifizierter Product Owner",
    "IHK-zertifiziert",
    "Zertifizierung inklusive",
    "Rezertifizierung jährlich",
    "akkreditierte Weiterbildung",
    "staatlich anerkannt",
    "Staatlich-anerkannte Qualifikation",
  ])("blocks %j in course titles", (title) => {
    const findings = lintWording(title, "course_title");
    expect(findings.length).toBeGreaterThan(0);
    expect(hasBlockingWording(findings)).toBe(true);
  });

  it.each([
    "Certificate of Completion",
    "Abschlussbescheinigung",
    "Market Sizing with AI",
    "Validation Lab",
    "Uncertain markets",
    "Zertifikat",
  ])("allows %j", (text) => {
    expect(lintWording(text, "course_title")).toEqual([]);
  });

  it("only warns in lesson text", () => {
    const findings = lintWording(
      "Unlike certification programmes, we grade real work.",
      "lesson_text",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("warning");
    expect(hasBlockingWording(findings)).toBe(false);
  });

  it("applies every locale's list to every text and reports the locale", () => {
    const findings = lintLocalizedWording({ de: "Certified Scaler", en: "Scaler" }, "path_name");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ locale: "de", match: "Certified", severity: "error" });
  });

  it("reports every occurrence with its position", () => {
    const findings = lintWording("certified and certified", "credential_template");
    expect(findings.map((finding) => finding.index)).toEqual([0, 14]);
  });
});

describe("delivery modes (FernUSG)", () => {
  it("always allows free, self-paced courses", () => {
    expect(checkDeliveryMode({ deliveryMode: "free_async" })).toEqual([]);
    expect(canPublishWithDeliveryMode({ deliveryMode: "free_async" })).toBe(true);
  });

  it("blocks paid courses until payments ship", () => {
    const issues = checkDeliveryMode({ deliveryMode: "paid_live" });
    expect(issues.map((issue) => issue.code)).toEqual(["payments_not_available"]);
    expect(canPublishWithDeliveryMode({ deliveryMode: "paid_live" })).toBe(false);
  });

  it("never lets paid live courses offer recordings", () => {
    const issues = checkDeliveryMode(
      { deliveryMode: "paid_live", offersRecordings: true },
      { paymentsEnabled: true },
    );
    expect(issues.map((issue) => issue.code)).toEqual(["paid_live_offers_recordings"]);
  });

  it("warns when paid live marketing text mentions recordings", () => {
    const issues = checkDeliveryMode(
      { deliveryMode: "paid_live", texts: ["Live-Workshop inkl. Aufzeichnung"] },
      { paymentsEnabled: true },
    );
    expect(issues).toEqual([
      expect.objectContaining({ code: "possible_recording_promise", severity: "warning" }),
    ]);
  });

  it("requires confirmed ZFU approval for paid self-paced courses", () => {
    const platform = { paymentsEnabled: true };
    expect(
      checkDeliveryMode({ deliveryMode: "paid_async_approved" }, platform).map((i) => i.code),
    ).toEqual(["zfu_approval_missing"]);
    expect(
      canPublishWithDeliveryMode(
        {
          deliveryMode: "paid_async_approved",
          zfuApproval: {
            confirmedAt: "2027-10-01",
            confirmedBy: "tenant-admin",
            approvalNumber: "123456",
          },
        },
        platform,
      ),
    ).toBe(true);
  });

  it("lets a recording stand in for a paid live session only with ZFU approval (webinar brief §5)", () => {
    const platform = { paymentsEnabled: true };
    const approval = { confirmedAt: "2027-10-01", confirmedBy: "tenant-admin" };
    const codes = (input: Parameters<typeof checkDeliveryMode>[0]) =>
      checkDeliveryMode(input, platform).map((issue) => issue.code);
    expect(codes({ deliveryMode: "paid_live", sessionRule: "attended_or_watched" })).toEqual([
      "paid_recording_replaces_session",
    ]);
    // Attending live is fine for a paid live series; free series have no restriction.
    expect(codes({ deliveryMode: "paid_live", sessionRule: "attended" })).toEqual([]);
    expect(codes({ deliveryMode: "free_async", sessionRule: "attended_or_watched" })).toEqual([]);
    expect(
      codes({
        deliveryMode: "paid_async_approved",
        zfuApproval: approval,
        sessionRule: "attended_or_watched",
      }),
    ).toEqual([]);
    expect(
      codes({ deliveryMode: "paid_async_approved", sessionRule: "attended_or_watched" }),
    ).toEqual(["paid_recording_replaces_session", "zfu_approval_missing"]);
    // Blocked anyway while payments are not there.
    expect(
      checkDeliveryMode({ deliveryMode: "paid_live", sessionRule: "attended_or_watched" }).map(
        (issue) => issue.code,
      ),
    ).toEqual(["payments_not_available", "paid_recording_replaces_session"]);
  });
});

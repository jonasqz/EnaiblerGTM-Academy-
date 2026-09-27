import { describe, expect, it } from "vitest";

import { contentReportMail } from "@/core/platform/operator-mail";
import type { ContentReport } from "@/core/platform/report";

const report: ContentReport = {
  url: "https://acme.academies.enaibler.app/verify/ABCD-EFGH-JKMN-PQRS",
  reason: "illegal",
  explanation: "The showcase shows my photo.\nI never agreed to that.",
  name: "Jane Doe",
  email: "jane@example.com",
};

describe("mail to the operator", () => {
  it("brings everything a content report needs to be decided", () => {
    const mail = contentReportMail({
      reference: "R-ABCD-EFGH",
      receivedAt: new Date("2026-09-27T14:30:12Z"),
      report,
      where: 'Academy "Acme Sales Academy" (acme)',
      locale: "de",
    });
    expect(mail.subject).toBe(
      "Content report R-ABCD-EFGH: Illegal content on acme.academies.enaibler.app",
    );
    for (const part of [
      "R-ABCD-EFGH",
      "2026-09-27 14:30 UTC",
      report.url,
      'Academy "Acme Sales Academy" (acme)',
      "Jane Doe <jane@example.com>",
      "Confirmed in good faith",
      "The showcase shows my photo.\nI never agreed to that.",
      "Reply to this e-mail",
    ]) {
      expect(mail.text).toContain(part);
    }
  });

  it("says when a reporter stayed anonymous, and what child abuse material asks for", () => {
    const mail = contentReportMail({
      reference: "R-ABCD-EFGH",
      receivedAt: new Date("2026-09-27T14:30:12Z"),
      report: { ...report, reason: "csam", name: null, email: null },
      where: "Not an address of this deployment",
      locale: "en",
    });
    expect(mail.text).toContain("not given (allowed for child sexual abuse material)");
    expect(mail.text).toContain("Art. 18");
    expect(mail.text).not.toContain("Reply to this e-mail");
  });
});

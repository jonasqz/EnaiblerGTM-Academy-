import { describe, expect, it } from "vitest";

import { contentReportMail, newAcademyMail } from "@/core/platform/operator-mail";
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

  it("names a new academy, its address and its admin", () => {
    const mail = newAcademyMail({
      name: "Acme Sales Academy",
      slug: "acme",
      url: "https://acme.academies.enaibler.app",
      adminEmail: "admin@acme.example",
      locales: ["de", "en"],
      website: null,
      createdAt: new Date("2026-09-27T14:30:00Z"),
    });
    expect(mail.subject).toBe("New academy: Acme Sales Academy (acme)");
    expect(mail.text).toMatch(/^Address: +https:\/\/acme\.academies\.enaibler\.app$/m);
    expect(mail.text).toMatch(/^Admin: +admin@acme\.example$/m);
    expect(mail.text).toMatch(/^Languages: +de, en$/m);
    expect(mail.text).toMatch(/^Website: +none given$/m);
  });
});

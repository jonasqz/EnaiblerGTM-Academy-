import type { Locale } from "@/core/i18n/locales";
import type { ContentReport, ReportReason } from "@/core/platform/report";

/*
 * Mail to enaibler's own team from the website: content reports (to
 * PLATFORM_ABUSE_EMAIL) and new academies (to PLATFORM_NOTIFY_EMAIL). In
 * English and plain text, so what people typed arrives exactly as typed.
 */

const REASONS: Record<ReportReason, string> = {
  illegal: "Illegal content",
  csam: "Child sexual abuse material",
  terms: "Breach of the terms of use",
  other: "Something else",
};

function utc(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function rows(entries: ReadonlyArray<readonly [string, string]>): string {
  const width = Math.max(...entries.map(([label]) => label.length)) + 2;
  return entries.map(([label, value]) => `${`${label}:`.padEnd(width)}${value}`).join("\n");
}

export function contentReportMail(input: {
  reference: string;
  receivedAt: Date;
  report: ContentReport;
  /** Whose content the address points at, as far as the host tells. */
  where: string;
  locale: Locale;
}): { subject: string; text: string } {
  const { report } = input;
  const reporter = report.email
    ? `${report.name ?? "(no name)"} <${report.email}>`
    : "not given (allowed for child sexual abuse material)";
  const next = [
    "Next: decide without undue delay and tell the reporter what you decided and how to challenge it (DSA Art. 16(5)). If you restrict the content, give the academy a statement of reasons (Art. 17).",
    report.email
      ? "Reply to this e-mail to reach the reporter."
      : "The reporter left no address, so they cannot be told the decision.",
  ];
  if (report.reason === "csam") {
    next.unshift(
      "Reported as child sexual abuse material: act at once. Where a criminal offence threatens someone's life or safety, the DSA (Art. 18) requires informing the law enforcement authorities. Never download or forward the material.",
    );
  }
  const text = [
    "A content report came in through the website (Digital Services Act, Art. 16).",
    rows([
      ["Reference", input.reference],
      ["Received", utc(input.receivedAt)],
      ["Content", report.url],
      ["Where", input.where],
      ["Reason", REASONS[report.reason]],
      ["Reporter", reporter],
      ["Statement", "Confirmed in good faith that the report is accurate and complete"],
      ["Language", input.locale],
    ]),
    `Explanation:\n${report.explanation}`,
    next.join("\n\n"),
  ].join("\n\n");
  const host = new URL(report.url).host;
  return {
    subject: `Content report ${input.reference}: ${REASONS[report.reason]} on ${host}`,
    text,
  };
}

export function newAcademyMail(input: {
  name: string;
  slug: string;
  url: string;
  adminEmail: string;
  locales: readonly Locale[];
  website: string | null;
  createdAt: Date;
}): { subject: string; text: string } {
  return {
    subject: `New academy: ${input.name} (${input.slug})`,
    text: [
      "A new academy was created on the website.",
      rows([
        ["Academy", input.name],
        ["Address", input.url],
        ["Admin", input.adminEmail],
        ["Languages", input.locales.join(", ")],
        ["Website", input.website ?? "none given"],
        ["Created", utc(input.createdAt)],
      ]),
    ].join("\n\n"),
  };
}

"use server";

import { headers } from "next/headers";
import { after } from "next/server";

import { REPORT } from "@/core/i18n/site/report";
import { reportReference, validateContentReport, type ReportField } from "@/core/platform/report";
import { reportError } from "@/server/observability/report";
import { platformConfig } from "@/server/platform/config";
import { confirmContentReport, sendContentReport } from "@/server/platform/notices";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { getLocale } from "@/server/request";

export type ReportState =
  | { status: "idle" }
  | { status: "sent"; reference: string; email: string | null }
  | { status: "error"; fields: Partial<Record<ReportField, string>>; message?: string };

const HOUR = 60 * 60_000;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Notice and action (DSA Art. 16): the report goes to the operator, the reporter gets a receipt. */
export async function sendReportAction(
  _previous: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const locale = await getLocale();
  const copy = REPORT[locale];
  const config = platformConfig();
  const to = config?.abuseEmail;
  if (!config || !to) return { status: "error", fields: {}, message: copy.errors.unavailable };

  // Bots fill every field; people never see this one.
  if (text(formData, "fax")) return { status: "sent", reference: reportReference(), email: null };

  const result = validateContentReport({
    url: text(formData, "url"),
    reason: text(formData, "reason"),
    explanation: text(formData, "explanation"),
    name: text(formData, "name"),
    email: text(formData, "email"),
    goodFaith: formData.get("goodFaith") === "on",
  });
  if (!result.ok) {
    return {
      status: "error",
      fields: Object.fromEntries(result.fields.map((field) => [field, copy.errors[field]])),
    };
  }
  const { report } = result;

  // Only complete reports count: someone fixing a typo is not flooding anyone.
  const requestHeaders = await headers();
  if (
    !rateLimit(`report-ip:${clientIp(requestHeaders)}`, 10, HOUR) ||
    (report.email && !rateLimit(`report-email:${report.email}`, 5, HOUR))
  ) {
    return { status: "error", fields: {}, message: copy.errors.rateLimited };
  }

  const reference = reportReference();
  const receivedAt = new Date();
  try {
    await sendContentReport({ to, report, reference, receivedAt, locale });
  } catch (error) {
    await reportError(error, { runtime: "web", route: "/report" });
    return { status: "error", fields: {}, message: copy.errors.failed };
  }
  const email = report.email;
  if (email) {
    after(() => confirmContentReport({ config, to: email, reference, receivedAt, locale }));
  }
  return { status: "sent", reference, email };
}

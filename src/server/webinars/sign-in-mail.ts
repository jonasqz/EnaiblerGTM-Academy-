import { and, eq } from "drizzle-orm";

import type { Translator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";
import { webinarPhase } from "@/core/webinars/phase";
import { formatWebinarDate, formatWebinarTime } from "@/core/webinars/time";
import type { Database } from "@/db/client";
import { webinarRegistrations, webinars } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { renderNoticeEmail } from "@/server/email/templates/notice";

/**
 * The one mail someone gets after sending a webinar's form: the magic link,
 * worded as confirming their seat, or after the end as getting the
 * recording. The wording comes from the pending
 * registration itself, found by id and address, never from the request: a
 * sign-in link requested any other way reads as a plain sign-in.
 */
export async function webinarSignInMail(
  db: Database,
  tenant: TenantContext,
  input: { registrationId: string; email: string; url: string; t: Translator; minutes: number },
): Promise<{ subject: string; html: string; text: string } | null> {
  if (!/^[0-9a-f-]{36}$/.test(input.registrationId)) return null;
  const [row] = await withTenant(db, tenant.id, (tx) =>
    tx
      .select({ webinar: webinars })
      .from(webinarRegistrations)
      .innerJoin(webinars, eq(webinars.id, webinarRegistrations.webinarId))
      .where(
        and(
          eq(webinarRegistrations.id, input.registrationId),
          eq(webinarRegistrations.status, "pending"),
          eq(webinarRegistrations.email, input.email.trim().toLowerCase()),
        ),
      ),
  );
  if (!row) return null;
  const { t } = input;
  const { webinar } = row;
  const academy = tenant.settings.author_display_name;
  const note = t.t("email.webinar.confirmLink.note", { minutes: input.minutes });
  const reason = t.t("email.webinar.reason", { academy });
  const subject = t.t("email.webinar.confirmLink.subject", { title: webinar.title });
  // After the end the form was for the recording (webinar brief §3): no seat, no time to be there.
  if (webinarPhase(webinar, new Date()) === "ended") {
    const date = formatWebinarDate(webinar.startsAt, webinar.timeZone, t.locale);
    return renderNoticeEmail({
      tenant,
      t,
      subject,
      heading: t.t("email.webinar.confirmLink.reliveHeading"),
      paragraphs: [t.t("email.webinar.confirmLink.reliveBody", { title: webinar.title, academy })],
      list: [t.t("email.webinar.recordedOn", { date })],
      button: { label: t.t("email.webinar.confirmLink.reliveButton"), url: input.url },
      note,
      reason,
    });
  }
  const time = formatWebinarTime(
    webinar.startsAt,
    webinar.durationMinutes,
    webinar.timeZone,
    t.locale,
  );
  return renderNoticeEmail({
    tenant,
    t,
    subject,
    heading: t.t("email.webinar.confirmLink.heading"),
    paragraphs: [t.t("email.webinar.confirmLink.body", { title: webinar.title, academy })],
    list: [t.t("email.webinar.when", { time })],
    button: { label: t.t("email.webinar.confirmLink.button"), url: input.url },
    note,
    reason,
  });
}

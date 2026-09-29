import { and, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { mediaAssets, notifications, webinarRegistrations, webinars } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { queueWebinarMail } from "@/server/webinars/mail";

/*
 * The recording reaches every registrant once (webinar brief §2.4: "missed
 * the live session? Registrants get the re-live automatically"). Once a
 * published webinar has ended and its recording is ready, each registrant
 * (a seat or the waitlist) who has not had it gets it: a follow-up or a
 * confirmation still waiting to go out is upgraded to bring it, so nobody
 * gets both; everyone else gets a mail of its own. Marked on the
 * registration, so a video prepared again or a new one attached mails
 * nobody twice. Runs every minute in the worker, before the outbox.
 */

/** Mails that bring the recording when it is ready by the time they are queued or upgraded. */
const CARRIERS = ["followup", "relive_confirmation"] as const;

export async function queueReliveMails(
  db: Database,
  tenantId: string,
  now: Date = new Date(),
): Promise<number> {
  return withTenant(db, tenantId, async (tx) => {
    const due = await tx
      .select({
        id: webinarRegistrations.id,
        userId: webinarRegistrations.userId,
        webinarId: webinarRegistrations.webinarId,
      })
      .from(webinarRegistrations)
      .innerJoin(webinars, eq(webinars.id, webinarRegistrations.webinarId))
      .innerJoin(mediaAssets, eq(mediaAssets.id, webinars.recordingAssetId))
      .where(
        and(
          eq(webinars.status, "published"),
          eq(mediaAssets.status, "ready"),
          lte(
            sql`${webinars.startsAt} + make_interval(mins => ${webinars.durationMinutes})`,
            sql`${now.toISOString()}::timestamptz`,
          ),
          inArray(webinarRegistrations.status, ["registered", "waitlist"]),
          isNull(webinarRegistrations.reliveMailedAt),
          isNotNull(webinarRegistrations.userId),
        ),
      )
      // Another run, or someone registering right now, has these: the next minute sees them.
      .for("update", { of: webinarRegistrations, skipLocked: true });

    let queued = 0;
    for (const registration of due) {
      const ofRegistration = and(
        eq(notifications.kind, "webinar"),
        eq(notifications.status, "pending"),
        sql`${notifications.payload}->>'registrationId' = ${registration.id}`,
        inArray(sql`${notifications.payload}->>'step'`, [...CARRIERS]),
      );
      const waiting = await tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(ofRegistration);
      const held = waiting.length
        ? await tx
            .select({ id: notifications.id })
            .from(notifications)
            .where(
              and(
                ofRegistration,
                inArray(
                  notifications.id,
                  waiting.map((row) => row.id),
                ),
              ),
            )
            .for("update", { skipLocked: true })
        : [];
      // One is being sent right now: whether it brought the recording shows next time.
      if (held.length < waiting.length) continue;
      if (held.length > 0) {
        await tx
          .update(notifications)
          .set({ payload: sql`${notifications.payload} || '{"recording": true}'::jsonb` })
          .where(
            inArray(
              notifications.id,
              held.map((row) => row.id),
            ),
          );
      } else {
        await queueWebinarMail(tx, tenantId, {
          userId: registration.userId!,
          webinarId: registration.webinarId,
          registrationId: registration.id,
          step: "relive",
        });
      }
      await tx
        .update(webinarRegistrations)
        .set({ reliveMailedAt: now })
        .where(eq(webinarRegistrations.id, registration.id));
      queued++;
    }
    return queued;
  });
}

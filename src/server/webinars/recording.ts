import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";

import type { TenantContext } from "@/core/tenant/context";
import {
  catchUpRate,
  changeReliveAccess,
  mediaAccessFor,
  reliveState,
  watchedRecording,
  type CatchUp,
  type ReliveAccess,
  type ReliveAccessChange,
  type ReliveState,
} from "@/core/webinars/relive";
import type { Database, Transaction } from "@/db/client";
import {
  mediaAssets,
  user,
  watchProgress,
  webinarAttendance,
  webinarRegistrations,
  webinars,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import type { MediaAsset } from "@/server/media/library";

/*
 * A webinar's recording (webinar brief §2.4 re-live, §5 recording consent):
 * a video of the media library shown on the webinar's page once it has
 * ended. The webinar is where it is managed: who may watch is set here and
 * the video's own access follows; a video is the recording of one webinar
 * at most. Widening beyond registrants needs the host's confirmation, kept
 * with who and when. Used by the Studio, the pages, the mails and the
 * worker, so no Next.js here.
 */

type WebinarRow = typeof webinars.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Back to registrants, with no confirmation: for a webinar without its recording or with a new one. */
const PRIVATE = {
  reliveAccess: "registrants",
  reliveConfirmedAt: null,
  reliveConfirmedBy: null,
} as const;

/** The video a webinar shows as its recording, if any. */
export async function recordingOf(
  tx: Transaction,
  webinar: Pick<WebinarRow, "recordingAssetId">,
): Promise<MediaAsset | null> {
  if (!webinar.recordingAssetId) return null;
  const [asset] = await tx
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, webinar.recordingAssetId));
  return asset ?? null;
}

/** What the webinar's page offers of its recording now (core/webinars/relive). */
export async function reliveOf(
  tx: Transaction,
  webinar: Pick<WebinarRow, "recordingAssetId" | "status" | "startsAt" | "durationMinutes">,
  now: Date,
): Promise<ReliveState> {
  if (!webinar.recordingAssetId) return "none";
  const [asset] = await tx
    .select({ status: mediaAssets.status })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, webinar.recordingAssetId));
  return reliveState(webinar, asset ?? null, now);
}

export type AttachIssue = "not_found" | "cancelled" | "video_not_found" | "in_use";

/**
 * Shows a video of the library as the webinar's recording, ready or still
 * being prepared. A different video than before starts over at
 * registrants: the host's confirmation was about the other one. Its access
 * follows the webinar from now on.
 */
export async function attachRecording(
  db: Database,
  tenantId: string,
  webinarId: string,
  assetId: string,
): Promise<{ ok: true } | { ok: false; issue: AttachIssue }> {
  if (!UUID.test(assetId)) return { ok: false, issue: "video_not_found" };
  return withTenant(db, tenantId, async (tx) => {
    const [webinar] = await tx
      .select()
      .from(webinars)
      .where(eq(webinars.id, webinarId))
      .for("update");
    if (!webinar) return { ok: false, issue: "not_found" } as const;
    if (webinar.status === "cancelled") return { ok: false, issue: "cancelled" } as const;
    // Locked, so two webinars never take the same video at once.
    const [asset] = await tx
      .select({ id: mediaAssets.id, status: mediaAssets.status })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, assetId))
      .for("update");
    if (!asset || asset.status === "failed")
      return { ok: false, issue: "video_not_found" } as const;
    if (webinar.recordingAssetId === asset.id) return { ok: true } as const;
    const [taken] = await tx
      .select({ id: webinars.id })
      .from(webinars)
      .where(and(eq(webinars.recordingAssetId, asset.id), ne(webinars.id, webinar.id)));
    if (taken) return { ok: false, issue: "in_use" } as const;
    await tx
      .update(webinars)
      .set({ recordingAssetId: asset.id, ...PRIVATE })
      .where(eq(webinars.id, webinar.id));
    await tx
      .update(mediaAssets)
      .set({ access: mediaAccessFor(PRIVATE.reliveAccess) })
      .where(eq(mediaAssets.id, asset.id));
    return { ok: true } as const;
  });
}

/**
 * Takes the recording off the webinar; the video stays in the library with
 * the access it had. The page goes back to "this webinar has ended".
 */
export async function detachRecording(
  db: Database,
  tenantId: string,
  webinarId: string,
): Promise<boolean> {
  const updated = await withTenant(db, tenantId, (tx) =>
    tx
      .update(webinars)
      .set({ recordingAssetId: null, ...PRIVATE })
      .where(and(eq(webinars.id, webinarId), isNotNull(webinars.recordingAssetId)))
      .returning({ id: webinars.id }),
  );
  return updated.length > 0;
}

/** Takes a video off whatever webinar shows it, before the video is deleted. */
export async function detachVideoEverywhere(tx: Transaction, assetId: string): Promise<void> {
  await tx
    .update(webinars)
    .set({ recordingAssetId: null, ...PRIVATE })
    .where(eq(webinars.recordingAssetId, assetId));
}

/**
 * Who may watch (core/webinars/relive): narrowing always, widening only with
 * the host's confirmation, recorded with who and when. The recording's own
 * access changes in the same transaction.
 */
export async function setReliveAccess(
  db: Database,
  tenantId: string,
  webinarId: string,
  next: ReliveAccess,
  input: { confirmed: boolean; userId: string; now?: Date },
): Promise<ReliveAccessChange | { ok: false; issue: "not_found" | "cancelled" }> {
  const now = input.now ?? new Date();
  return withTenant(db, tenantId, async (tx) => {
    const [webinar] = await tx
      .select()
      .from(webinars)
      .where(eq(webinars.id, webinarId))
      .for("update");
    if (!webinar) return { ok: false, issue: "not_found" } as const;
    if (webinar.status === "cancelled") return { ok: false, issue: "cancelled" } as const;
    const change = changeReliveAccess(webinar.reliveAccess, next, {
      confirmed: input.confirmed,
      hasRecording: webinar.recordingAssetId !== null,
    });
    if (!change.ok) return change;
    await tx
      .update(webinars)
      .set({
        reliveAccess: change.access,
        ...(change.confirmation === "record"
          ? { reliveConfirmedAt: now, reliveConfirmedBy: input.userId }
          : change.confirmation === "clear"
            ? { reliveConfirmedAt: null, reliveConfirmedBy: null }
            : {}),
      })
      .where(eq(webinars.id, webinar.id));
    if (webinar.recordingAssetId) {
      await tx
        .update(mediaAssets)
        .set({ access: mediaAccessFor(change.access) })
        .where(eq(mediaAssets.id, webinar.recordingAssetId));
    }
    return change;
  });
}

export interface ShowingWebinar {
  id: string;
  title: string;
  slug: string;
  reliveAccess: ReliveAccess;
}

/** The webinar that shows a video as its recording (Studio → Videos links to it). */
export async function webinarShowing(
  db: Database,
  tenantId: string,
  assetId: string,
): Promise<ShowingWebinar | null> {
  if (!UUID.test(assetId)) return null;
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .select({
        id: webinars.id,
        title: webinars.title,
        slug: webinars.slug,
        reliveAccess: webinars.reliveAccess,
      })
      .from(webinars)
      .where(eq(webinars.recordingAssetId, assetId)),
  );
  return row ?? null;
}

/** Videos a webinar can take as its recording: not failed, and no other webinar's. */
export async function attachableVideos(db: Database, tenantId: string, webinarId: string) {
  return withTenant(db, tenantId, (tx) =>
    tx
      .select({
        id: mediaAssets.id,
        title: mediaAssets.title,
        status: mediaAssets.status,
        kind: mediaAssets.kind,
        createdAt: mediaAssets.createdAt,
      })
      .from(mediaAssets)
      .where(
        and(
          ne(mediaAssets.status, "failed"),
          sql`not exists (select 1 from ${webinars} w where w.recording_asset_id = ${mediaAssets.id} and w.id <> ${webinarId})`,
        ),
      )
      .orderBy(desc(mediaAssets.createdAt)),
  );
}

/** Who confirmed a wider audience: their name or address, shown to the team only. */
export async function confirmerOf(
  db: Database,
  webinar: Pick<WebinarRow, "reliveConfirmedBy">,
): Promise<string | null> {
  if (!webinar.reliveConfirmedBy) return null;
  const [row] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, webinar.reliveConfirmedBy));
  return row ? row.name.trim() || row.email : null;
}

/** Each confirmed registration with whether they attended and how much of the recording they played. */
export async function registrantsWatching(tx: Transaction, webinarId: string, assetId: string) {
  return tx
    .select({
      status: webinarRegistrations.status,
      confirmedAt: webinarRegistrations.confirmedAt,
      reliveMailedAt: webinarRegistrations.reliveMailedAt,
      attended: sql<boolean>`${webinarAttendance.id} is not null`,
      watchedPercent: watchProgress.percent,
    })
    .from(webinarRegistrations)
    .leftJoin(
      webinarAttendance,
      and(
        eq(webinarAttendance.webinarId, webinarRegistrations.webinarId),
        eq(webinarAttendance.userId, webinarRegistrations.userId),
      ),
    )
    .leftJoin(
      watchProgress,
      and(
        eq(watchProgress.assetId, assetId),
        eq(watchProgress.userId, webinarRegistrations.userId),
      ),
    )
    .where(
      and(
        eq(webinarRegistrations.webinarId, webinarId),
        isNotNull(webinarRegistrations.confirmedAt),
      ),
    );
}

export interface ReliveNumbers {
  assetId: string;
  /** Registrants who played at least the academy's threshold of it. */
  watched: number;
  catchUp: CatchUp;
  /** Registrants the recording was mailed to (its own mail or the follow-up). */
  mailed: number;
}

/** The recording's numbers for the Studio: watched, the no-show catch-up rate, mails sent. */
export async function reliveNumbers(
  db: Database,
  tenant: Pick<TenantContext, "id" | "settings">,
  webinarId: string,
): Promise<ReliveNumbers | null> {
  const threshold = tenant.settings.video.watched_percent;
  return withTenant(db, tenant.id, async (tx) => {
    const [webinar] = await tx.select().from(webinars).where(eq(webinars.id, webinarId));
    if (!webinar?.recordingAssetId) return null;
    const rows = await registrantsWatching(tx, webinar.id, webinar.recordingAssetId);
    return {
      assetId: webinar.recordingAssetId,
      watched: rows.filter((row) => watchedRecording(row.watchedPercent, threshold)).length,
      catchUp: catchUpRate(rows, webinar, threshold),
      mailed: rows.filter((row) => row.reliveMailedAt !== null).length,
    };
  });
}

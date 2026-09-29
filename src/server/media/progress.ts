import { and, eq, inArray } from "drizzle-orm";

import { canWatch, tracksViewer, type MediaViewer } from "@/core/media/access";
import { applyReport, type ProgressReport } from "@/core/media/ranges";
import type { TenantContext } from "@/core/tenant/context";
import type { Database } from "@/db/client";
import { mediaAssets, watchProgress } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { trackEvent } from "@/server/events";
import { signedUpIn } from "@/server/media/viewer";

/*
 * Watch tracking (webinar brief §2.4). The player reports every range it
 * played in this page view; the stored ranges become their union, so a lost,
 * repeated or late report changes nothing. Only signed-in viewers are
 * tracked. The first report records `video_started`, the report that first
 * covers the academy's threshold `video_watched`, both in the transaction
 * that stores the progress.
 */

export interface RecordedProgress {
  percent: number;
  watched: boolean;
  /** Where the viewer was, for resuming. */
  positionSec: number | null;
}

export async function recordProgress(
  db: Database,
  tenant: Pick<TenantContext, "id" | "settings">,
  viewer: MediaViewer & { userId: string },
  report: ProgressReport,
  now: Date = new Date(),
): Promise<RecordedProgress | null> {
  if (!tracksViewer(viewer)) return null;
  const threshold = tenant.settings.video.watched_percent;
  return withTenant(db, tenant.id, async (tx) => {
    const [asset] = await tx
      .select({
        id: mediaAssets.id,
        kind: mediaAssets.kind,
        status: mediaAssets.status,
        access: mediaAssets.access,
        durationSec: mediaAssets.durationSec,
      })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, report.asset));
    if (!asset || asset.status !== "ready") return null;
    // A webinar's recording: whether they registered for it is looked up here, like on its page.
    const signedUp =
      viewer.signedUp ??
      (asset.access === "registrants" &&
        (await signedUpIn(tx, viewer.userId, [asset.id])).size > 0);
    if (!canWatch(asset.access, { ...viewer, signedUp })) return null;

    const created = await tx
      .insert(watchProgress)
      .values({ tenantId: tenant.id, assetId: asset.id, userId: viewer.userId })
      .onConflictDoNothing()
      .returning({ id: watchProgress.id });
    // Two tabs of the same viewer report one after the other.
    const [stored] = await tx
      .select()
      .from(watchProgress)
      .where(and(eq(watchProgress.assetId, asset.id), eq(watchProgress.userId, viewer.userId)))
      .for("update");
    if (!stored) return null;

    // Our own videos have a measured length; an embed's only its player knows.
    const duration =
      asset.kind === "upload" ? asset.durationSec : (report.duration ?? stored.durationSec);
    const update = duration
      ? applyReport(
          stored.ranges,
          report.ranges,
          duration,
          threshold,
          Boolean(stored.thresholdReachedAt),
        )
      : null;
    const reachedAt = stored.thresholdReachedAt ?? (update?.crossedThreshold ? now : null);
    const positionSec = report.position ?? stored.positionSec;
    await tx
      .update(watchProgress)
      .set({
        ...(update
          ? { ranges: update.ranges, watchedSec: update.watchedSec, percent: update.percent }
          : {}),
        durationSec: duration ?? null,
        positionSec,
        lastWatchedAt: now,
        thresholdReachedAt: reachedAt,
      })
      .where(eq(watchProgress.id, stored.id));

    if (created.length > 0) {
      await trackEvent(tx, {
        tenantId: tenant.id,
        name: "video_started",
        userId: viewer.userId,
        props: { asset_id: asset.id },
      });
    }
    if (update?.crossedThreshold) {
      await trackEvent(tx, {
        tenantId: tenant.id,
        name: "video_watched",
        userId: viewer.userId,
        props: { asset_id: asset.id, percent: update.percent },
      });
    }
    return {
      percent: update?.percent ?? stored.percent,
      watched: reachedAt !== null,
      positionSec: positionSec ?? null,
    };
  });
}

/** Where a viewer left off and how much they have watched, for the player. */
export async function progressOf(
  db: Database,
  tenantId: string,
  userId: string,
  assetIds: readonly string[],
): Promise<Map<string, { percent: number; positionSec: number | null; watched: boolean }>> {
  if (assetIds.length === 0) return new Map();
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .select({
        assetId: watchProgress.assetId,
        percent: watchProgress.percent,
        positionSec: watchProgress.positionSec,
        reachedAt: watchProgress.thresholdReachedAt,
      })
      .from(watchProgress)
      .where(and(eq(watchProgress.userId, userId), inArray(watchProgress.assetId, [...assetIds]))),
  );
  return new Map(
    rows.map((row) => [
      row.assetId,
      { percent: row.percent, positionSec: row.positionSec, watched: row.reachedAt !== null },
    ]),
  );
}

import { and, eq, inArray, sql } from "drizzle-orm";

import { can, type MembershipRole } from "@/core/access/roles";
import { canWatch, type MediaAccess, type MediaViewer } from "@/core/media/access";
import type { Database, Transaction } from "@/db/client";
import { enrollments, lessons, webinarRegistrations, webinars } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { loadVideo, type MediaAsset } from "@/server/media/library";

/*
 * Who is watching, for canWatch (core/media/access): a member of the
 * academy, one of its authors, and whether they signed up where a video is
 * shown. A webinar's recording is for its registrants (webinar brief §2.4):
 * a seat or the waitlist of a published webinar, never a cancelled or
 * unconfirmed registration, never anyone who is not signed in. A session of
 * a series is also for the series' learners (webinar brief §2.7): they
 * catch up on it in the course, whatever happened to their seat. The serving
 * route, the progress API and every page that shows a video ask here.
 * Used by the worker's tests too, so no Next.js here.
 */

export interface MediaSession {
  userId: string;
  roles: readonly MembershipRole[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The videos among `assetIds` that are recordings of webinars this person registered for. */
export async function signedUpIn(
  tx: Transaction,
  userId: string,
  assetIds: readonly string[],
): Promise<Set<string>> {
  const wanted = [...new Set(assetIds.filter((id) => UUID.test(id)))];
  if (wanted.length === 0) return new Set();
  const rows = await tx
    .select({ assetId: webinars.recordingAssetId })
    .from(webinars)
    .innerJoin(webinarRegistrations, eq(webinarRegistrations.webinarId, webinars.id))
    .where(
      and(
        inArray(webinars.recordingAssetId, wanted),
        eq(webinars.status, "published"),
        eq(webinarRegistrations.userId, userId),
        inArray(webinarRegistrations.status, ["registered", "waitlist"]),
      ),
    );
  // Only a lesson that is the session makes the course its audience: a
  // webinar that merely leads into a course keeps its recording for those
  // who registered.
  const series = await tx
    .select({ assetId: webinars.recordingAssetId })
    .from(webinars)
    .innerJoin(
      enrollments,
      and(eq(enrollments.courseId, webinars.courseId), eq(enrollments.userId, userId)),
    )
    .where(
      and(
        inArray(webinars.recordingAssetId, wanted),
        eq(webinars.status, "published"),
        sql`exists (select 1 from ${lessons} where ${lessons.courseId} = ${webinars.courseId} and ${lessons.blocks} @> jsonb_build_array(jsonb_build_object('type', 'webinar', 'webinarId', ${webinars.id}::text)))`,
      ),
    );
  return new Set([...rows, ...series].map((row) => row.assetId!));
}

/**
 * The viewer for each of these videos, as canWatch takes it. The
 * registrations are looked up only for videos kept for registrants, and not
 * for authors, who preview every video anyway.
 */
export async function mediaViewers(
  db: Database,
  tenantId: string,
  session: MediaSession | null,
  assets: ReadonlyArray<{ id: string; access: MediaAccess }>,
): Promise<(assetId: string) => MediaViewer | null> {
  if (!session) return () => null;
  const member = session.roles.length > 0;
  const canEditCourses = can(session.roles, "courses.edit");
  const forRegistrants = assets.filter((asset) => asset.access === "registrants");
  const signedUp =
    member && !canEditCourses && forRegistrants.length > 0
      ? await withTenant(db, tenantId, (tx) =>
          signedUpIn(
            tx,
            session.userId,
            forRegistrants.map((asset) => asset.id),
          ),
        )
      : new Set<string>();
  return (assetId) => ({ member, canEditCourses, signedUp: signedUp.has(assetId) });
}

/** The viewer of one video. */
export async function mediaViewer(
  db: Database,
  tenantId: string,
  session: MediaSession | null,
  asset: { id: string; access: MediaAccess },
): Promise<MediaViewer | null> {
  return (await mediaViewers(db, tenantId, session, [asset]))(asset.id);
}

/**
 * The video whose files (playlists, segments, poster, captions) a request
 * may get: this academy's, prepared, and for this viewer; null otherwise.
 * The session is looked up only for videos that are not public.
 */
export async function servableVideo(
  db: Database,
  tenantId: string,
  assetId: string,
  session: () => Promise<MediaSession | null>,
): Promise<MediaAsset | null> {
  const asset = await loadVideo(db, tenantId, assetId);
  if (!asset || asset.kind !== "upload" || asset.status !== "ready" || !asset.hlsRun) return null;
  if (asset.access === "public") return asset;
  return canWatch(asset.access, await mediaViewer(db, tenantId, await session(), asset))
    ? asset
    : null;
}

import { createHash } from "node:crypto";

import type { NextRequest } from "next/server";

import { isLocale } from "@/core/i18n/locales";
import { captionCues, toWebVtt } from "@/core/media/captions";
import { hlsContentType, isHlsPath } from "@/core/media/transcode";
import { getDb } from "@/db/client";
import { getSession } from "@/server/access";
import { mediaKey, type MediaAsset } from "@/server/media/library";
import { servableVideo } from "@/server/media/viewer";
import { getTenant } from "@/server/request";
import { getObject } from "@/server/storage";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * A video's playlists, segments, poster and captions on the academy's own
 * domain (storage itself stays private). Access is checked on every request:
 * public videos play for anyone here, the others for signed-in members of the
 * academy, a webinar's recording only for its registrants unless its host
 * allowed more. The files of a transcode run never change, so public ones
 * are cached for good and private ones are revalidated (a 304 after the check).
 */
export async function GET(
  request: NextRequest,
  context: RouteContext<"/media/[assetId]/[...path]">,
): Promise<Response> {
  const { assetId, path } = await context.params;
  const tenant = await getTenant();
  const asset = await servableVideo(getDb(), tenant.id, assetId, async () => {
    const session = await getSession();
    return session && { userId: session.viewer.userId, roles: session.roles };
  });
  if (!asset?.hlsRun) return notFound();
  const isPublic = asset.access === "public";

  if (path[0] === "captions" && path.length === 2) return captions(request, asset, path[1]!);
  const [run, ...rest] = path;
  const file = rest.join("/");
  if (run !== asset.hlsRun || !isHlsPath(file)) return notFound();

  const etag = `"${run}-${file}"`;
  const headers = new Headers({
    "content-type": hlsContentType(file),
    "cache-control": isPublic ? "public, max-age=31536000, immutable" : "private, no-cache",
    "accept-ranges": "bytes",
    etag,
  });
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  const range = request.headers.get("range");
  const validRange = range && /^bytes=(\d+-\d*|-\d+)$/.test(range) ? range : undefined;
  try {
    const object = await getObject(tenant.id, mediaKey(tenant.id, asset.id, run, file), validRange);
    if (object.contentLength !== null) headers.set("content-length", String(object.contentLength));
    if (object.contentRange) headers.set("content-range", object.contentRange);
    return new Response(object.body, { status: object.contentRange ? 206 : 200, headers });
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "InvalidRange") return new Response(null, { status: 416 });
    if (name === "NoSuchKey") return notFound();
    throw error;
  }
}

/** Captions from the stored transcript: always as the transcript is now, cut into readable cues. */
function captions(request: NextRequest, asset: MediaAsset, file: string): Response {
  const locale = /^([a-z]{2})\.vtt$/.exec(file)?.[1];
  if (!isLocale(locale)) return notFound();
  const segments = locale === asset.locale ? asset.transcript : asset.captions[locale];
  if (!segments?.length) return notFound();
  const body = toWebVtt(captionCues(segments));
  const etag = `"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;
  const headers = new Headers({
    "content-type": "text/vtt; charset=utf-8",
    "cache-control": asset.access === "public" ? "public, max-age=300" : "private, no-cache",
    etag,
  });
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { headers });
}

import type { NextRequest } from "next/server";

import { can } from "@/core/access/roles";
import { canReadFile, inlineAllowed, PURPOSE_RULES } from "@/core/files/policy";
import type { FileFamily } from "@/core/files/sniff";
import { getDb } from "@/db/client";
import { getSession } from "@/server/access";
import { showcasedPublicly } from "@/server/credentials/showcase";
import { loadFile, openFile } from "@/server/files";
import { getTenant } from "@/server/request";

function familyOf(contentType: string): FileFamily {
  if (contentType === "image/svg+xml") return "svg";
  if (contentType === "application/pdf") return "pdf";
  const top = contentType.split("/")[0];
  return top === "image" || top === "video" || top === "audio" || top === "font" ? top : "text";
}

/**
 * Stored files on the academy's own domain (storage itself stays private).
 * Public assets are cached for good (a new upload gets a new id); everything
 * else is checked per request and never cached. Byte ranges make videos seekable.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext<"/files/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  const tenant = await getTenant();
  // Lessons link media as /files/<id>.<ext>: the extension tells the renderer what it is.
  const record = await loadFile(getDb(), tenant.id, id.replace(/\.[a-z0-9]{1,5}$/i, ""));
  const isPublic =
    record !== null &&
    record.status === "attached" &&
    PURPOSE_RULES[record.purpose].access === "public";
  const session = record && !isPublic ? await getSession() : null;
  const reader = session && {
    userId: session.viewer.userId,
    canReview: can(session.roles, "reviews.decide"),
    canEditCourses: can(session.roles, "courses.edit"),
  };
  // Showcase pictures: public while a public credential shows them (and never cached).
  const shownPublicly =
    record?.purpose === "showcase" && record.status === "attached"
      ? await showcasedPublicly(getDb(), tenant.id, record.id)
      : false;
  if (!record || !canReadFile(record, reader, { showcasedPublicly: shownPublicly })) {
    return new Response("Not found", { status: 404 });
  }

  const etag = `"${record.sha256}"`;
  const family = familyOf(record.contentType);
  const inline = inlineAllowed(family) && request.nextUrl.searchParams.get("download") !== "1";
  const headers = new Headers({
    "content-type": family === "text" ? `${record.contentType}; charset=utf-8` : record.contentType,
    "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(record.name)}`,
    "cache-control": isPublic ? "public, max-age=31536000, immutable" : "private, no-store",
    "accept-ranges": "bytes",
    etag,
  });
  // Opened directly, an SVG is a document: no scripts, no requests, own origin.
  if (family === "svg") {
    headers.set(
      "content-security-policy",
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
    );
  }
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  const range = request.headers.get("range");
  const validRange = range && /^bytes=(\d+-\d*|-\d+)$/.test(range) ? range : undefined;
  try {
    const object = await openFile(record, validRange);
    if (object.contentLength !== null) headers.set("content-length", String(object.contentLength));
    if (object.contentRange) headers.set("content-range", object.contentRange);
    return new Response(object.body, { status: object.contentRange ? 206 : 200, headers });
  } catch (error) {
    if ((error as { name?: string }).name === "InvalidRange") {
      return new Response(null, {
        status: 416,
        headers: { "content-range": `bytes */${record.sizeBytes}` },
      });
    }
    throw error;
  }
}

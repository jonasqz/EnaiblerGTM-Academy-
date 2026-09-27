import type { NextRequest } from "next/server";

import { getDb } from "@/db/client";
import { getViewer } from "@/server/auth";
import { renderCredentialImage } from "@/server/credential-image";
import { canView, loadCredential } from "@/server/credentials";
import { getOrigin, getTenant, getTranslator } from "@/server/request";

/** Credential image for link previews (og) and the card download (brief §6). */
export async function GET(
  request: NextRequest,
  context: RouteContext<"/verify/[publicId]/image">,
): Promise<Response> {
  const { publicId } = await context.params;
  const tenant = await getTenant();
  const credential = await loadCredential(tenant, publicId);
  const viewer = credential?.visibility === "public" ? null : await getViewer(tenant);
  if (!credential || !canView(credential, viewer?.userId ?? null))
    return new Response("Not found", { status: 404 });

  const format = request.nextUrl.searchParams.get("format") === "card" ? "card" : "og";
  const png = await renderCredentialImage(getDb(), tenant, credential, {
    t: await getTranslator(),
    origin: await getOrigin(),
    format,
  });

  const headers: Record<string, string> = {
    "content-type": "image/png",
    "cache-control":
      credential.visibility === "public" ? "public, max-age=300" : "private, no-store",
  };
  if (request.nextUrl.searchParams.get("download") === "1") {
    headers["content-disposition"] = `attachment; filename="credential-${credential.publicId}.png"`;
  }
  return new Response(png, { headers });
}

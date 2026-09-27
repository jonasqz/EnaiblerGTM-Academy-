import { getDb } from "@/db/client";
import { getViewer } from "@/server/auth";
import { loadCredential } from "@/server/credentials";
import { openBadgeFor } from "@/server/credentials/open-badge";
import { getTenant, getTranslator } from "@/server/request";

/**
 * The learner's credential as Open Badges 3.0 (brief §6): a VC-JWT signed by
 * the academy, for wallets and other platforms. Only for its owner: the
 * document carries a (salted, hashed) e-mail identity.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/verify/[publicId]/open-badge">,
): Promise<Response> {
  const { publicId } = await context.params;
  const tenant = await getTenant();
  const viewer = await getViewer(tenant);
  const credential = viewer ? await loadCredential(tenant, publicId) : null;
  if (!viewer || !credential || credential.userId !== viewer.userId) {
    return new Response("Not found", { status: 404 });
  }
  const badge = await openBadgeFor(getDb(), tenant, credential, {
    t: await getTranslator(),
    email: viewer.email,
  });
  const headers = { "cache-control": "private, no-store" };
  if (new URL(request.url).searchParams.get("format") === "json") {
    return Response.json(badge.credential, { headers });
  }
  return new Response(badge.jwt, {
    headers: {
      ...headers,
      "content-type": "application/vc+jwt",
      "content-disposition": `attachment; filename="open-badge-${credential.publicId}.jwt"`,
    },
  });
}

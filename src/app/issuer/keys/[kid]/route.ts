import { getDb } from "@/db/client";
import { issuerPublicKey } from "@/server/credentials/open-badge";
import { getTenant } from "@/server/request";

/** The public key verifiers fetch from a VC-JWT's `kid` (Open Badges 3.0). */
export async function GET(
  _request: Request,
  context: RouteContext<"/issuer/keys/[kid]">,
): Promise<Response> {
  const { kid } = await context.params;
  if (!/^[a-z0-9-]{1,40}$/.test(kid)) return new Response("Not found", { status: 404 });
  const jwk = await issuerPublicKey(getDb(), await getTenant(), kid);
  if (!jwk) return new Response("Not found", { status: 404 });
  return Response.json(jwk, { headers: { "cache-control": "public, max-age=3600" } });
}

import { issuerProfile } from "@/server/credentials/open-badge";
import { getTenant } from "@/server/request";

/** The academy as an Open Badges issuer: every credential's `issuer.id` points here. */
export async function GET(): Promise<Response> {
  return Response.json(issuerProfile(await getTenant()), {
    headers: { "cache-control": "public, max-age=300" },
  });
}

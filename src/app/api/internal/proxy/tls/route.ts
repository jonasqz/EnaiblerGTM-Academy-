import { eq } from "drizzle-orm";

import { normalizeHost } from "@/core/tenant/context";
import { getDb } from "@/db/client";
import { tenantDomains, tenants } from "@/db/schema";
import { proxyTokenValid } from "@/server/domains/internal-auth";
import { isPlatformHost } from "@/server/platform/config";

/**
 * On-demand TLS check for proxies that issue certificates per request
 * (Caddy's `ask`): 200 for the platform host and every live academy domain,
 * 404 for anything else, so nobody can make us request certificates for
 * arbitrary names.
 */
export async function GET(request: Request): Promise<Response> {
  if (!proxyTokenValid(request)) return new Response("Not found", { status: 404 });
  const domain = normalizeHost(new URL(request.url).searchParams.get("domain"));
  if (!domain) return new Response("Not found", { status: 404 });
  if (isPlatformHost(domain)) return new Response("OK");
  const [row] = await getDb()
    .select({ status: tenants.status })
    .from(tenantDomains)
    .innerJoin(tenants, eq(tenants.id, tenantDomains.tenantId))
    .where(eq(tenantDomains.domain, domain));
  return row?.status === "active" ? new Response("OK") : new Response("Not found", { status: 404 });
}

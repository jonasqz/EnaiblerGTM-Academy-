import { traefikDynamicConfig } from "@/core/domains/proxy-config";
import { getDb } from "@/db/client";
import { certificateDomains } from "@/server/domains/claims";
import { proxyTokenValid } from "@/server/domains/internal-auth";

/**
 * Traefik HTTP provider (see docs/deployment.md, custom domains): routes and
 * certificates for the custom domains academies verified in the Studio.
 * Outside the proxy (matcher in src/proxy.ts): Traefik calls it on an
 * internal host name.
 */
export async function GET(request: Request): Promise<Response> {
  const serviceUrl = process.env.PROXY_SERVICE_URL?.trim();
  if (!proxyTokenValid(request) || !serviceUrl) return new Response("Not found", { status: 404 });
  const config = traefikDynamicConfig(await certificateDomains(getDb()), {
    serviceUrl,
    httpEntryPoint: process.env.PROXY_HTTP_ENTRYPOINT?.trim() || "http",
    httpsEntryPoint: process.env.PROXY_HTTPS_ENTRYPOINT?.trim() || "https",
    certResolver: process.env.PROXY_CERT_RESOLVER?.trim() || "letsencrypt",
  });
  return Response.json(config, { headers: { "cache-control": "no-store" } });
}

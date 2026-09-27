/**
 * Traefik dynamic configuration for verified custom domains (served to
 * Traefik's HTTP provider by /api/internal/proxy/traefik). Coolify's proxy is
 * Traefik: with this, a domain an academy verifies gets its route and its
 * Let's Encrypt certificate without a redeploy.
 */
export interface TraefikOptions {
  /** How Traefik reaches the web container, e.g. http://enaibler-web:3000 */
  serviceUrl: string;
  httpEntryPoint: string;
  httpsEntryPoint: string;
  certResolver: string;
}

const SERVICE = "enaibler-web";
const TO_HTTPS = "enaibler-to-https";

export function traefikDynamicConfig(domains: readonly string[], options: TraefikOptions) {
  const routers: Record<string, unknown> = {};
  for (const domain of domains) {
    // Domains are validated host names, so they are safe inside the rule's backticks.
    const name = `enaibler-${domain.replace(/[^a-z0-9]/g, "-")}`;
    const rule = `Host(\`${domain}\`)`;
    routers[name] = {
      rule,
      entryPoints: [options.httpsEntryPoint],
      service: SERVICE,
      tls: { certResolver: options.certResolver },
    };
    routers[`${name}-http`] = {
      rule,
      entryPoints: [options.httpEntryPoint],
      middlewares: [TO_HTTPS],
      service: SERVICE,
    };
  }
  return {
    http: {
      routers,
      middlewares: { [TO_HTTPS]: { redirectScheme: { scheme: "https", permanent: true } } },
      services: { [SERVICE]: { loadBalancer: { servers: [{ url: options.serviceUrl }] } } },
    },
  };
}

import { timingSafeEqual } from "node:crypto";

/**
 * Internal endpoints for the reverse proxy. They answer only when
 * PROXY_CONFIG_TOKEN is set and the caller presents it (bearer header, or
 * ?token= for proxies that cannot send headers, such as Caddy's `ask`).
 */
export function proxyTokenValid(request: Request): boolean {
  const expected = process.env.PROXY_CONFIG_TOKEN?.trim();
  if (!expected) return false;
  const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const given = header ?? new URL(request.url).searchParams.get("token") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

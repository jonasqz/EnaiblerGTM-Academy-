import { devSlugFromHost, normalizeHost, type TenantContext } from "@/core/tenant/context";
import { getDb } from "@/db/client";
import { findTenantByDomain, findTenantBySlug } from "@/db/tenants";

/**
 * Host → tenant with a small in-process cache. The proxy runs on every
 * request (including RSC and prefetch requests), so lookups must be cheap.
 * Manifest changes show up within TTL_MS.
 */
const TTL_MS = 30_000;
const MISS_TTL_MS = 5_000;
const MAX_ENTRIES = 1_000;

type Cache = Map<string, { value: TenantContext | null; expires: number }>;

// One cache per process: Next loads this module separately for pages, route
// handlers and the proxy, and clearing it after a Studio save must reach all.
const shared = globalThis as typeof globalThis & { __enaiblerTenantCache?: Cache };
const cache: Cache = (shared.__enaiblerTenantCache ??= new Map());

async function lookup(host: string): Promise<TenantContext | null> {
  const db = getDb();
  const byDomain = await findTenantByDomain(db, host);
  if (byDomain || process.env.NODE_ENV === "production") return byDomain;

  // Development conveniences: <slug>.localhost and plain localhost.
  const slug =
    devSlugFromHost(host) ??
    (host === "localhost" ? (process.env.DEV_DEFAULT_TENANT ?? null) : null);
  return slug ? findTenantBySlug(db, slug) : null;
}

export async function resolveTenant(
  hostHeader: string | null | undefined,
): Promise<TenantContext | null> {
  const host = normalizeHost(hostHeader);
  if (!host) return null;

  const hit = cache.get(host);
  if (hit && hit.expires > Date.now()) return hit.value;

  const value = await lookup(host);
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(host, { value, expires: Date.now() + (value ? TTL_MS : MISS_TTL_MS) });
  return value;
}

/** For tests and after applying a manifest in-process. */
export function clearTenantCache(): void {
  cache.clear();
}

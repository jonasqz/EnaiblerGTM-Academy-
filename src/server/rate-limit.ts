/**
 * Small fixed-window rate limiter for server actions that call Better Auth
 * directly (its own limiter only covers HTTP requests to /api/auth). In-process:
 * good enough for one app container; move to Postgres when scaling out.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    if (windows.size > 10_000) windows.clear();
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

/** Client IP as seen by Traefik (Coolify's proxy sets X-Real-IP / X-Forwarded-For). */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ??
    "unknown"
  );
}

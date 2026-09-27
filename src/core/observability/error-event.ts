/**
 * Error reports for GlitchTip (brief §11, observability), in the Sentry
 * store format it accepts. Built here without an SDK so that nothing about
 * learners leaves by accident: no request bodies, headers or query strings,
 * and e-mail addresses and token-like strings are masked in messages.
 */

export interface Dsn {
  storeUrl: string;
  publicKey: string;
}

/** `https://<key>@<host>[/<prefix>]/<project>` → the project's store endpoint. */
export function parseDsn(input: string | undefined | null): Dsn | null {
  if (!input?.trim()) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const project = parts.pop();
  if (!url.username || !project || !/^\d+$/.test(project)) return null;
  const prefix = parts.length ? `/${parts.join("/")}` : "";
  return {
    storeUrl: `${url.protocol}//${url.host}${prefix}/api/${project}/store/`,
    publicKey: decodeURIComponent(url.username),
  };
}

export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/[A-Za-z0-9_-]{32,}/g, (match) =>
      // Record ids (UUIDs) help find the problem; long opaque strings may be tokens.
      /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(match) ? match : "[redacted]",
    );
}

export interface StackFrame {
  function?: string;
  filename: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
}

/** V8 stack lines, oldest call first (Sentry's order). */
export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return [];
  const frames: StackFrame[] = [];
  for (const line of stack.split("\n")) {
    const match =
      /^\s*at (?:(?:async )?(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line) ??
      /^\s*at (?:(?:async )?(.+?) \()?(.+?)\)?$/.exec(line);
    if (!match) continue;
    const [, fn, filename = "", lineno, colno] = match;
    frames.push({
      ...(fn ? { function: fn } : {}),
      filename,
      ...(lineno ? { lineno: Number(lineno) } : {}),
      ...(colno ? { colno: Number(colno) } : {}),
      in_app: !filename.includes("node_modules") && !filename.startsWith("node:"),
    });
  }
  return frames.reverse().slice(-50);
}

export interface ErrorContext {
  runtime: "web" | "worker";
  /** Academy slug, never a person. */
  tenant?: string | null;
  route?: string | null;
  method?: string | null;
  /** Path only: query strings can carry tokens. */
  path?: string | null;
  queue?: string | null;
  extra?: Record<string, string | number | boolean | null | undefined>;
}

export interface ErrorEvent {
  event_id: string;
  timestamp: number;
  platform: "node";
  level: "error";
  logger: "enaibler";
  environment: string;
  release?: string;
  exception: {
    values: Array<{ type: string; value: string; stacktrace?: { frames: StackFrame[] } }>;
  };
  tags: Record<string, string>;
  request?: { method?: string; url: string };
  fingerprint?: string[];
}

function asError(value: unknown): {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
} {
  if (value instanceof Error) return value;
  return {
    name: "NonError",
    message: typeof value === "string" ? value : (JSON.stringify(value) ?? String(value)),
  };
}

export function errorEvent(
  error: unknown,
  context: ErrorContext,
  options: { eventId: string; now: Date; environment: string; release?: string },
): ErrorEvent {
  // The error and up to two causes, the original cause first.
  const chain: Array<ReturnType<typeof asError>> = [];
  let current: unknown = error;
  while (current !== undefined && chain.length < 3) {
    const item = asError(current);
    chain.unshift(item);
    current = item.cause;
  }
  const tags: Record<string, string> = { runtime: context.runtime };
  if (context.tenant) tags.tenant = context.tenant;
  if (context.route) tags.route = context.route;
  if (context.queue) tags.queue = context.queue;
  for (const [key, value] of Object.entries(context.extra ?? {})) {
    if (value !== undefined && value !== null) tags[key] = scrub(String(value)).slice(0, 200);
  }
  const path = context.path ? scrub(context.path.split(/[?#]/)[0]!) : null;
  return {
    event_id: options.eventId,
    timestamp: options.now.getTime() / 1000,
    platform: "node",
    level: "error",
    logger: "enaibler",
    environment: options.environment,
    ...(options.release ? { release: options.release } : {}),
    exception: {
      values: chain.map((item) => {
        const frames = parseStack(item.stack);
        return {
          type: item.name || "Error",
          value: scrub(item.message).slice(0, 1000),
          ...(frames.length ? { stacktrace: { frames } } : {}),
        };
      }),
    },
    tags,
    ...(path
      ? { request: { ...(context.method ? { method: context.method } : {}), url: path } }
      : {}),
  };
}

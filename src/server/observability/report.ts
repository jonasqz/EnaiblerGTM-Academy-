import { randomUUID } from "node:crypto";

import { errorEvent, parseDsn, type ErrorContext } from "@/core/observability/error-event";
import { log } from "@/server/observability/log";

/*
 * Errors go to the log and, with ERROR_REPORTING_DSN set, to GlitchTip
 * (brief §11). The DSN is the operator's own service, not a customer URL, so
 * plain fetch is fine here. Never throws; the same error is sent at most once
 * a minute, and at most 30 reports a minute per process.
 */

const lastSent = new Map<string, number>();
let windowStart = 0;
let sentInWindow = 0;

function environment(): string {
  return process.env.APP_ENV?.trim() || process.env.NODE_ENV || "development";
}

export async function reportError(error: unknown, context: ErrorContext): Promise<void> {
  const { extra, ...where } = context;
  log.error(error instanceof Error ? error.message : "Non-error thrown", {
    ...where,
    ...extra,
    error,
  });
  const dsn = parseDsn(process.env.ERROR_REPORTING_DSN);
  if (!dsn) return;

  const now = Date.now();
  const key = [
    context.runtime,
    context.route ?? context.queue ?? "",
    error instanceof Error ? `${error.name}:${error.message}` : String(error),
  ].join("|");
  if (now - (lastSent.get(key) ?? 0) < 60_000) return;
  if (lastSent.size > 500) lastSent.clear();
  lastSent.set(key, now);
  if (now - windowStart > 60_000) {
    windowStart = now;
    sentInWindow = 0;
  }
  if (++sentInWindow > 30) return;

  const event = errorEvent(error, context, {
    eventId: randomUUID().replace(/-/g, ""),
    now: new Date(now),
    environment: environment(),
    release: process.env.APP_RELEASE?.trim() || undefined,
  });
  try {
    await fetch(dsn.storeUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_client=enaibler/1.0, sentry_key=${dsn.publicKey}`,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (sendError) {
    log.warn("Error report not delivered", { error: sendError });
  }
}

import { scrub } from "@/core/observability/error-event";

/*
 * Structured logs (brief §11): one JSON object per line in production, so
 * Coolify's log view and any log shipper can filter by field; plain lines in
 * development. LOG_FORMAT=json|text overrides. Read by name: the worker and
 * scripts use this too.
 */

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: scrub(value.message), stack: value.stack };
  }
  return value;
}

function write(level: Level, message: string, fields: Fields = {}): void {
  const format = process.env.LOG_FORMAT?.trim();
  const json = format ? format === "json" : process.env.NODE_ENV === "production";
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  const clean = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, serialize(value)]),
  );
  if (json) {
    out(JSON.stringify({ time: new Date().toISOString(), level, msg: message, ...clean }));
  } else {
    const rest = Object.keys(clean).length > 0 ? ` ${JSON.stringify(clean)}` : "";
    out(`[${level}] ${message}${rest}`);
  }
}

export const log = {
  info: (message: string, fields?: Fields) => write("info", message, fields),
  warn: (message: string, fields?: Fields) => write("warn", message, fields),
  error: (message: string, fields?: Fields) => write("error", message, fields),
};

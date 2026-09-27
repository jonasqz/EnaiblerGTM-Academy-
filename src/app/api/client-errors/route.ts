import { z } from "zod";

import { rateLimit } from "@/server/rate-limit";
import { reportError } from "@/server/observability/report";

const reportSchema = z.strictObject({
  name: z.string().max(100).optional(),
  message: z.string().max(1000),
  stack: z.string().max(8000).optional(),
  path: z.string().max(300).optional(),
});

/**
 * Errors that happened only in a browser (see components/ui/error-view.tsx).
 * Anyone can post here, so the reports are small, capped per server, and
 * dropped unless error reporting is set up.
 */
export async function POST(request: Request): Promise<Response> {
  if (!process.env.ERROR_REPORTING_DSN?.trim() || !rateLimit("client-errors", 60, 60_000)) {
    return new Response(null, { status: 204 });
  }
  const body = await request.text();
  if (body.length > 12_000) return new Response(null, { status: 413 });
  let parsed: z.infer<typeof reportSchema>;
  try {
    parsed = reportSchema.parse(JSON.parse(body));
  } catch {
    return new Response(null, { status: 400 });
  }
  const error = new Error(parsed.message);
  error.name = parsed.name || "Error";
  error.stack = parsed.stack;
  await reportError(error, {
    runtime: "web",
    path: parsed.path,
    extra: { kind: "client", host: request.headers.get("host") },
  });
  return new Response(null, { status: 204 });
}

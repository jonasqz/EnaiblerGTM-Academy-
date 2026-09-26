import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";

/** Liveness + database check for Uptime Kuma / Coolify health checks. */
export async function GET(): Promise<Response> {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}

export const dynamic = "force-dynamic";

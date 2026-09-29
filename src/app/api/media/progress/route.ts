import { can } from "@/core/access/roles";
import { progressReportSchema, type ProgressReport } from "@/core/media/ranges";
import { getDb } from "@/db/client";
import { getSession } from "@/server/access";
import { recordProgress } from "@/server/media/progress";
import { rateLimit } from "@/server/rate-limit";

const HOUR = 60 * 60_000;

const answer = (status: number, body?: Record<string, unknown>) =>
  body
    ? Response.json(body, { status, headers: { "cache-control": "no-store" } })
    : new Response(null, { status, headers: { "cache-control": "no-store" } });

/** Beacons carry the page's origin: reports from other sites are not ours to count. */
function fromThisSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

/**
 * What the player played (webinar brief §2.4, watch tracking): posted every
 * few seconds of new watching and, with sendBeacon, when the page goes away.
 * Only signed-in viewers of this academy are tracked; anonymous viewers get
 * a 204 and leave nothing behind.
 */
export async function POST(request: Request): Promise<Response> {
  if (!fromThisSite(request)) return answer(403);
  const session = await getSession();
  if (!session) return answer(204);
  const { tenant, viewer, roles } = session;
  // A player reports about every 15 seconds; this leaves room for a few tabs.
  if (!rateLimit(`media-progress:${tenant.id}:${viewer.userId}`, 1_200, HOUR)) return answer(429);

  const text = await request.text();
  if (text.length > 64_000) return answer(413);
  let report: ProgressReport;
  try {
    report = progressReportSchema.parse(JSON.parse(text));
  } catch {
    return answer(400);
  }
  const recorded = await recordProgress(
    getDb(),
    tenant,
    { userId: viewer.userId, member: roles.length > 0, canEditCourses: can(roles, "courses.edit") },
    report,
  );
  return recorded
    ? answer(200, { percent: recorded.percent, watched: recorded.watched })
    : answer(404);
}

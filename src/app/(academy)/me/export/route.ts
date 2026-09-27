import { getDb } from "@/db/client";
import { getSession } from "@/server/access";
import { exportMyData } from "@/server/profile";

/** Data export (brief §9): everything this academy stores about the learner. */
export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Not found", { status: 404 });
  const data = await exportMyData(getDb(), session.tenant, session.viewer.userId);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${session.tenant.slug}-my-data.json"`,
      "cache-control": "private, no-store",
    },
  });
}

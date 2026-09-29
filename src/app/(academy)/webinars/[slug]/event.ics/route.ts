import { getDb } from "@/db/client";
import { getTenant, getTranslator } from "@/server/request";
import { webinarCalendar } from "@/server/webinars/mail";
import { loadWebinarPage } from "@/server/webinars/public";

/**
 * "Add to calendar": the webinar as a calendar file anyone may have (no
 * join link, nobody's address). It shares the UID of the invitations, so
 * an update by mail replaces this entry rather than adding a second one.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/webinars/[slug]/event.ics">,
): Promise<Response> {
  const { slug } = await context.params;
  const tenant = await getTenant();
  const page = await loadWebinarPage(getDb(), tenant.id, slug, { drafts: false });
  if (!page || page.webinar.status !== "published") {
    return new Response("Not found", { status: 404 });
  }
  const ics = webinarCalendar(tenant, page.webinar, await getTranslator(), { method: "PUBLISH" });
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${page.webinar.slug}.ics"`,
      "cache-control": "no-store",
    },
  });
}

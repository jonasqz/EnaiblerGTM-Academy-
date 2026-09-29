import { reliveState } from "@/core/webinars/relive";
import { getDb } from "@/db/client";
import { getTenant, getTranslator } from "@/server/request";
import { renderWebinarImage } from "@/server/webinars/image";
import { loadWebinarPage } from "@/server/webinars/public";

/** The link preview of a published webinar's page (og:image). */
export async function GET(
  _request: Request,
  context: RouteContext<"/webinars/[slug]/image">,
): Promise<Response> {
  const { slug } = await context.params;
  const tenant = await getTenant();
  const page = await loadWebinarPage(getDb(), tenant.id, slug, { drafts: false });
  if (!page) return new Response("Not found", { status: 404 });
  const png = await renderWebinarImage(
    getDb(),
    tenant,
    page.webinar,
    await getTranslator(),
    reliveState(page.webinar, page.recording, new Date()),
  );
  return new Response(png, {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=300" },
  });
}

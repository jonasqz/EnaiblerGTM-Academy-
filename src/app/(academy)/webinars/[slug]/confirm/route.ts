import { NextResponse, type NextRequest } from "next/server";

import { tenantTranslator } from "@/core/i18n/tenant-translator";
import { getDb } from "@/db/client";
import { getViewer } from "@/server/auth";
import { startNewsOptIn } from "@/server/consent";
import { getOrigin, getTenant } from "@/server/request";
import { confirmRegistration } from "@/server/webinars/registration";
import { joinSeriesAfterSeat } from "@/server/webinars/series";

/**
 * Where a webinar form's magic link lands, after /auth/continue signed the
 * person in and made them a learner: the proven address confirms the
 * registration. The news they ticked starts its own double opt-in now, with
 * the wording they read.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext<"/webinars/[slug]/confirm">,
): Promise<NextResponse> {
  const { slug } = await context.params;
  const tenant = await getTenant();
  const origin = await getOrigin();
  const back = (query: string) =>
    NextResponse.redirect(
      new URL(`/webinars/${encodeURIComponent(slug)}?${query}#register`, origin),
      303,
    );
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const viewer = await getViewer(tenant);
  if (!viewer || !/^[A-Za-z0-9_-]{16,128}$/.test(token)) return back("confirm=invalid");

  // A session of a series enrolls in the whole series (server/webinars/series).
  const result = await confirmRegistration(
    getDb(),
    tenant,
    { slug, token, userId: viewer.userId, email: viewer.email },
    { afterSeat: joinSeriesAfterSeat(tenant) },
  );
  if (!result.ok) return back(result.error === "closed" ? "confirm=closed" : "confirm=invalid");
  if (result.marketing && !result.already) {
    await startNewsOptIn(getDb(), tenant, viewer, tenantTranslator(tenant, result.locale));
  }
  return back(`confirmed=${result.status}`);
}

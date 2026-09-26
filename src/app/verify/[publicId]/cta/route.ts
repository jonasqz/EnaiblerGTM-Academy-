import { NextResponse } from "next/server";

import { isBot } from "@/core/shared/bots";
import { buildVerificationCtaUrl } from "@/core/tenant/manifest";
import { getDb } from "@/db/client";
import { withTenant } from "@/db/tenant-scope";
import { loadCredential } from "@/server/credentials";
import { trackEvent } from "@/server/events";
import { getLocale, getOrigin, getTenant } from "@/server/request";

/** Tracks the verification page's call to action, then sends the visitor on. */
export async function GET(
  request: Request,
  context: RouteContext<"/verify/[publicId]/cta">,
): Promise<NextResponse> {
  const { publicId } = await context.params;
  const tenant = await getTenant();
  const origin = await getOrigin();
  const credential = await loadCredential(tenant, publicId);
  if (!credential || credential.visibility !== "public")
    return NextResponse.redirect(new URL("/", origin), 303);

  if (!isBot(request.headers.get("user-agent"))) {
    const locale = await getLocale();
    await withTenant(getDb(), tenant.id, (tx) =>
      trackEvent(tx, {
        tenantId: tenant.id,
        name: "verification_cta_clicked",
        courseId: credential.courseId,
        pathId: credential.path?.id,
        locale,
      }),
    );
  }

  const target = buildVerificationCtaUrl(tenant.settings.verification_cta, {
    academyOrigin: origin,
    courseSlug: credential.courseSlug,
    pathSlug: credential.path?.slug,
    publicId: credential.publicId,
  });
  return NextResponse.redirect(target, 303);
}

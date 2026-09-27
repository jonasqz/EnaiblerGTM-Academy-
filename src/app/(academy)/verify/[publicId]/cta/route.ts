import { NextResponse } from "next/server";

import { shareChannelOf } from "@/core/credentials/share";
import { isBot } from "@/core/shared/bots";
import { buildVerificationCtaUrl } from "@/core/tenant/manifest";
import { getDb } from "@/db/client";
import { loadCredential } from "@/server/credentials";
import { recordLandingEvent } from "@/server/credentials/landing";
import { getLocale, getOrigin, getTenant } from "@/server/request";

/**
 * Tracks the verification page's call to action, then sends the visitor on,
 * tagged with the credential and the LinkedIn channel that brought them.
 */
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

  const via = shareChannelOf(new URL(request.url).searchParams.get("via"));
  if (!isBot(request.headers.get("user-agent"))) {
    await recordLandingEvent(getDb(), tenant.id, "verification_cta_clicked", credential, {
      locale: await getLocale(),
      via,
    });
  }

  const target = buildVerificationCtaUrl(tenant.settings.verification_cta, {
    academyOrigin: origin,
    courseSlug: credential.courseSlug,
    pathSlug: credential.path?.slug,
    publicId: credential.publicId,
    via,
  });
  return NextResponse.redirect(target, 303);
}

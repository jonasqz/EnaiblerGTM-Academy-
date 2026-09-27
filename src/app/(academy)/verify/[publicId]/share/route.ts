import { NextResponse, type NextRequest } from "next/server";

import { linkedInTarget, shareChannelOf } from "@/core/credentials/share";
import { getDb } from "@/db/client";
import { withTenant } from "@/db/tenant-scope";
import { getViewer } from "@/server/auth";
import { credentialCopy } from "@/server/credential-copy";
import { loadCredential } from "@/server/credentials";
import { trackEvent } from "@/server/events";
import { getOrigin, getTenant, getTranslator } from "@/server/request";

/** Owner-only: records the share, then opens LinkedIn (post or "Add to profile"). */
export async function GET(
  request: NextRequest,
  context: RouteContext<"/verify/[publicId]/share">,
): Promise<NextResponse> {
  const { publicId } = await context.params;
  const tenant = await getTenant();
  const origin = await getOrigin();
  const viewer = await getViewer(tenant);
  const credential = await loadCredential(tenant, publicId);
  if (
    !credential ||
    !viewer ||
    credential.userId !== viewer.userId ||
    credential.visibility !== "public"
  ) {
    return NextResponse.redirect(new URL(`/verify/${publicId}`, origin), 303);
  }

  const t = await getTranslator();
  const copy = credentialCopy(tenant, credential, t, origin);
  const target = shareChannelOf(request.nextUrl.searchParams.get("to")) ?? "post";

  await withTenant(getDb(), tenant.id, (tx) =>
    trackEvent(tx, {
      tenantId: tenant.id,
      name: "credential_shared_linkedin",
      userId: viewer.userId,
      courseId: credential.courseId,
      pathId: credential.path?.id,
      locale: t.locale,
      props: { target },
    }),
  );

  const url = linkedInTarget(target, {
    verificationUrl: copy.verificationUrl,
    name: copy.linkedInName,
    academy: copy.academy,
    organizationId: tenant.settings.linkedin_organization_id,
    issuedAt: credential.issuedAt,
    credentialId: copy.credentialId,
  });
  return NextResponse.redirect(url, 303);
}

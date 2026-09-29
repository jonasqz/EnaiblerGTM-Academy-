import { NextResponse, type NextRequest } from "next/server";

import { withContext } from "@/components/entry-links";
import { NEWS_PARAM, newsOptInLocale } from "@/core/consent/marketing";
import { decodeEntryContext, entryDestination, safeNextPath } from "@/core/entry/context";
import { tenantTranslator } from "@/core/i18n/tenant-translator";
import { getDb } from "@/db/client";
import { withTenant } from "@/db/tenant-scope";
import { getViewer } from "@/server/auth";
import { startNewsOptIn } from "@/server/consent";
import { ensureLearner } from "@/server/learners";
import { getLocale, getOrigin, getTenant } from "@/server/request";
import { enrollLearner } from "@/server/webinars/series";

/**
 * Landing point after the magic link (and the "Start" button): makes the user
 * a learner of this academy, enrolls them in the course they came for and
 * stores the entry context (path, lang, utm_*) on the enrollment. If they
 * ticked the news box when asking for the link, the double opt-in starts now
 * that the address is proven; nothing is subscribed before they confirm.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const tenant = await getTenant();
  const origin = await getOrigin();
  const entry = decodeEntryContext(request.nextUrl.searchParams.get("ctx")) ?? {};
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));

  const viewer = await getViewer(tenant);
  if (!viewer) {
    const signIn = withContext("/sign-in", entry);
    const target = next
      ? `${signIn}${signIn.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}`
      : signIn;
    return NextResponse.redirect(new URL(target, origin), 303);
  }

  const locale = await getLocale();
  const enrolled = await withTenant(getDb(), tenant.id, async (tx) => {
    await ensureLearner(tx, tenant, viewer.userId, { locale, entry });
    if (!entry.course) return null;
    // A series registers its sessions with the enrollment (server/webinars/series).
    return enrollLearner(tx, tenant, viewer.userId, { courseSlug: entry.course, locale, entry });
  });

  const news = newsOptInLocale(
    request.nextUrl.searchParams.get(NEWS_PARAM),
    tenant.settings.locales,
  );
  // Subscribed learners are not asked again; a failed mail is reported and
  // never holds up the sign-in (they can ask again in My learning).
  if (news) await startNewsOptIn(getDb(), tenant, viewer, tenantTranslator(tenant, news));

  // A course that is not (or no longer) published: fall back to the path or home.
  const destination = next ?? entryDestination(enrolled ? entry : { ...entry, course: undefined });
  return NextResponse.redirect(new URL(destination, origin), 303);
}

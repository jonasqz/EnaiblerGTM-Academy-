import { NextResponse, type NextRequest } from "next/server";

import { withContext } from "@/components/entry-links";
import { decodeEntryContext, entryDestination } from "@/core/entry/context";
import { getDb } from "@/db/client";
import { withTenant } from "@/db/tenant-scope";
import { getViewer } from "@/server/auth";
import { ensureEnrollment, ensureLearner } from "@/server/learners";
import { getLocale, getOrigin, getTenant } from "@/server/request";

/**
 * Landing point after the magic link (and the "Start" button): makes the user
 * a learner of this academy, enrolls them in the course they came for and
 * stores the entry context (path, lang, utm_*) on the enrollment.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const tenant = await getTenant();
  const origin = await getOrigin();
  const entry = decodeEntryContext(request.nextUrl.searchParams.get("ctx")) ?? {};

  const viewer = await getViewer(tenant);
  if (!viewer) return NextResponse.redirect(new URL(withContext("/sign-in", entry), origin), 303);

  const locale = await getLocale();
  const enrolled = await withTenant(getDb(), tenant.id, async (tx) => {
    await ensureLearner(tx, tenant, viewer.userId, { locale, entry });
    if (!entry.course) return null;
    return ensureEnrollment(tx, tenant, viewer.userId, { courseSlug: entry.course, locale, entry });
  });

  // A course that is not (or no longer) published: fall back to the path or home.
  const destination = entryDestination(enrolled ? entry : { ...entry, course: undefined });
  return NextResponse.redirect(new URL(destination, origin), 303);
}

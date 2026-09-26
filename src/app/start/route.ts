import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { continueUrl, withContext } from "@/components/entry-links";
import { entryDestination, parseEntryParams } from "@/core/entry/context";
import { getDb } from "@/db/client";
import { courses, paths } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { getViewer } from "@/server/auth";
import { getOrigin, getTenant } from "@/server/request";

/**
 * Deep-link entry from the tenant's website (brief §5):
 *   /start?path=<slug>&course=<slug>&lang=<de|en>&utm_*
 * Never fails: unknown values are dropped. The context rides along in the
 * URL through sign-up; nothing is stored in the browser (the proxy stores
 * `lang` as the language preference).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const tenant = await getTenant();
  const origin = await getOrigin();
  const entry = parseEntryParams(request.nextUrl.searchParams, {
    tenantLocales: tenant.settings.locales,
  });

  const known = await withTenant(getDb(), tenant.id, async (tx) => ({
    course: entry.course
      ? (
          await tx
            .select({ id: courses.id })
            .from(courses)
            .where(and(eq(courses.slug, entry.course), eq(courses.status, "published")))
        ).length > 0
      : false,
    path:
      entry.path && tenant.settings.features.paths
        ? (await tx.select({ id: paths.id }).from(paths).where(eq(paths.slug, entry.path))).length >
          0
        : false,
  }));
  if (!known.course) delete entry.course;
  if (!known.path) delete entry.path;

  const viewer = await getViewer(tenant);
  const target =
    viewer && entry.course ? continueUrl(entry) : withContext(entryDestination(entry), entry);
  return NextResponse.redirect(new URL(target, origin), 303);
}

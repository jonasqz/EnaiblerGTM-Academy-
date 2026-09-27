import { and, eq } from "drizzle-orm";

import { requiresWork, type CompletionMode } from "@/core/courses/completion";
import type { ShareChannel } from "@/core/credentials/share";
import type { LocalizedText } from "@/core/i18n/locales";
import type { Database } from "@/db/client";
import { assignments, courses } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import type { CredentialView } from "@/server/credentials";
import { trackEvent } from "@/server/events";

/*
 * A public credential's page doubles as the academy's landing page (brief
 * §2 step 8): visitors see the course behind it and the academy's call to
 * action. Views and clicks carry the LinkedIn channel the link was shared on
 * (`via`), so the academy sees which one brings new learners.
 */

export interface LandingCourse {
  summary: LocalizedText | null;
  estMinutes: number | null;
  completionMode: CompletionMode;
  /** What learners build; null when the course ends with its test alone. */
  artifactName: LocalizedText | null;
  free: boolean;
}

/** The course as visitors could take it now; null once it is no longer published. */
export async function loadLandingCourse(
  db: Database,
  tenantId: string,
  courseId: string,
): Promise<LandingCourse | null> {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ course: courses, artifactName: assignments.artifactName })
      .from(courses)
      .leftJoin(assignments, eq(assignments.courseId, courses.id))
      .where(and(eq(courses.id, courseId), eq(courses.status, "published"))),
  );
  if (!row) return null;
  const { course } = row;
  return {
    summary: course.summary ?? null,
    estMinutes: course.estMinutes,
    completionMode: course.completionMode,
    artifactName: requiresWork(course.completionMode) ? row.artifactName : null,
    free: course.deliveryMode === "free_async",
  };
}

/** A visitor's view of the page, or their click on its call to action (never the owner's). */
export async function recordLandingEvent(
  db: Database,
  tenantId: string,
  name: "verification_page_viewed" | "verification_cta_clicked",
  credential: Pick<CredentialView, "courseId" | "path">,
  context: { locale: string; via: ShareChannel | null },
): Promise<void> {
  await withTenant(db, tenantId, (tx) =>
    trackEvent(tx, {
      tenantId,
      name,
      courseId: credential.courseId,
      pathId: credential.path?.id,
      locale: context.locale,
      props: context.via ? { via: context.via } : undefined,
    }),
  );
}

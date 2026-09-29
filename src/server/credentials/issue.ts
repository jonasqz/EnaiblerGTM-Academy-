import { and, eq, isNull } from "drizzle-orm";

import { requiresWork, type CompletionMode } from "@/core/courses/completion";
import { evidenceFor } from "@/core/credentials/evidence";
import { generatePublicId } from "@/core/credentials/public-id";
import { localizedEntries, type Locale } from "@/core/i18n/locales";
import { computeLevel, detectLevelUp, type LevelDefinition } from "@/core/levels/rules";
import type { TenantContext } from "@/core/tenant/context";
import type { Transaction } from "@/db/client";
import {
  assignments,
  courses,
  credentials,
  enrollments,
  learnerProfiles,
  levelGrants,
  levelSchemes,
  pathCourses,
} from "@/db/schema";
import { trackEvent } from "@/server/events";

/**
 * Issues (or re-activates) the learner's credential for a course once every
 * required part is passed (server/courses/completion): private by default,
 * name as the learner entered it, course, artifact, level and how it was
 * earned as snapshots. Records course completion and level-ups.
 */
export async function issueCredential(
  tx: Transaction,
  tenant: TenantContext,
  input: {
    userId: string;
    courseId: string;
    basis: CompletionMode;
    /** Sessions the learner took part in, live or as a re-live, when the course asks for them. */
    sessions?: ReadonlyArray<"attendance" | "relive">;
    submissionId: string | null;
    testAttemptId: string | null;
  },
): Promise<{ publicId: string; levelUp: LevelDefinition | null }> {
  const work = requiresWork(input.basis);
  const [course] = await tx.select().from(courses).where(eq(courses.id, input.courseId));
  const [assignment] = work
    ? await tx.select().from(assignments).where(eq(assignments.courseId, input.courseId))
    : [];
  const [enrollment] = await tx
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.courseId, input.courseId), eq(enrollments.userId, input.userId)));
  const [profile] = await tx
    .select()
    .from(learnerProfiles)
    .where(eq(learnerProfiles.userId, input.userId));
  if (!course || (work && !assignment)) throw new Error("Course or assignment missing");

  const locale = (enrollment?.locale ?? tenant.settings.default_locale) as Locale;
  const pathId = enrollment?.pathId ?? profile?.currentPathId ?? null;

  // Level before and after this course, within the learner's path.
  let levelUp: LevelDefinition | null = null;
  let levelAtIssue: LevelDefinition | null = null;
  if (tenant.settings.features.levels && pathId) {
    const [scheme] = await tx.select().from(levelSchemes);
    if (scheme) {
      const pathCourseIds = (
        await tx
          .select({ courseId: pathCourses.courseId })
          .from(pathCourses)
          .where(eq(pathCourses.pathId, pathId))
      ).map((row) => row.courseId);
      const completedBefore = (
        await tx
          .select({ courseId: credentials.courseId })
          .from(credentials)
          .where(and(eq(credentials.userId, input.userId), isNull(credentials.revokedAt)))
      )
        .map((row) => row.courseId)
        .filter((id) => id !== input.courseId);
      const grantedLevels = (
        await tx
          .select({ n: levelGrants.levelN })
          .from(levelGrants)
          .where(and(eq(levelGrants.userId, input.userId), eq(levelGrants.pathId, pathId)))
      ).map((row) => row.n);
      const before = { pathCourseIds, completedCourseIds: completedBefore, grantedLevels };
      const after = { ...before, completedCourseIds: [...completedBefore, input.courseId] };
      levelUp = detectLevelUp(scheme.levels, before, after);
      levelAtIssue = computeLevel(scheme.levels, after);
    }
  }

  const values = {
    pathId,
    levelAtIssue: levelAtIssue?.n ?? null,
    levelName: levelAtIssue?.name ?? null,
    courseTitle: course.title,
    basis: input.basis,
    evidence: evidenceFor(input.basis, input.sessions ?? []),
    // Every language the course has, like the title: each reader sees their own.
    artifactName:
      assignment && localizedEntries(assignment.artifactName).length > 0
        ? assignment.artifactName
        : null,
    displayName: profile?.displayName ?? "",
    submissionId: input.submissionId,
    testAttemptId: input.testAttemptId,
    issuedAt: new Date(),
    revokedAt: null,
    revokeReason: null,
  };
  const [row] = await tx
    .insert(credentials)
    .values({
      tenantId: tenant.id,
      publicId: generatePublicId(),
      userId: input.userId,
      courseId: input.courseId,
      ...values,
    })
    .onConflictDoUpdate({
      target: [credentials.tenantId, credentials.userId, credentials.courseId],
      set: values,
    })
    .returning({ publicId: credentials.publicId });

  if (enrollment && !enrollment.completedAt) {
    await tx
      .update(enrollments)
      .set({ completedAt: new Date() })
      .where(eq(enrollments.id, enrollment.id));
    await trackEvent(tx, {
      tenantId: tenant.id,
      name: "course_completed",
      userId: input.userId,
      courseId: input.courseId,
      pathId,
      locale,
      entry: enrollment.entryContext,
    });
  }
  if (levelUp) {
    await trackEvent(tx, {
      tenantId: tenant.id,
      name: "level_up",
      userId: input.userId,
      courseId: input.courseId,
      pathId,
      locale,
      entry: enrollment?.entryContext,
      props: { level: levelUp.n },
    });
  }
  return { publicId: row!.publicId, levelUp };
}

/** A human reversed a pass: the credential stops verifying (it looks deleted). */
export async function revokeCredential(
  tx: Transaction,
  input: { userId: string; courseId: string; reason: string },
): Promise<void> {
  await tx
    .update(credentials)
    .set({ revokedAt: new Date(), revokeReason: input.reason })
    .where(
      and(
        eq(credentials.userId, input.userId),
        eq(credentials.courseId, input.courseId),
        isNull(credentials.revokedAt),
      ),
    );
  await tx
    .update(enrollments)
    .set({ completedAt: null })
    .where(and(eq(enrollments.userId, input.userId), eq(enrollments.courseId, input.courseId)));
}

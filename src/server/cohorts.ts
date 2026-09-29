import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { teamEmail } from "@/core/access/team";
import { generatePublicId } from "@/core/credentials/public-id";
import type { EntryContext } from "@/core/entry/context";
import type { Locale } from "@/core/i18n/locales";
import type { TenantContext } from "@/core/tenant/context";
import type { Database, Transaction } from "@/db/client";
import {
  assignments,
  cohortMembers,
  cohorts,
  courses,
  memberships,
  submissions,
  user,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { ensureLearner } from "@/server/learners";
import { accountForTeam } from "@/server/team";
import { enrollLearner } from "@/server/webinars/series";

/*
 * Cohorts (brief §4, phase 2): a group taking a course together, joined by
 * link, with dates and mentors. Mentors are memberships (role "mentor")
 * scoped to one cohort; they review that cohort's work (see
 * core/access/roles.ts, reviewsLimitedToCohorts).
 */

export type CohortRow = typeof cohorts.$inferSelect;

export interface CohortInput {
  name: string;
  startsOn: string | null;
  endsOn: string | null;
}

/** Work of learners in a cohort the mentor mentors, for the submission's own course. */
export function mentorScope(mentorId: string) {
  return sql`exists (
    select 1 from ${cohortMembers} cm
    join ${cohorts} c on c.id = cm.cohort_id
    join ${memberships} m on m.cohort_id = c.id and m.role = 'mentor'
    where m.user_id = ${mentorId}
      and cm.user_id = ${submissions.userId}
      and c.course_id = ${assignments.courseId}
  )`;
}

/** Whether a mentor may see and decide this submission. */
export async function mentorMaySee(
  tx: Transaction,
  mentorId: string,
  submissionId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: submissions.id })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .where(and(eq(submissions.id, submissionId), mentorScope(mentorId)));
  return Boolean(row);
}

export async function listCohorts(db: Database, tenantId: string, mentorId?: string) {
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .select({ cohort: cohorts, courseTitle: courses.title, courseSlug: courses.slug })
      .from(cohorts)
      .innerJoin(courses, eq(courses.id, cohorts.courseId))
      .where(
        mentorId
          ? sql`exists (select 1 from ${memberships} m where m.cohort_id = ${cohorts.id} and m.role = 'mentor' and m.user_id = ${mentorId})`
          : undefined,
      )
      .orderBy(sql`${cohorts.startsOn} desc nulls last`, asc(cohorts.createdAt));
    const counts = await tx
      .select({ cohortId: cohortMembers.cohortId, n: sql<number>`count(*)::int` })
      .from(cohortMembers)
      .groupBy(cohortMembers.cohortId);
    const mentors = await tx
      .select({ cohortId: memberships.cohortId, n: sql<number>`count(*)::int` })
      .from(memberships)
      .where(eq(memberships.role, "mentor"))
      .groupBy(memberships.cohortId);
    return rows.map((row) => ({
      ...row,
      learners: counts.find((count) => count.cohortId === row.cohort.id)?.n ?? 0,
      mentors: mentors.find((count) => count.cohortId === row.cohort.id)?.n ?? 0,
    }));
  });
}

export async function createCohort(
  db: Database,
  tenantId: string,
  input: CohortInput & { courseId: string; createdBy: string },
): Promise<string | null> {
  return withTenant(db, tenantId, async (tx) => {
    const [course] = await tx
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.id, input.courseId));
    if (!course) return null;
    const [row] = await tx
      .insert(cohorts)
      .values({
        tenantId,
        courseId: course.id,
        name: input.name,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        joinCode: generatePublicId().slice(0, 12).toLowerCase(),
        createdBy: input.createdBy,
      })
      .returning({ id: cohorts.id });
    return row!.id;
  });
}

export async function updateCohort(
  db: Database,
  tenantId: string,
  cohortId: string,
  input: CohortInput & { status: "open" | "closed" },
): Promise<void> {
  await withTenant(db, tenantId, (tx) =>
    tx
      .update(cohorts)
      .set({
        name: input.name,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        status: input.status,
      })
      .where(eq(cohorts.id, cohortId)),
  );
}

/** Learners stay enrolled in the course; only the grouping and its mentors go. */
export async function deleteCohort(db: Database, tenantId: string, cohortId: string) {
  await withTenant(db, tenantId, (tx) => tx.delete(cohorts).where(eq(cohorts.id, cohortId)));
}

export async function loadCohort(db: Database, tenantId: string, cohortId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(cohortId)) return null;
  return withTenant(db, tenantId, async (tx) => {
    const [row] = await tx
      .select({ cohort: cohorts, course: courses })
      .from(cohorts)
      .innerJoin(courses, eq(courses.id, cohorts.courseId))
      .where(eq(cohorts.id, cohortId));
    if (!row) return null;
    const members = await tx
      .select({ userId: cohortMembers.userId, joinedAt: cohortMembers.joinedAt })
      .from(cohortMembers)
      .where(eq(cohortMembers.cohortId, cohortId))
      .orderBy(asc(cohortMembers.joinedAt));
    // Mentors are team members: the people managing cohorts see their addresses.
    const mentors = await tx
      .select({ userId: memberships.userId, email: user.email })
      .from(memberships)
      .innerJoin(user, eq(user.id, memberships.userId))
      .where(and(eq(memberships.cohortId, cohortId), eq(memberships.role, "mentor")))
      .orderBy(asc(user.email));
    return { ...row, members, mentors };
  });
}

export type AddMentorResult =
  { ok: true; invited: boolean } | { ok: false; error: "email" | "not_found" | "limit" };

/**
 * Adds a mentor by e-mail; they sign in with it like everyone else. Someone
 * new to the team gets the invitation the Team page sends, in `locale`.
 */
export async function addMentor(
  db: Database,
  tenantId: string,
  cohortId: string,
  email: string,
  locale: Locale,
): Promise<AddMentorResult> {
  const address = teamEmail(email);
  if (!address) return { ok: false, error: "email" };
  if (!/^[0-9a-f-]{36}$/i.test(cohortId)) return { ok: false, error: "not_found" };
  return withTenant(db, tenantId, async (tx) => {
    const [cohort] = await tx
      .select({ id: cohorts.id })
      .from(cohorts)
      .where(eq(cohorts.id, cohortId));
    if (!cohort) return { ok: false, error: "not_found" };
    const joining = await accountForTeam(tx, tenantId, address, locale);
    if (!joining) return { ok: false, error: "limit" };
    await tx
      .insert(memberships)
      .values({ tenantId, userId: joining.userId, role: "mentor", cohortId })
      .onConflictDoNothing();
    return { ok: true, invited: joining.invited };
  });
}

export async function removeMentor(
  db: Database,
  tenantId: string,
  cohortId: string,
  userId: string,
) {
  await withTenant(db, tenantId, (tx) =>
    tx
      .delete(memberships)
      .where(
        and(
          eq(memberships.cohortId, cohortId),
          eq(memberships.userId, userId),
          eq(memberships.role, "mentor"),
        ),
      ),
  );
}

export async function removeCohortMember(
  db: Database,
  tenantId: string,
  cohortId: string,
  userId: string,
) {
  await withTenant(db, tenantId, (tx) =>
    tx
      .delete(cohortMembers)
      .where(and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.userId, userId))),
  );
}

/** A cohort by its join code, with its course (for the join page). */
export async function cohortByCode(db: Database, tenantId: string, code: string) {
  if (!/^[0-9a-z]{6,16}$/.test(code)) return null;
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ cohort: cohorts, course: courses })
      .from(cohorts)
      .innerJoin(courses, eq(courses.id, cohorts.courseId))
      .where(eq(cohorts.joinCode, code)),
  );
  return row ?? null;
}

export type JoinResult =
  { ok: true; courseSlug: string } | { ok: false; error: "not_found" | "closed" | "unpublished" };

/** Joins by link: learner of the academy, enrolled in the course, member of the cohort. */
export async function joinCohort(
  db: Database,
  tenant: TenantContext,
  userId: string,
  input: { code: string; locale: Locale; entry: EntryContext },
): Promise<JoinResult> {
  const found = await cohortByCode(db, tenant.id, input.code);
  if (!found) return { ok: false, error: "not_found" };
  if (found.cohort.status !== "open") return { ok: false, error: "closed" };
  if (found.course.status !== "published") return { ok: false, error: "unpublished" };
  return withTenant(db, tenant.id, async (tx) => {
    const entry = { ...input.entry, course: found.course.slug };
    await ensureLearner(tx, tenant, userId, { locale: input.locale, entry });
    await enrollLearner(tx, tenant, userId, {
      courseSlug: found.course.slug,
      locale: input.locale,
      entry,
    });
    await tx
      .insert(cohortMembers)
      .values({ tenantId: tenant.id, cohortId: found.cohort.id, userId })
      .onConflictDoNothing();
    return { ok: true as const, courseSlug: found.course.slug };
  });
}

/** The learner's cohorts for a course (shown on the course page). */
export async function learnerCohorts(
  db: Database,
  tenantId: string,
  userId: string,
  courseIds: readonly string[],
) {
  if (courseIds.length === 0) return [];
  return withTenant(db, tenantId, (tx) =>
    tx
      .select({
        courseId: cohorts.courseId,
        name: cohorts.name,
        startsOn: cohorts.startsOn,
        endsOn: cohorts.endsOn,
      })
      .from(cohortMembers)
      .innerJoin(cohorts, eq(cohorts.id, cohortMembers.cohortId))
      .where(and(eq(cohortMembers.userId, userId), inArray(cohorts.courseId, [...courseIds]))),
  );
}

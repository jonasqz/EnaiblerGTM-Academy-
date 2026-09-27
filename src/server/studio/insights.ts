import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { courseProgress, type LessonProgressMap } from "@/core/courses/lessons";
import type { LocalizedText } from "@/core/i18n/locales";
import { learnerAlias } from "@/core/people/alias";
import { computeAgreement, type AgreementStats } from "@/core/review/policy";
import type { Database, Transaction } from "@/db/client";
import {
  assignments,
  consents,
  courses,
  credentials,
  enrollments,
  learnerProfiles,
  lessons,
  memberships,
  paths,
  reviews,
  submissions,
  user,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { loadFunnel, type FunnelStep } from "@/server/funnel";

/*
 * Who is learning what (Studio). Learners appear under a per-academy alias;
 * e-mail addresses only for learners who opted in to be contacted by the
 * academy (lead handoff, brief §9). Everything else stays aggregate.
 */

async function contactEmails(tx: Transaction, userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await tx
    .select({ userId: consents.userId, email: user.email })
    .from(consents)
    .innerJoin(user, eq(user.id, consents.userId))
    .where(
      and(
        inArray(consents.userId, userIds),
        eq(consents.kind, "lead_handoff"),
        isNotNull(consents.confirmedAt),
        isNull(consents.revokedAt),
      ),
    );
  return new Map(rows.map((row) => [row.userId, row.email]));
}

/** Authors, reviewers and admins who also signed in as learners are not counted or listed as learners. */
const notTeam = sql`not exists (select 1 from ${memberships} team where team.user_id = "memberships"."user_id" and team.role in ('author', 'reviewer', 'tenant_admin'))`;

export interface StudioOverview {
  learners: number;
  enrollments: number;
  completions: number;
  credentials: number;
  publicCredentials: number;
  pendingReviews: number;
  publishedCourses: number;
  draftCourses: number;
  funnel: FunnelStep[];
}

export async function studioOverview(
  db: Database,
  tenantId: string,
  days = 30,
): Promise<StudioOverview> {
  return withTenant(db, tenantId, async (tx) => {
    // One transaction = one connection: run the counts one after another.
    const n = sql<number>`count(*)::int`;
    const first = (rows: Array<{ n: number }>) => rows[0]?.n ?? 0;
    const learners = first(
      await tx
        .select({ n })
        .from(memberships)
        .where(and(eq(memberships.role, "learner"), notTeam)),
    );
    const enrolled = first(await tx.select({ n }).from(enrollments));
    const completions = first(
      await tx.select({ n }).from(enrollments).where(isNotNull(enrollments.completedAt)),
    );
    const active = first(
      await tx.select({ n }).from(credentials).where(isNull(credentials.revokedAt)),
    );
    const publicOnes = first(
      await tx
        .select({ n })
        .from(credentials)
        .where(and(isNull(credentials.revokedAt), eq(credentials.visibility, "public"))),
    );
    const pending = first(
      await tx
        .select({ n })
        .from(submissions)
        .where(inArray(submissions.status, ["submitted", "in_review"])),
    );
    const published = first(
      await tx.select({ n }).from(courses).where(eq(courses.status, "published")),
    );
    const drafts = first(await tx.select({ n }).from(courses).where(eq(courses.status, "draft")));
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      learners,
      enrollments: enrolled,
      completions,
      credentials: active,
      publicCredentials: publicOnes,
      pendingReviews: pending,
      publishedCourses: published,
      draftCourses: drafts,
      funnel: await loadFunnel(tx, { from, to }),
    };
  });
}

export interface PersonRow {
  userId: string;
  alias: string;
  displayName: string | null;
  joinedAt: Date;
  pathTitle: LocalizedText | null;
  started: number;
  completed: number;
  credentials: number;
  contactEmail: string | null;
}

export async function listPeople(db: Database, tenantId: string): Promise<PersonRow[]> {
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .select({
        userId: memberships.userId,
        joinedAt: memberships.createdAt,
        displayName: learnerProfiles.displayName,
        pathTitle: paths.title,
        started: sql<number>`(select count(*)::int from ${enrollments} e where e.user_id = "memberships"."user_id")`,
        completed: sql<number>`(select count(*)::int from ${enrollments} e where e.user_id = "memberships"."user_id" and e.completed_at is not null)`,
        credentials: sql<number>`(select count(*)::int from ${credentials} c where c.user_id = "memberships"."user_id" and c.revoked_at is null)`,
      })
      .from(memberships)
      .leftJoin(
        learnerProfiles,
        and(
          eq(learnerProfiles.userId, memberships.userId),
          eq(learnerProfiles.tenantId, memberships.tenantId),
        ),
      )
      .leftJoin(paths, eq(paths.id, learnerProfiles.currentPathId))
      .where(and(eq(memberships.role, "learner"), notTeam))
      .orderBy(desc(memberships.createdAt));
    const emails = await contactEmails(
      tx,
      rows.map((row) => row.userId),
    );
    return rows.map((row) => ({
      ...row,
      alias: learnerAlias(tenantId, row.userId),
      contactEmail: emails.get(row.userId) ?? null,
    }));
  });
}

export interface CourseLearnerRow {
  userId: string;
  alias: string;
  displayName: string | null;
  locale: string;
  startedAt: Date;
  completedAt: Date | null;
  progress: { done: number; total: number; percent: number };
  latestSubmission: { id: string; status: string; attemptNo: number; submittedAt: Date } | null;
  credential: { publicId: string; visibility: "private" | "public" } | null;
  contactEmail: string | null;
}

export async function courseLearners(
  db: Database,
  tenantId: string,
  courseId: string,
): Promise<CourseLearnerRow[]> {
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .select({
        userId: enrollments.userId,
        locale: enrollments.locale,
        startedAt: enrollments.startedAt,
        completedAt: enrollments.completedAt,
        progress: enrollments.lessonProgress,
        displayName: learnerProfiles.displayName,
      })
      .from(enrollments)
      .leftJoin(
        learnerProfiles,
        and(
          eq(learnerProfiles.userId, enrollments.userId),
          eq(learnerProfiles.tenantId, enrollments.tenantId),
        ),
      )
      .where(eq(enrollments.courseId, courseId))
      .orderBy(desc(enrollments.startedAt));

    const keysByLocale = new Map<string, string[]>();
    for (const lesson of await tx
      .select({ key: lessons.key, locale: lessons.locale })
      .from(lessons)
      .where(eq(lessons.courseId, courseId))
      .orderBy(asc(lessons.position))) {
      keysByLocale.set(lesson.locale, [...(keysByLocale.get(lesson.locale) ?? []), lesson.key]);
    }

    const latest = await tx
      .selectDistinctOn([submissions.userId], {
        userId: submissions.userId,
        id: submissions.id,
        status: submissions.status,
        attemptNo: submissions.attemptNo,
        submittedAt: submissions.submittedAt,
      })
      .from(submissions)
      .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
      .where(eq(assignments.courseId, courseId))
      .orderBy(submissions.userId, desc(submissions.attemptNo));
    const latestByUser = new Map(latest.map((row) => [row.userId, row]));

    const creds = await tx
      .select({
        userId: credentials.userId,
        publicId: credentials.publicId,
        visibility: credentials.visibility,
      })
      .from(credentials)
      .where(and(eq(credentials.courseId, courseId), isNull(credentials.revokedAt)));
    const credByUser = new Map(creds.map((row) => [row.userId, row]));
    const emails = await contactEmails(
      tx,
      rows.map((row) => row.userId),
    );

    return rows.map((row) => {
      const submission = latestByUser.get(row.userId);
      const credential = credByUser.get(row.userId);
      return {
        userId: row.userId,
        alias: learnerAlias(tenantId, row.userId),
        displayName: row.displayName,
        locale: row.locale,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        progress: courseProgress(
          keysByLocale.get(row.locale) ?? [],
          row.progress as LessonProgressMap,
        ),
        latestSubmission: submission
          ? {
              id: submission.id,
              status: submission.status,
              attemptNo: submission.attemptNo,
              submittedAt: submission.submittedAt,
            }
          : null,
        credential: credential
          ? { publicId: credential.publicId, visibility: credential.visibility }
          : null,
        contactEmail: emails.get(row.userId) ?? null,
      };
    });
  });
}

export interface CourseStats {
  enrolled: number;
  completed: number;
  submissions: number;
  pendingReviews: number;
  credentials: number;
  publicCredentials: number;
  aiReviews: number;
  /** AI verdicts a human also judged, and how often both agreed (brief §8 agreement rate). */
  agreement: AgreementStats | null;
  avgCostMicroUsd: number | null;
}

export async function courseStats(
  db: Database,
  tenantId: string,
  courseId: string,
): Promise<CourseStats> {
  return withTenant(db, tenantId, async (tx) => {
    const n = sql<number>`count(*)::int`;
    const first = (rows: Array<{ n: number }>) => rows[0]?.n ?? 0;
    const enrolled = first(
      await tx.select({ n }).from(enrollments).where(eq(enrollments.courseId, courseId)),
    );
    const completed = first(
      await tx
        .select({ n })
        .from(enrollments)
        .where(and(eq(enrollments.courseId, courseId), isNotNull(enrollments.completedAt))),
    );
    const subs = await tx
      .select({ id: submissions.id, status: submissions.status })
      .from(submissions)
      .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
      .where(eq(assignments.courseId, courseId));
    const creds = await tx
      .select({ visibility: credentials.visibility })
      .from(credentials)
      .where(and(eq(credentials.courseId, courseId), isNull(credentials.revokedAt)));
    const reviewRows = subs.length
      ? await tx
          .select({
            submissionId: reviews.submissionId,
            reviewerType: reviews.reviewerType,
            overall: reviews.overall,
            costMicroUsd: reviews.costMicroUsd,
          })
          .from(reviews)
          .where(
            inArray(
              reviews.submissionId,
              subs.map((row) => row.id),
            ),
          )
          .orderBy(desc(reviews.createdAt))
      : [];

    const ai = reviewRows.filter((row) => row.reviewerType === "ai");
    const costs = ai.flatMap((row) => (row.costMicroUsd === null ? [] : [row.costMicroUsd]));
    const pairs = subs.flatMap((submission) => {
      // Rows are newest first: compare the latest AI and the latest human verdict.
      const aiVerdict = ai.find((row) => row.submissionId === submission.id);
      const human = reviewRows.find(
        (row) => row.submissionId === submission.id && row.reviewerType === "human",
      );
      return aiVerdict && human
        ? [{ aiPass: aiVerdict.overall.pass, humanPass: human.overall.pass }]
        : [];
    });
    return {
      enrolled,
      completed,
      submissions: subs.length,
      pendingReviews: subs.filter((row) => row.status === "submitted" || row.status === "in_review")
        .length,
      credentials: creds.length,
      publicCredentials: creds.filter((row) => row.visibility === "public").length,
      aiReviews: ai.length,
      agreement: computeAgreement(pairs),
      avgCostMicroUsd: costs.length
        ? Math.round(costs.reduce((sum, cost) => sum + cost, 0) / costs.length)
        : null,
    };
  });
}

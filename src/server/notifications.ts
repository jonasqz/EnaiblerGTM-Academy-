import { and, asc, desc, eq, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";

import { localize } from "@/core/i18n/locales";
import { tenantTranslator } from "@/core/i18n/tenant-translator";
import {
  MAX_SEND_ATTEMPTS,
  REVIEW_MAIL_DELAY_SECONDS,
  retryDelaySeconds,
  reviewMailDecision,
} from "@/core/notifications/rules";
import { effectiveOutcome } from "@/core/review/outcome";
import type { TenantContext } from "@/core/tenant/context";
import type { Database, Transaction } from "@/db/client";
import {
  assignments,
  courses,
  credentials,
  enrollments,
  learnerProfiles,
  levelSchemes,
  notifications,
  paths,
  reviews,
  submissions,
  user,
  type LevelUpPayload,
  type ReviewReadyPayload,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { senderFor, type OutgoingEmail, type SendEmail } from "@/server/email/mailer";
import { renderNoticeEmail } from "@/server/email/templates/notice";
import { academyUrl } from "@/server/platform/config";

/*
 * Learner mail about their learning (brief §9, transactional): feedback is
 * ready, a level was reached. Queued in the transaction of the decision it
 * reports, so a rolled-back decision never mails; sent by the worker.
 */

export async function queueReviewReady(
  tx: Transaction,
  tenantId: string,
  input: { userId: string } & ReviewReadyPayload,
): Promise<void> {
  // A newer decision replaces a mail still waiting to report an older one.
  await tx
    .update(notifications)
    .set({ status: "skipped", note: "superseded", processedAt: new Date() })
    .where(
      and(
        eq(notifications.kind, "review_ready"),
        eq(notifications.status, "pending"),
        sql`${notifications.payload}->>'submissionId' = ${input.submissionId}`,
      ),
    );
  await tx.insert(notifications).values({
    tenantId,
    userId: input.userId,
    kind: "review_ready",
    payload: {
      submissionId: input.submissionId,
      levelUp: input.levelUp,
      secondLook: input.secondLook,
      testPending: input.testPending ?? false,
    },
    sendAfter: new Date(Date.now() + REVIEW_MAIL_DELAY_SECONDS * 1000),
  });
}

export async function queueLevelUp(
  tx: Transaction,
  tenantId: string,
  input: { userId: string } & LevelUpPayload,
): Promise<void> {
  await tx.insert(notifications).values({
    tenantId,
    userId: input.userId,
    kind: "level_up",
    payload: { pathId: input.pathId, level: input.level },
  });
}

/** The learner saw the decided result of this submission (on the assignment page). */
export async function markResultSeen(
  db: Database,
  tenantId: string,
  userId: string,
  submissionId: string,
): Promise<void> {
  await withTenant(db, tenantId, (tx) =>
    tx
      .update(submissions)
      .set({ resultSeenAt: new Date() })
      .where(
        and(
          eq(submissions.id, submissionId),
          eq(submissions.userId, userId),
          sql`${submissions.decidedAt} is not null`,
          sql`(${submissions.resultSeenAt} is null or ${submissions.resultSeenAt} < ${submissions.decidedAt})`,
        ),
      ),
  );
}

type Prepared = { mail: OutgoingEmail } | { skip: string };
type NotificationRow = typeof notifications.$inferSelect;

async function reviewReadyMail(
  tx: Transaction,
  tenant: TenantContext,
  to: string,
  payload: ReviewReadyPayload,
): Promise<Prepared> {
  const [submission] = await tx
    .select()
    .from(submissions)
    .where(eq(submissions.id, payload.submissionId));
  if (!submission) return { skip: "gone" };
  const decision = reviewMailDecision(submission);
  if (decision !== "send") return { skip: decision };

  const [assignment] = await tx
    .select()
    .from(assignments)
    .where(eq(assignments.id, submission.assignmentId));
  const [course] = assignment
    ? await tx.select().from(courses).where(eq(courses.id, assignment.courseId))
    : [];
  if (!assignment || !course) return { skip: "gone" };
  const [enrollment] = await tx
    .select({ locale: enrollments.locale })
    .from(enrollments)
    .where(and(eq(enrollments.courseId, course.id), eq(enrollments.userId, submission.userId)));
  const [human] = await tx
    .select({ overall: reviews.overall })
    .from(reviews)
    .where(and(eq(reviews.submissionId, submission.id), eq(reviews.reviewerType, "human")))
    .orderBy(desc(reviews.createdAt))
    .limit(1);
  const outcome = effectiveOutcome(submission.status, human ? human.overall.pass : null);
  if (outcome === "pending") return { skip: "undecided" };
  const passed = outcome === "passed";

  const t = tenantTranslator(tenant, enrollment?.locale);
  const fallback = [tenant.settings.default_locale];
  const artifact = localize(assignment.artifactName, t.locale, fallback);
  const courseTitle = localize(course.title, t.locale, fallback);
  const paragraphs: string[] = [];
  if (payload.secondLook) paragraphs.push(t.t("email.reviewReady.secondLook"));
  paragraphs.push(
    t.t(
      !passed
        ? "email.reviewReady.bodyRevise"
        : payload.testPending
          ? "email.reviewReady.bodyPassedTestPending"
          : "email.reviewReady.bodyPassed",
      { course: courseTitle },
    ),
  );
  if (passed && payload.levelUp !== null && tenant.settings.features.levels) {
    const [scheme] = await tx.select().from(levelSchemes);
    const level = scheme?.levels.find((candidate) => candidate.n === payload.levelUp);
    if (level) {
      paragraphs.push(
        t.t("email.reviewReady.levelUp", {
          n: level.n,
          name: localize(level.name, t.locale, fallback),
        }),
      );
    }
  }
  // A pass that completed the course leads to the credential, where sharing it starts.
  const [credential] =
    passed && !payload.testPending
      ? await tx
          .select({ publicId: credentials.publicId })
          .from(credentials)
          .where(
            and(
              eq(credentials.userId, submission.userId),
              eq(credentials.courseId, course.id),
              isNull(credentials.revokedAt),
            ),
          )
      : [];
  const rendered = await renderNoticeEmail({
    tenant,
    t,
    subject: t.t("email.reviewReady.subject", { artifact }),
    heading: t.t(passed ? "email.reviewReady.headingPassed" : "email.reviewReady.headingRevise", {
      artifact,
    }),
    paragraphs,
    button: credential
      ? {
          label: t.t("course.viewCredential"),
          url: academyUrl(tenant, `/verify/${credential.publicId}#share`),
        }
      : {
          label: t.t("email.reviewReady.button"),
          url: academyUrl(tenant, `/courses/${course.slug}/assignment#attempts`),
        },
    reason: t.t("email.reason", { academy: tenant.settings.author_display_name }),
  });
  return { mail: outgoing(tenant, to, rendered) };
}

async function levelUpMail(
  tx: Transaction,
  tenant: TenantContext,
  to: string,
  userId: string,
  payload: LevelUpPayload,
): Promise<Prepared> {
  if (!tenant.settings.features.paths || !tenant.settings.features.levels) {
    return { skip: "levels_off" };
  }
  const [path] = await tx.select().from(paths).where(eq(paths.id, payload.pathId));
  const [scheme] = await tx.select().from(levelSchemes);
  const level = scheme?.levels.find((candidate) => candidate.n === payload.level);
  if (!path || !level) return { skip: "gone" };
  const [profile] = await tx
    .select({ locale: learnerProfiles.locale })
    .from(learnerProfiles)
    .where(eq(learnerProfiles.userId, userId));

  // A level reached by finishing a course leads to that course's credential;
  // one the team granted has none, so it leads to the profile.
  const manual = level.rule.type === "manual_grant";
  const [credential] = manual
    ? []
    : await tx
        .select({ publicId: credentials.publicId })
        .from(credentials)
        .where(
          and(
            eq(credentials.userId, userId),
            eq(credentials.pathId, path.id),
            eq(credentials.levelAtIssue, level.n),
            isNull(credentials.revokedAt),
          ),
        )
        .orderBy(desc(credentials.issuedAt))
        .limit(1);

  const t = tenantTranslator(tenant, profile?.locale);
  const fallback = [tenant.settings.default_locale];
  const academy = tenant.settings.author_display_name;
  const name = localize(level.name, t.locale, fallback);
  const rendered = await renderNoticeEmail({
    tenant,
    t,
    subject: t.t("email.levelUp.subject", { academy, name }),
    heading: t.t("email.levelUp.heading", { n: level.n, name }),
    paragraphs: [
      // Only the team grants manual levels; the others are reached by finishing courses.
      t.t(manual ? "email.levelUp.body" : "email.levelUp.bodyReached", {
        academy,
        name,
        path: localize(path.title, t.locale, fallback),
      }),
    ],
    button: credential
      ? {
          label: t.t("course.viewCredential"),
          url: academyUrl(tenant, `/verify/${credential.publicId}#share`),
        }
      : { label: t.t("email.levelUp.button"), url: academyUrl(tenant, "/me") },
    reason: t.t("email.reason", { academy }),
  });
  return { mail: outgoing(tenant, to, rendered) };
}

function outgoing(
  tenant: TenantContext,
  to: string,
  rendered: { subject: string; html: string; text: string },
): OutgoingEmail {
  const from = senderFor(tenant);
  return {
    to,
    from: { name: from.name, address: from.address },
    replyTo: from.replyTo,
    ...rendered,
    // No out-of-office replies to automatic mail (RFC 3834).
    headers: { "Auto-Submitted": "auto-generated" },
  };
}

async function prepare(
  tx: Transaction,
  tenant: TenantContext,
  row: NotificationRow,
): Promise<Prepared> {
  const [account] = await tx
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, row.userId));
  if (!account) return { skip: "gone" };
  return row.kind === "review_ready"
    ? reviewReadyMail(tx, tenant, account.email, row.payload as ReviewReadyPayload)
    : levelUpMail(tx, tenant, account.email, row.userId, row.payload as LevelUpPayload);
}

export interface DispatchResult {
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * Sends one academy's due mails. Each in its own transaction with the row
 * locked (SKIP LOCKED), so two workers never send the same mail. A failed
 * send is retried with backoff; the first failure ends the run, since the
 * relay is probably down for the rest as well.
 */
export async function dispatchNotifications(
  db: Database,
  tenant: TenantContext,
  deps: { send: SendEmail; limit?: number },
): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, skipped: 0, failed: 0 };
  for (let i = 0; i < (deps.limit ?? 50); i++) {
    const outcome = await withTenant(db, tenant.id, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .select()
        .from(notifications)
        .where(and(eq(notifications.status, "pending"), lte(notifications.sendAfter, now)))
        .orderBy(asc(notifications.sendAfter))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!row) return null;
      const done = (set: Partial<NotificationRow>) =>
        tx
          .update(notifications)
          .set({ processedAt: now, ...set })
          .where(eq(notifications.id, row.id));
      try {
        const prepared = await prepare(tx, tenant, row);
        if ("skip" in prepared) {
          await done({ status: "skipped", note: prepared.skip });
          return "skipped" as const;
        }
        await deps.send(prepared.mail);
        await done({ status: "sent", attempts: row.attempts + 1, note: null });
        return "sent" as const;
      } catch (error) {
        const attempts = row.attempts + 1;
        const message = error instanceof Error ? error.message : String(error);
        await tx
          .update(notifications)
          .set(
            attempts >= MAX_SEND_ATTEMPTS
              ? { status: "failed", attempts, note: message.slice(0, 500), processedAt: now }
              : {
                  attempts,
                  note: message.slice(0, 500),
                  sendAfter: new Date(now.getTime() + retryDelaySeconds(attempts) * 1000),
                },
          )
          .where(eq(notifications.id, row.id));
        return "failed" as const;
      }
    });
    if (!outcome) break;
    result[outcome]++;
    if (outcome === "failed") break;
  }
  return result;
}

/** Mail that went out (or never will) is kept 90 days, for support questions. */
export async function purgeProcessedNotifications(db: Database, tenantId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60_000);
  const removed = await withTenant(db, tenantId, (tx) =>
    tx
      .delete(notifications)
      .where(and(isNotNull(notifications.processedAt), lt(notifications.processedAt, cutoff)))
      .returning({ id: notifications.id }),
  );
  return removed.length;
}

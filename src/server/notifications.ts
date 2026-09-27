import { and, asc, desc, eq, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";

import { TEAM_ROLES } from "@/core/access/team";
import { isLocale, localize } from "@/core/i18n/locales";
import { tenantTranslator } from "@/core/i18n/tenant-translator";
import { createTranslator } from "@/core/i18n/translator";
import {
  MAX_SEND_ATTEMPTS,
  REVIEW_MAIL_DELAY_SECONDS,
  retryDelaySeconds,
  reviewAlertWaitsUntil,
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
  type ReviewWaitingPayload,
  type TeamInvitePayload,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { senderFor, type OutgoingEmail, type SendEmail } from "@/server/email/mailer";
import { renderNoticeEmail } from "@/server/email/templates/notice";
import { academyUrl } from "@/server/platform/config";
import { lastReviewAlertAt, stillWaitingFor } from "@/server/review/alerts";
import { rolesOf } from "@/server/team";

/*
 * Transactional mail (brief §9). Learners hear that feedback is ready or a
 * level was reached; the team gets its invitations and hears about hand-ins
 * waiting for review (server/team.ts, server/review/alerts.ts). Queued in the
 * transaction of what it reports, so a rolled-back decision never mails;
 * sent by the worker.
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

/** A mail to send, why none goes out, or when to try again. */
type Prepared = { mail: OutgoingEmail } | { skip: string } | { later: Date };
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

/**
 * The invitation to the team, in the Studio language of the admin who sent
 * it, which may be one the academy does not teach in. It names the academy
 * and the roles the person has now, never who added them.
 */
async function teamInviteMail(
  tx: Transaction,
  tenant: TenantContext,
  to: string,
  userId: string,
  payload: TeamInvitePayload,
): Promise<Prepared> {
  const roles = await rolesOf(tx, userId);
  const teamRoles = TEAM_ROLES.filter((role) => roles.includes(role));
  if (teamRoles.length === 0) return { skip: "not_on_team" };
  const t = createTranslator({
    locale: isLocale(payload.locale) ? payload.locale : tenant.settings.default_locale,
    termOverrides: tenant.terminology,
    messageOverrides: tenant.terminology.strings,
  });
  const academy = tenant.settings.author_display_name;
  const rendered = await renderNoticeEmail({
    tenant,
    t,
    subject: t.t("email.teamInvite.subject", { academy }),
    heading: t.t("email.teamInvite.heading", { academy }),
    paragraphs: [t.t("email.teamInvite.body", { academy }), t.t("email.teamInvite.roles")],
    list: teamRoles.map((role) => t.t(`email.teamInvite.role.${role}`)),
    // The academy's own sign-in (magic link), straight into the Studio afterwards.
    button: {
      label: t.t("email.teamInvite.button"),
      url: academyUrl(tenant, "/sign-in?next=/studio"),
    },
    note: t.t("email.teamInvite.note", { academy }),
    reason: t.t("email.teamInvite.reason", { academy }),
  });
  return { mail: outgoing(tenant, to, rendered) };
}

/** Most hand-ins one alert lists; the rest are counted. */
const ALERT_LIST_MAX = 10;

/**
 * The hand-ins waiting for this team member, in one mail (at most one an
 * hour). Learners appear by their alias only, and nothing of their work is
 * in it. The Studio keeps no language per person, so it is written in the
 * one they first signed in with, if the academy teaches in it.
 */
async function reviewWaitingMail(
  tx: Transaction,
  tenant: TenantContext,
  to: string,
  userId: string,
  payload: ReviewWaitingPayload,
): Promise<Prepared> {
  const waiting = await stillWaitingFor(tx, tenant.id, userId, payload.submissionIds);
  if (!waiting) return { skip: "not_reviewer" };
  if (waiting.length === 0) return { skip: "decided" };
  const later = reviewAlertWaitsUntil(new Date(), await lastReviewAlertAt(tx, userId));
  if (later) return { later };

  const [profile] = await tx
    .select({ locale: learnerProfiles.locale })
    .from(learnerProfiles)
    .where(eq(learnerProfiles.userId, userId));
  const t = tenantTranslator(tenant, profile?.locale);
  const fallback = [tenant.settings.default_locale];
  const academy = tenant.settings.author_display_name;
  const subject =
    waiting.length === 1
      ? t.t("email.reviewWaiting.subjectOne")
      : t.t("email.reviewWaiting.subject", { n: waiting.length });
  const list = waiting.slice(0, ALERT_LIST_MAX).map((item) =>
    t.t(item.kind === "decide" ? "email.reviewWaiting.decide" : "email.reviewWaiting.spotCheck", {
      alias: item.alias,
      course: localize(item.courseTitle, t.locale, fallback),
    }),
  );
  if (waiting.length > ALERT_LIST_MAX) {
    list.push(t.t("email.reviewWaiting.more", { n: waiting.length - ALERT_LIST_MAX }));
  }
  const rendered = await renderNoticeEmail({
    tenant,
    t,
    subject,
    heading: subject,
    paragraphs: [t.t("email.reviewWaiting.body", { academy })],
    list,
    button: {
      label: t.t("email.reviewWaiting.button"),
      url: academyUrl(tenant, "/studio/reviews"),
    },
    note: t.t("email.reviewWaiting.note"),
    reason: t.t("email.reviewWaiting.reason", { academy }),
  });
  return { mail: outgoing(tenant, to, rendered) };
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
  switch (row.kind) {
    case "review_ready":
      return reviewReadyMail(tx, tenant, account.email, row.payload as ReviewReadyPayload);
    case "level_up":
      return levelUpMail(tx, tenant, account.email, row.userId, row.payload as LevelUpPayload);
    case "team_invite":
      return teamInviteMail(
        tx,
        tenant,
        account.email,
        row.userId,
        row.payload as TeamInvitePayload,
      );
    case "review_waiting":
      return reviewWaitingMail(
        tx,
        tenant,
        account.email,
        row.userId,
        row.payload as ReviewWaitingPayload,
      );
  }
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
        if ("later" in prepared) {
          await tx
            .update(notifications)
            .set({ sendAfter: prepared.later })
            .where(eq(notifications.id, row.id));
          return "postponed" as const;
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
    if (outcome === "postponed") continue;
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

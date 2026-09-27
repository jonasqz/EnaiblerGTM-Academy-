import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { INVITATIONS_PER_DAY, type AcademyRole } from "@/core/access/team";
import { REVIEW_ALERT_INTERVAL_SECONDS } from "@/core/notifications/rules";
import { learnerAlias } from "@/core/people/alias";
import type { TenantContext } from "@/core/tenant/context";
import {
  cohorts,
  courses,
  enrollments,
  memberships,
  notifications,
  submissions,
  user,
  type ReviewWaitingPayload,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import { addMentor, createCohort, joinCohort } from "@/server/cohorts";
import type { OutgoingEmail } from "@/server/email/mailer";
import type { Enqueue } from "@/server/jobs/producer";
import { submitAssignment } from "@/server/learning";
import { ensureEnrollment, ensureLearner } from "@/server/learners";
import type { LlmCaller } from "@/server/llm";
import { dispatchNotifications } from "@/server/notifications";
import { processSubmission } from "@/server/review/process-submission";
import { createCourse, publishCourse } from "@/server/studio/courses";
import { createLesson, updateLesson } from "@/server/studio/lessons";
import { decideSubmission } from "@/server/studio/reviews";
import {
  changeTeamRoles,
  ensureAccount,
  grantRole,
  inviteToTeam,
  listTeam,
  removeFromTeam,
  resendInvitation,
  revokeRole,
  rolesOf,
} from "@/server/team";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

/** Accounts are global and outlive a test run: each run gets addresses of its own. */
const domain = `${randomUUID().slice(0, 8)}.team.test`;
const at = (name: string) => `${name}@${domain}`;

/** An AI review that passes: released at once, and a spot check while the course is new. */
const passingLlm: LlmCaller = async () => ({
  content: JSON.stringify({
    criteria: ["complete", "evidence", "clarity"].map((id) => ({
      criterion_id: id,
      score: 3,
      evidence: [],
      improvement: "Name who you talked to.",
    })),
    summary: "Solid.",
  }),
  model: "fake-model",
  tokensIn: 10,
  tokensOut: 10,
  cost: 0,
  latencyMs: 1,
});

describe.skipIf(!hasDatabase)("the academy's team", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let other: TenantContext;
  let admin: string;
  let otherAdmin: string;
  const sent: OutgoingEmail[] = [];
  const send = async (mail: OutgoingEmail) => {
    sent.push(mail);
  };
  const enqueue: Enqueue = async () => undefined;
  const handInText = "Five interviews, three confirmed the problem.";

  const dispatch = () => dispatchNotifications(dbs.app.db, tenant, { send });
  const rolesIn = (academy: TenantContext, userId: string) =>
    withTenant(dbs.app.db, academy.id, (tx) => rolesOf(tx, userId));
  const mailRows = (userId: string, kind: "team_invite" | "review_waiting") =>
    withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.kind, kind)))
        .orderBy(notifications.createdAt),
    );
  /** Makes every pending mail due now, as if its wait had passed. */
  const makeDue = () =>
    withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .update(notifications)
        .set({ sendAfter: sql`now() - interval '1 second'` })
        .where(eq(notifications.status, "pending")),
    );
  const mailTo = (email: string) => sent.filter((mail) => mail.to === email);
  const invite = (email: string, roles: AcademyRole[], actorId = admin) =>
    inviteToTeam(dbs.app.db, tenant, { actorId, email, roles, locale: "en" });

  /** What /auth/continue does after a magic link: a proven address and a learner membership. */
  async function signIn(academy: TenantContext, userId: string) {
    await dbs.app.db.update(user).set({ emailVerified: true }).where(eq(user.id, userId));
    await withTenant(dbs.app.db, academy.id, (tx) =>
      ensureLearner(tx, academy, userId, { locale: "en", entry: {} }),
    );
  }

  async function emailOf(userId: string): Promise<string> {
    const [row] = await dbs.app.db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, userId));
    return row!.email;
  }

  /** A learner hands in their work, and the review job runs right away. */
  async function handIn(userId: string, llm: LlmCaller | null = null): Promise<string> {
    await withTenant(dbs.app.db, tenant.id, async (tx) => {
      await ensureLearner(tx, tenant, userId, { locale: "en", entry: {} });
      await ensureEnrollment(tx, tenant, userId, {
        courseSlug: "validation-lab",
        locale: "en",
        entry: {},
      });
    });
    const result = await submitAssignment(
      dbs.app.db,
      tenant,
      userId,
      "validation-lab",
      { text: handInText },
      enqueue,
    );
    if (!result.ok) throw new Error(result.error);
    await processSubmission(
      dbs.app.db,
      { tenantId: tenant.id, submissionId: result.submissionId },
      { llm, model: "fake-model" },
    );
    return result.submissionId;
  }

  beforeAll(async () => {
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    other = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    admin = await createUser(dbs.owner.db);
    otherAdmin = await createUser(dbs.owner.db);
    await grantRole(dbs.app.db, tenant.id, admin, "tenant_admin");
    await signIn(tenant, admin);
    await grantRole(dbs.app.db, other.id, otherAdmin, "tenant_admin");
    await signIn(other, otherAdmin);

    const courseId = await createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: "Validation Lab",
      artifactName: "Validated idea brief",
      outcome: "Write a brief.",
      deliveryMode: "free_async",
    });
    const lessonId = await createLesson(dbs.app.db, tenant.id, courseId, {
      locale: "en",
      title: "Interviews",
      userId: admin,
    });
    await updateLesson(dbs.app.db, tenant.id, lessonId, {
      title: "Interviews",
      markdown: "Talk to five people.",
      criterionIds: ["complete", "evidence", "clarity"],
      userId: admin,
    });
    expect((await publishCourse(dbs.app.db, tenant.id, courseId)).ok).toBe(true);
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("invites someone new: an account, the roles and a mail in the admin's language", async () => {
    const result = await inviteToTeam(dbs.app.db, tenant, {
      actorId: admin,
      email: `  New.Author@${domain.toUpperCase()} `,
      roles: ["author", "reviewer"],
      locale: "de",
    });
    expect(result).toEqual({ ok: true, status: "invited", email: at("new.author") });

    const [account] = await dbs.app.db
      .select()
      .from(user)
      .where(eq(user.email, at("new.author")));
    expect(account).toMatchObject({ name: "", emailVerified: false });
    expect((await rolesIn(tenant, account!.id)).sort()).toEqual(["author", "reviewer"]);
    expect(await mailRows(account!.id, "team_invite")).toMatchObject([
      { status: "pending", payload: { locale: "de" } },
    ]);

    expect((await dispatch()).sent).toBe(1);
    const [mail] = mailTo(at("new.author"));
    const academy = tenant.settings.author_display_name;
    // The academy writes, in the admin's Studio language, and never says who added them.
    expect(mail!.from.name).toBe(academy);
    expect(mail!.subject).toBe(`Du bist im Team von ${academy}`);
    expect(mail!.text).toContain("Autor:in: Du baust und veröffentlichst Kurse");
    expect(mail!.text).toContain("Prüfer:in: Du bewertest, was Lernende abgeben.");
    expect(mail!.text).not.toContain("Admin:");
    expect(mail!.text).not.toContain(await emailOf(admin));
    expect(mail!.html).toContain("/sign-in?next=/studio");
    expect(mail!.headers).toEqual({ "Auto-Submitted": "auto-generated" });

    const listed = (await listTeam(dbs.app.db, tenant.id)).find(
      (member) => member.email === at("new.author"),
    );
    expect(listed).toMatchObject({
      roles: ["author", "reviewer"],
      mentorOf: null,
      signedIn: false,
    });
    expect(listed!.invitedAt).toBeInstanceOf(Date);
  });

  it("only updates the roles of someone already on the team", async () => {
    expect(await invite(at("new.author"), ["reviewer"])).toMatchObject({
      ok: true,
      status: "updated",
    });
    const { userId } = await ensureAccount(dbs.app.db, at("new.author"));
    expect(await rolesIn(tenant, userId)).toEqual(["reviewer"]);
    expect(await mailRows(userId, "team_invite")).toHaveLength(1);
  });

  it("refuses addresses that are none, and invitations without a role", async () => {
    expect(await invite("nobody@", ["author"])).toEqual({ ok: false, error: "email" });
    expect(await invite("x@example.com", [])).toEqual({ ok: false, error: "no_roles" });
  });

  it("knows who signed in, and invites only the others again", async () => {
    const { userId } = await ensureAccount(dbs.app.db, at("new.author"));
    expect(
      await resendInvitation(dbs.app.db, tenant, { actorId: admin, userId, locale: "en" }),
    ).toEqual({ ok: true });
    expect(await mailRows(userId, "team_invite")).toHaveLength(2);

    await signIn(tenant, userId);
    const listed = (await listTeam(dbs.app.db, tenant.id)).find((m) => m.userId === userId);
    expect(listed?.signedIn).toBe(true);
    expect(
      await resendInvitation(dbs.app.db, tenant, { actorId: admin, userId, locale: "en" }),
    ).toEqual({ ok: false, error: "signed_in" });
  });

  it("limits invitations per academy and day", async () => {
    const sentToday = (
      await withTenant(dbs.app.db, tenant.id, (tx) =>
        tx.select().from(notifications).where(eq(notifications.kind, "team_invite")),
      )
    ).length;
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.insert(notifications).values(
        Array.from({ length: INVITATIONS_PER_DAY - sentToday }, () => ({
          tenantId: tenant.id,
          userId: admin,
          kind: "team_invite" as const,
          payload: { locale: "en" },
          status: "skipped" as const,
        })),
      ),
    );

    expect(await invite(at("one.too.many"), ["author"])).toEqual({
      ok: false,
      error: "limit",
    });
    // A refused invitation leaves no account behind.
    expect(
      await dbs.app.db
        .select()
        .from(user)
        .where(eq(user.email, at("one.too.many"))),
    ).toEqual([]);
    // Roles of people on the team still change: no mail goes out for that.
    expect(await invite(at("new.author"), ["reviewer"])).toMatchObject({
      ok: true,
      status: "updated",
    });

    // A day later the academy may invite again.
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .update(notifications)
        .set({ createdAt: sql`now() - interval '25 hours'` })
        .where(eq(notifications.kind, "team_invite")),
    );
    expect(await invite(at("one.too.many"), ["author"])).toMatchObject({
      ok: true,
      status: "invited",
    });
  });

  it("changes roles and removes from the team, keeping the person's learning", async () => {
    const learner = await createUser(dbs.owner.db);
    const submissionId = await handIn(learner);

    // A learner joins the team: invited like anyone who was not on it.
    expect(await invite(await emailOf(learner), ["author"])).toMatchObject({
      ok: true,
      status: "invited",
    });
    expect(
      await changeTeamRoles(dbs.app.db, tenant, { actorId: admin, userId: learner, roles: [] }),
    ).toEqual({ ok: false, error: "no_roles" });
    expect(
      await changeTeamRoles(dbs.app.db, tenant, {
        actorId: admin,
        userId: learner,
        roles: ["reviewer"],
      }),
    ).toEqual({ ok: true });
    expect((await rolesIn(tenant, learner)).sort()).toEqual(["learner", "reviewer"]);

    expect(await removeFromTeam(dbs.app.db, tenant, { actorId: admin, userId: learner })).toEqual({
      ok: true,
    });
    expect(await rolesIn(tenant, learner)).toEqual(["learner"]);
    const kept = await withTenant(dbs.app.db, tenant.id, async (tx) => ({
      enrollments: await tx.select().from(enrollments).where(eq(enrollments.userId, learner)),
      submissions: await tx.select().from(submissions).where(eq(submissions.id, submissionId)),
    }));
    expect(kept.enrollments).toHaveLength(1);
    expect(kept.submissions).toHaveLength(1);
    expect((await listTeam(dbs.app.db, tenant.id)).map((m) => m.userId)).not.toContain(learner);
    // Off the team, there is nothing left to change.
    expect(
      await changeTeamRoles(dbs.app.db, tenant, {
        actorId: admin,
        userId: learner,
        roles: ["author"],
      }),
    ).toEqual({ ok: false, error: "not_found" });
  });

  it("always keeps an admin, even against the admins themselves", async () => {
    const onlyAdmin = { actorId: admin, userId: admin };
    expect(await changeTeamRoles(dbs.app.db, tenant, { ...onlyAdmin, roles: ["author"] })).toEqual({
      ok: false,
      error: "last_admin",
    });
    expect(await removeFromTeam(dbs.app.db, tenant, onlyAdmin)).toEqual({
      ok: false,
      error: "last_admin",
    });
    expect(await invite(await emailOf(admin), ["author"])).toEqual({
      ok: false,
      error: "last_admin",
    });
    expect(await revokeRole(dbs.app.db, tenant.id, admin, "tenant_admin")).toEqual({
      ok: false,
      error: "last_admin",
    });
    expect(await rolesIn(tenant, admin)).toContain("tenant_admin");

    // With a second admin either may step down, but two stepping each other down at once
    // leaves one of them admin.
    const second = await createUser(dbs.owner.db);
    expect(await invite(await emailOf(second), ["tenant_admin"])).toMatchObject({
      ok: true,
      status: "invited",
    });
    const results = await Promise.all([
      changeTeamRoles(dbs.app.db, tenant, { actorId: admin, userId: second, roles: ["author"] }),
      changeTeamRoles(dbs.app.db, tenant, { actorId: second, userId: admin, roles: ["author"] }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: "forbidden" }]);
    const admins = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(memberships).where(eq(memberships.role, "tenant_admin")),
    );
    expect(admins).toHaveLength(1);

    // `admin` stays the academy's admin for the tests below.
    if (admins[0]!.userId !== admin) {
      expect(
        await changeTeamRoles(dbs.app.db, tenant, {
          actorId: second,
          userId: admin,
          roles: ["tenant_admin"],
        }),
      ).toEqual({ ok: true });
    }
    expect(await removeFromTeam(dbs.app.db, tenant, { actorId: admin, userId: second })).toEqual({
      ok: true,
    });
  });

  it("lets no other academy's admin touch this team", async () => {
    const { userId } = await ensureAccount(dbs.app.db, at("new.author"));
    const stranger = { actorId: otherAdmin, userId };
    // Acting on this academy: they are no admin here.
    expect(
      await changeTeamRoles(dbs.app.db, tenant, { ...stranger, roles: ["tenant_admin"] }),
    ).toEqual({ ok: false, error: "forbidden" });
    expect(await removeFromTeam(dbs.app.db, tenant, stranger)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await invite(at("sneaky"), ["tenant_admin"], otherAdmin)).toEqual({
      ok: false,
      error: "forbidden",
    });
    // Acting from their own academy: this team's members are not there to be found.
    expect(await changeTeamRoles(dbs.app.db, other, { ...stranger, roles: ["author"] })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await removeFromTeam(dbs.app.db, other, stranger)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await rolesIn(tenant, userId)).toContain("reviewer");
    expect((await listTeam(dbs.app.db, other.id)).map((member) => member.userId)).toEqual([
      otherAdmin,
    ]);
    expect((await listTeam(dbs.app.db, tenant.id)).map((m) => m.userId)).not.toContain(otherAdmin);
  });

  describe("review alerts", () => {
    let reviewer: string;
    let mentor: string;
    let inCohort: string;

    const pendingAlert = async (userId: string) => {
      const rows = (await mailRows(userId, "review_waiting")).filter(
        (row) => row.status === "pending",
      );
      expect(rows.length).toBeLessThanOrEqual(1);
      return rows[0];
    };
    const alertMails = (email: string) =>
      mailTo(email).filter((mail) => mail.subject.includes("waiting for your review"));
    const lastAlert = async (userId: string) => alertMails(await emailOf(userId)).at(-1);

    beforeAll(async () => {
      // The team for these tests: the admin, a reviewer, a cohort's mentor, and an author
      // who never signed in.
      const { userId: newAuthor } = await ensureAccount(dbs.app.db, at("new.author"));
      await removeFromTeam(dbs.app.db, tenant, { actorId: admin, userId: newAuthor });
      await invite(at("reviewer"), ["reviewer"]);
      reviewer = (await ensureAccount(dbs.app.db, at("reviewer"))).userId;
      await signIn(tenant, reviewer);
      await invite(at("absent.author"), ["author"]);

      const [course] = await withTenant(dbs.app.db, tenant.id, (tx) =>
        tx.select({ id: courses.id }).from(courses).where(eq(courses.slug, "validation-lab")),
      );
      const cohortId = (await createCohort(dbs.app.db, tenant.id, {
        courseId: course!.id,
        name: "Autumn 2026",
        startsOn: null,
        endsOn: null,
        createdBy: admin,
      }))!;
      const [cohort] = await withTenant(dbs.app.db, tenant.id, (tx) =>
        tx.select().from(cohorts).where(eq(cohorts.id, cohortId)),
      );
      // A mentor added on the cohort's page is invited like any colleague.
      expect(await addMentor(dbs.app.db, tenant.id, cohortId, at("mentor"), "en")).toEqual({
        ok: true,
        invited: true,
      });
      mentor = (await ensureAccount(dbs.app.db, at("mentor"))).userId;
      // Mentoring a second cohort is no news: no second invitation.
      const secondCohort = (await createCohort(dbs.app.db, tenant.id, {
        courseId: course!.id,
        name: "Winter 2027",
        startsOn: null,
        endsOn: null,
        createdBy: admin,
      }))!;
      expect(await addMentor(dbs.app.db, tenant.id, secondCohort, at("mentor"), "en")).toEqual({
        ok: true,
        invited: false,
      });
      expect(await mailRows(mentor, "team_invite")).toHaveLength(1);
      await signIn(tenant, mentor);

      inCohort = await createUser(dbs.owner.db);
      await signIn(tenant, inCohort);
      expect(
        await joinCohort(dbs.app.db, tenant, inCohort, {
          code: cohort!.joinCode,
          locale: "en",
          entry: {},
        }),
      ).toMatchObject({ ok: true });

      // Whatever earlier tests queued goes out now, and long enough ago not to count.
      await makeDue();
      await dispatch();
      await withTenant(dbs.app.db, tenant.id, (tx) =>
        tx
          .update(notifications)
          .set({ processedAt: sql`processed_at - interval '2 hours'` })
          .where(and(eq(notifications.kind, "review_waiting"), eq(notifications.status, "sent"))),
      );
      const [invitation] = mailTo(at("mentor"));
      expect(invitation!.text).toContain(
        "Mentor: you review what the learners in your cohorts hand in.",
      );
    });

    it("go to everyone who may decide the hand-in, one waiting alert per person", async () => {
      const outsider = await createUser(dbs.owner.db);
      const first = await handIn(inCohort);
      const second = await handIn(outsider);
      const absentAuthor = (await ensureAccount(dbs.app.db, at("absent.author"))).userId;

      expect((await pendingAlert(admin))?.payload).toEqual({ submissionIds: [first, second] });
      expect((await pendingAlert(reviewer))?.payload).toEqual({ submissionIds: [first, second] });
      // Mentors hear about their cohort only.
      expect((await pendingAlert(mentor))?.payload).toEqual({ submissionIds: [first] });
      // Nobody hears about hand-ins before signing in, and learners never do.
      expect(await pendingAlert(absentAuthor)).toBeUndefined();
      expect(await pendingAlert(inCohort)).toBeUndefined();
      // A few minutes pass first, so hand-ins arriving together share a mail.
      expect((await pendingAlert(admin))!.sendAfter.getTime()).toBeGreaterThan(Date.now() + 60_000);
      expect((await dispatch()).sent).toBe(0);

      await makeDue();
      expect((await dispatch()).sent).toBe(3);
      const toAdmin = await lastAlert(admin);
      expect(toAdmin!.subject).toBe("2 hand-ins are waiting for your review");
      expect(toAdmin!.from.name).toBe(tenant.settings.author_display_name);
      expect(toAdmin!.text).toContain(
        `${learnerAlias(tenant.id, inCohort)} · Validation Lab: waits for a decision`,
      );
      expect(toAdmin!.text).toContain(learnerAlias(tenant.id, outsider));
      expect(toAdmin!.html).toContain("/studio/reviews");
      // Learners by alias only, and nothing of their work.
      expect(toAdmin!.text).not.toContain(handInText);
      expect(toAdmin!.text).not.toContain(await emailOf(inCohort));

      const toMentor = await lastAlert(mentor);
      expect(toMentor!.subject).toBe("A hand-in is waiting for your review");
      expect(toMentor!.text).toContain(learnerAlias(tenant.id, inCohort));
      expect(toMentor!.text).not.toContain(learnerAlias(tenant.id, outsider));
      expect(alertMails(at("absent.author"))).toEqual([]);
    });

    it("wait out the hour since the last one, and skip what was decided meanwhile", async () => {
      const third = await handIn(await createUser(dbs.owner.db));
      const waiting = await pendingAlert(reviewer);
      expect(waiting?.payload).toEqual({ submissionIds: [third] });
      const lastSent = Math.max(
        ...(await mailRows(reviewer, "review_waiting"))
          .filter((row) => row.status === "sent")
          .map((row) => row.processedAt!.getTime()),
      );
      expect(waiting!.sendAfter.getTime()).toBeGreaterThanOrEqual(
        lastSent + REVIEW_ALERT_INTERVAL_SECONDS * 1000,
      );

      // Due too early (as when it was queued while the last one went out): it waits again.
      const alertsBefore = alertMails(at("reviewer")).length;
      await makeDue();
      await dispatch();
      expect(alertMails(at("reviewer"))).toHaveLength(alertsBefore);
      expect((await pendingAlert(reviewer))!.sendAfter.getTime()).toBeGreaterThan(Date.now());

      // Decided before the hour is over: nothing is left to tell.
      expect(
        await decideSubmission(dbs.app.db, tenant, reviewer, third, {
          scores: { complete: 3, evidence: 3, clarity: 3 },
          feedback: {},
          summary: "Good.",
          reason: null,
        }),
      ).toMatchObject({ ok: true });
      await withTenant(dbs.app.db, tenant.id, (tx) =>
        tx
          .update(notifications)
          .set({ processedAt: sql`processed_at - interval '2 hours'` })
          .where(and(eq(notifications.kind, "review_waiting"), eq(notifications.status, "sent"))),
      );
      await makeDue();
      await dispatch();
      expect(alertMails(at("reviewer"))).toHaveLength(alertsBefore);
      expect(
        (await mailRows(reviewer, "review_waiting")).find((row) => row.id === waiting!.id),
      ).toMatchObject({ status: "skipped", note: "decided" });
    });

    it("include spot checks, and stop for someone who left the team", async () => {
      const learner = await createUser(dbs.owner.db);
      const submissionId = await handIn(learner, passingLlm);
      const [released] = await withTenant(dbs.app.db, tenant.id, (tx) =>
        tx.select().from(submissions).where(eq(submissions.id, submissionId)),
      );
      expect(released!.status).toBe("passed");
      expect((await pendingAlert(admin))?.payload).toEqual({ submissionIds: [submissionId] });
      expect((await pendingAlert(reviewer))?.payload).toEqual({ submissionIds: [submissionId] });

      expect(
        await removeFromTeam(dbs.app.db, tenant, { actorId: admin, userId: reviewer }),
      ).toEqual({ ok: true });
      await makeDue();
      await dispatch();
      const toAdmin = await lastAlert(admin);
      expect(toAdmin!.subject).toBe("A hand-in is waiting for your review");
      expect(toAdmin!.text).toContain(
        `${learnerAlias(tenant.id, learner)} · Validation Lab: spot check`,
      );
      expect(
        (await mailRows(reviewer, "review_waiting")).find((row) =>
          (row.payload as ReviewWaitingPayload).submissionIds.includes(submissionId),
        ),
      ).toMatchObject({ status: "skipped", note: "not_reviewer" });
    });
  });
});

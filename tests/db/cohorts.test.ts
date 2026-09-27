import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TenantContext } from "@/core/tenant/context";
import { cohorts, enrollments, memberships } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import {
  addMentor,
  createCohort,
  deleteCohort,
  joinCohort,
  learnerCohorts,
  listCohorts,
  updateCohort,
} from "@/server/cohorts";
import type { Enqueue } from "@/server/jobs/producer";
import { submitAssignment } from "@/server/learning";
import { ensureEnrollment, ensureLearner } from "@/server/learners";
import { processSubmission } from "@/server/review/process-submission";
import { createCourse, publishCourse } from "@/server/studio/courses";
import { createLesson, updateLesson } from "@/server/studio/lessons";
import { countHeldSubmissions, decideSubmission, listReviewQueue } from "@/server/studio/reviews";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

describe.skipIf(!hasDatabase)("cohorts and mentors", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let author: string;
  let courseId: string;
  let cohortId: string;
  let joinCode: string;
  const enqueue: Enqueue = async () => undefined;

  beforeAll(async () => {
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    author = await createUser(dbs.owner.db);
    courseId = await createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: "Validation Lab",
      artifactName: "Validated idea brief",
      outcome: "Write a brief.",
      deliveryMode: "free_async",
    });
    const lessonId = await createLesson(dbs.app.db, tenant.id, courseId, {
      locale: "en",
      title: "Interviews",
      userId: author,
    });
    await updateLesson(dbs.app.db, tenant.id, lessonId, {
      title: "Interviews",
      markdown: "Talk to five people.",
      criterionIds: ["complete", "evidence", "clarity"],
      userId: author,
    });
    expect((await publishCourse(dbs.app.db, tenant.id, courseId)).ok).toBe(true);
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("lets learners join by link, until the cohort closes", async () => {
    cohortId = (await createCohort(dbs.app.db, tenant.id, {
      courseId,
      name: "Autumn 2026",
      startsOn: "2026-10-05",
      endsOn: "2026-11-02",
      createdBy: author,
    }))!;
    const [row] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(cohorts).where(eq(cohorts.id, cohortId)),
    );
    joinCode = row!.joinCode;
    expect(joinCode).toMatch(/^[0-9a-z]{12}$/);

    const learner = await createUser(dbs.owner.db);
    expect(
      await joinCohort(dbs.app.db, tenant, learner, { code: joinCode, locale: "en", entry: {} }),
    ).toEqual({ ok: true, courseSlug: "validation-lab" });
    const enrolled = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(enrollments).where(eq(enrollments.userId, learner)),
    );
    expect(enrolled).toHaveLength(1);
    expect(await learnerCohorts(dbs.app.db, tenant.id, learner, [courseId])).toEqual([
      { courseId, name: "Autumn 2026", startsOn: "2026-10-05", endsOn: "2026-11-02" },
    ]);

    await updateCohort(dbs.app.db, tenant.id, cohortId, {
      name: "Autumn 2026",
      startsOn: "2026-10-05",
      endsOn: "2026-11-02",
      status: "closed",
    });
    const late = await createUser(dbs.owner.db);
    expect(
      await joinCohort(dbs.app.db, tenant, late, { code: joinCode, locale: "en", entry: {} }),
    ).toEqual({ ok: false, error: "closed" });
    expect(
      await joinCohort(dbs.app.db, tenant, late, { code: "nope", locale: "en", entry: {} }),
    ).toEqual({ ok: false, error: "not_found" });
  });

  it("shows mentors only their cohort's work", async () => {
    const [member] = (await listCohorts(dbs.app.db, tenant.id)).map((row) => row.cohort);
    const [inCohort] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select({ userId: enrollments.userId }).from(enrollments),
    );
    const outsider = await createUser(dbs.owner.db);
    await withTenant(dbs.app.db, tenant.id, async (tx) => {
      await ensureLearner(tx, tenant, outsider, { locale: "en", entry: {} });
      await ensureEnrollment(tx, tenant, outsider, {
        courseSlug: "validation-lab",
        locale: "en",
        entry: {},
      });
    });
    // Without an AI gateway, both hand-ins wait for a human.
    const held: string[] = [];
    for (const userId of [inCohort!.userId, outsider]) {
      const result = await submitAssignment(
        dbs.app.db,
        tenant,
        userId,
        "validation-lab",
        { text: "Five interviews, three confirmed the problem." },
        enqueue,
      );
      if (!result.ok) throw new Error(result.error);
      await processSubmission(
        dbs.app.db,
        { tenantId: tenant.id, submissionId: result.submissionId },
        { llm: null, model: "none" },
      );
      held.push(result.submissionId);
    }

    expect(await addMentor(dbs.app.db, tenant.id, member!.id, "Mentor@Example.com")).toBe(true);
    const [mentorship] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.role, "mentor"), eq(memberships.cohortId, member!.id))),
    );
    const scope = { mentorId: mentorship!.userId };

    expect(await countHeldSubmissions(dbs.app.db, tenant.id)).toBe(2);
    expect(await countHeldSubmissions(dbs.app.db, tenant.id, scope)).toBe(1);
    expect(
      (await listReviewQueue(dbs.app.db, tenant.id, scope)).map((row) => row.submissionId),
    ).toEqual([held[0]]);
    expect(
      await decideSubmission(
        dbs.app.db,
        tenant,
        scope.mentorId,
        held[1]!,
        {
          scores: { complete: 3, evidence: 3, clarity: 3 },
          feedback: {},
          summary: "",
          reason: null,
        },
        scope,
      ),
    ).toEqual({ ok: false, error: "not_found" });
    expect(
      await decideSubmission(
        dbs.app.db,
        tenant,
        scope.mentorId,
        held[0]!,
        {
          scores: { complete: 3, evidence: 3, clarity: 3 },
          feedback: {},
          summary: "Solid.",
          reason: null,
        },
        scope,
      ),
    ).toMatchObject({ ok: true, pass: true });
    expect(await listCohorts(dbs.app.db, tenant.id, scope.mentorId)).toHaveLength(1);
  });

  it("deletes a cohort and its mentors, not its learners' progress", async () => {
    await deleteCohort(dbs.app.db, tenant.id, cohortId);
    const left = await withTenant(dbs.app.db, tenant.id, async (tx) => ({
      mentors: await tx.select().from(memberships).where(eq(memberships.role, "mentor")),
      enrollments: await tx.select().from(enrollments),
    }));
    expect(left.mentors).toEqual([]);
    expect(left.enrollments.length).toBe(2);
  });
});

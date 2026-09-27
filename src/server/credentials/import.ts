import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { hasBlockingWording, lintWording } from "@/core/compliance/wording-lint";
import type { CredentialImportItem } from "@/core/credentials/import";
import { generatePublicId } from "@/core/credentials/public-id";
import type { TenantContext } from "@/core/tenant/context";
import type { Database } from "@/db/client";
import {
  courses,
  credentials,
  enrollments,
  learnerProfiles,
  levelSchemes,
  memberships,
  paths,
  user,
} from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";

/*
 * Credentials issued on the platform an academy used before (brief §6,
 * portability). Each item stands alone: a bad row is reported, the rest go
 * in. Re-running an import is safe (source_platform + external_id).
 */

export type ImportOutcome =
  | { status: "imported"; publicId: string }
  | { status: "exists"; publicId?: string }
  | {
      status: "failed";
      reason: "unknown_course" | "unknown_path" | "wording" | "course_done" | "public_id_taken";
    };

class Skip extends Error {
  constructor(readonly outcome: ImportOutcome) {
    super(outcome.status);
  }
}

async function importOne(
  db: Database,
  tenant: TenantContext,
  item: CredentialImportItem,
): Promise<ImportOutcome> {
  if (hasBlockingWording(lintWording(item.artifact_name, "artifact_name"))) {
    return { status: "failed", reason: "wording" };
  }
  try {
    return await withTenant(db, tenant.id, async (tx) => {
      const [existing] = await tx
        .select({ publicId: credentials.publicId })
        .from(credentials)
        .where(
          and(
            eq(credentials.sourcePlatform, item.source_platform),
            eq(credentials.externalId, item.external_id),
          ),
        );
      if (existing) return { status: "exists" as const, publicId: existing.publicId };

      const [course] = await tx.select().from(courses).where(eq(courses.slug, item.course_slug));
      if (!course) throw new Skip({ status: "failed", reason: "unknown_course" });
      const [path] = item.path_slug
        ? await tx.select().from(paths).where(eq(paths.slug, item.path_slug))
        : [];
      if (item.path_slug && !path) throw new Skip({ status: "failed", reason: "unknown_path" });

      // One global account per e-mail: signing in later with it shows the credential.
      const email = item.learner_email.trim().toLowerCase();
      await tx
        .insert(user)
        .values({ id: randomUUID(), name: "", email, emailVerified: false })
        .onConflictDoNothing({ target: user.email });
      const [account] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email));
      const userId = account!.id;
      await tx
        .insert(memberships)
        .values({ tenantId: tenant.id, userId, role: "learner" })
        .onConflictDoNothing();
      await tx
        .insert(learnerProfiles)
        .values({ tenantId: tenant.id, userId, displayName: item.display_name })
        .onConflictDoNothing();

      const [done] = await tx
        .select({ id: credentials.id })
        .from(credentials)
        .where(and(eq(credentials.userId, userId), eq(credentials.courseId, course.id)));
      if (done) throw new Skip({ status: "failed", reason: "course_done" });

      let levelName = null;
      if (item.level_at_issue) {
        const [scheme] = await tx.select().from(levelSchemes);
        levelName = scheme?.levels.find((level) => level.n === item.level_at_issue)?.name ?? null;
      }
      const issuedAt = new Date(item.issued_at);
      const publicId = item.public_id ?? generatePublicId();
      const [inserted] = await tx
        .insert(credentials)
        .values({
          tenantId: tenant.id,
          publicId,
          userId,
          courseId: course.id,
          pathId: path?.id ?? null,
          levelAtIssue: item.level_at_issue ?? null,
          levelName,
          courseTitle: course.title,
          // One language only: what the other platform sent, read as the academy's own.
          artifactName: item.artifact_name
            ? { [tenant.settings.default_locale]: item.artifact_name }
            : null,
          displayName: item.display_name,
          issuedAt,
          visibility: item.visibility,
          madePublicAt: item.visibility === "public" ? issuedAt : null,
          source: "imported",
          sourcePlatform: item.source_platform,
          externalId: item.external_id,
        })
        .onConflictDoNothing({ target: credentials.publicId })
        .returning({ publicId: credentials.publicId });
      if (!inserted) throw new Skip({ status: "failed", reason: "public_id_taken" });

      // The course shows as completed in "My learning", on the date it was.
      await tx
        .insert(enrollments)
        .values({
          tenantId: tenant.id,
          userId,
          courseId: course.id,
          pathId: path?.id ?? null,
          locale: (course.languages as string[])[0] ?? tenant.settings.default_locale,
          startedAt: issuedAt,
          completedAt: issuedAt,
        })
        .onConflictDoUpdate({
          target: [enrollments.tenantId, enrollments.userId, enrollments.courseId],
          set: { completedAt: sql`coalesce(${enrollments.completedAt}, ${issuedAt})` },
        });
      return { status: "imported" as const, publicId: inserted.publicId };
    });
  } catch (error) {
    if (error instanceof Skip) return error.outcome;
    throw error;
  }
}

export async function importCredentials(
  db: Database,
  tenant: TenantContext,
  items: readonly CredentialImportItem[],
): Promise<Array<{ external_id: string } & ImportOutcome>> {
  const results = [];
  for (const item of items) {
    results.push({ external_id: item.external_id, ...(await importOne(db, tenant, item)) });
  }
  return results;
}

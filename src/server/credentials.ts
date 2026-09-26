import { and, eq, isNull } from "drizzle-orm";

import { normalizePublicId } from "@/core/credentials/public-id";
import type { LocalizedText } from "@/core/i18n/locales";
import type { TenantContext } from "@/core/tenant/context";
import { getDb } from "@/db/client";
import { courses, credentials, paths } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";

export interface CredentialView {
  id: string;
  publicId: string;
  userId: string;
  displayName: string;
  courseId: string;
  courseSlug: string;
  courseTitle: LocalizedText;
  artifactName: string;
  issuedAt: Date;
  visibility: "private" | "public";
  level: { n: number; name: LocalizedText | null } | null;
  path: {
    id: string;
    slug: string;
    title: LocalizedText;
    color: string | null;
    position: number;
  } | null;
}

/**
 * Loads a credential of this academy by public id. Revoked credentials and
 * those of other tenants do not exist here (RLS scopes the lookup).
 */
export async function loadCredential(
  tenant: TenantContext,
  rawPublicId: string,
): Promise<CredentialView | null> {
  const publicId = normalizePublicId(rawPublicId);
  if (!publicId) return null;
  return withTenant(getDb(), tenant.id, async (tx) => {
    const [row] = await tx
      .select({ credential: credentials, courseSlug: courses.slug })
      .from(credentials)
      .innerJoin(courses, eq(courses.id, credentials.courseId))
      .where(and(eq(credentials.publicId, publicId), isNull(credentials.revokedAt)));
    if (!row) return null;
    const { credential } = row;

    let path: CredentialView["path"] = null;
    if (credential.pathId) {
      const all = await tx.select().from(paths).orderBy(paths.position);
      const index = all.findIndex((candidate) => candidate.id === credential.pathId);
      const found = all[index];
      if (found)
        path = {
          id: found.id,
          slug: found.slug,
          title: found.title,
          color: found.color,
          position: index,
        };
    }

    return {
      id: credential.id,
      publicId: credential.publicId,
      userId: credential.userId,
      displayName: credential.displayName,
      courseId: credential.courseId,
      courseSlug: row.courseSlug,
      courseTitle: credential.courseTitle,
      artifactName: credential.artifactName,
      issuedAt: credential.issuedAt,
      visibility: credential.visibility,
      level: credential.levelAtIssue
        ? { n: credential.levelAtIssue, name: credential.levelName }
        : null,
      path,
    };
  });
}

/** Visible to everyone when public; always visible to its owner (preview). */
export function canView(credential: CredentialView, viewerId: string | null): boolean {
  return credential.visibility === "public" || credential.userId === viewerId;
}

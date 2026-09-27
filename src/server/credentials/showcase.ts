import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { hasBlockingWording, lintWording } from "@/core/compliance/wording-lint";
import { normalizePublicId } from "@/core/credentials/public-id";
import type { TenantContext } from "@/core/tenant/context";
import type { Database } from "@/db/client";
import { credentials, files, submissions, type Showcase } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { attachFiles, deleteFiles } from "@/server/files";

/*
 * Showcase (brief §6, phase 2): the learner may show an excerpt of their
 * work on the verification page. Opt-in per credential, shown only while
 * the credential is public, removable at any time.
 */

export const SHOWCASE_MAX_TEXT = 2_000;
export const SHOWCASE_MAX_PICTURES = 3;

export type ShowcaseResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "too_long" | "wording" | "too_many" | "invalid" };

/** What the editor starts from: the saved showcase, else the start of the passed work. */
export async function showcaseDraft(
  db: Database,
  tenantId: string,
  credentialId: string,
): Promise<{ text: string; fileIds: string[] }> {
  return withTenant(db, tenantId, async (tx) => {
    const [row] = await tx
      .select({ showcase: credentials.showcase, submissionId: credentials.submissionId })
      .from(credentials)
      .where(eq(credentials.id, credentialId));
    if (row?.showcase) return { text: row.showcase.text, fileIds: row.showcase.fileIds };
    const [work] = row?.submissionId
      ? await tx
          .select({ text: submissions.extractedText })
          .from(submissions)
          .where(eq(submissions.id, row.submissionId))
      : [];
    return { text: (work?.text ?? "").slice(0, 600), fileIds: [] };
  });
}

export async function saveShowcase(
  db: Database,
  tenant: TenantContext,
  input: { userId: string; publicId: string; showcase: { text: string; fileIds: string[] } | null },
): Promise<ShowcaseResult> {
  const publicId = normalizePublicId(input.publicId);
  if (!publicId) return { ok: false, error: "not_found" };
  const next = input.showcase && {
    text: input.showcase.text.trim(),
    fileIds: [...new Set(input.showcase.fileIds)],
  };
  if (next && next.text.length > SHOWCASE_MAX_TEXT) return { ok: false, error: "too_long" };
  if (next && next.fileIds.length > SHOWCASE_MAX_PICTURES) return { ok: false, error: "too_many" };
  if (next && hasBlockingWording(lintWording(next.text, "showcase"))) {
    return { ok: false, error: "wording" };
  }

  let unused: string[] = [];
  try {
    await withTenant(db, tenant.id, async (tx) => {
      const [credential] = await tx
        .select({ id: credentials.id, showcase: credentials.showcase })
        .from(credentials)
        .where(
          and(
            eq(credentials.publicId, publicId),
            eq(credentials.userId, input.userId),
            isNull(credentials.revokedAt),
          ),
        )
        .for("update");
      if (!credential) throw new Error("not_found");

      let showcase: Showcase | null = null;
      if (next && (next.text || next.fileIds.length > 0)) {
        const kept = new Set(credential.showcase?.fileIds ?? []);
        const fresh = next.fileIds.filter((id) => !kept.has(id));
        // New pictures are this learner's pending uploads; attaching them fails otherwise.
        await attachFiles(tx, { ids: fresh, purpose: "showcase", ownerUserId: input.userId });
        showcase = { ...next, updatedAt: new Date().toISOString() };
      }
      await tx.update(credentials).set({ showcase }).where(eq(credentials.id, credential.id));
      unused = (credential.showcase?.fileIds ?? []).filter((id) => !showcase?.fileIds.includes(id));
    });
  } catch (error) {
    if (error instanceof Error && error.message === "not_found") {
      return { ok: false, error: "not_found" };
    }
    return { ok: false, error: "invalid" };
  }

  // Pictures taken off the page are deleted, not left lying around.
  if (unused.length > 0) {
    const records = await withTenant(db, tenant.id, (tx) =>
      tx
        .select()
        .from(files)
        .where(and(inArray(files.id, unused), eq(files.ownerUserId, input.userId))),
    );
    await deleteFiles(db, tenant.id, records);
  }
  return { ok: true };
}

/** A showcase picture is public while a public credential shows it. */
export async function showcasedPublicly(
  db: Database,
  tenantId: string,
  fileId: string,
): Promise<boolean> {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ id: credentials.id })
      .from(credentials)
      .where(
        and(
          eq(credentials.visibility, "public"),
          isNull(credentials.revokedAt),
          sql`${credentials.showcase}->'fileIds' ? ${fileId}`,
        ),
      )
      .limit(1),
  );
  return Boolean(row);
}

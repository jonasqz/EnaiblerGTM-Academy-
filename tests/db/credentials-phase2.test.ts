import { createPublicKey, randomBytes, verify } from "node:crypto";

import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generatePublicId } from "@/core/credentials/public-id";
import { createTranslator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";
import { credentials, enrollments, files, learnerProfiles, user } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import { authenticateApiKey, createApiKey, revokeApiKey } from "@/server/api-keys";
import { loadCredential } from "@/server/credentials";
import { importCredentials } from "@/server/credentials/import";
import { issuerPublicKey, openBadgeFor } from "@/server/credentials/open-badge";
import { saveShowcase, showcasedPublicly } from "@/server/credentials/showcase";
import { storeFile } from "@/server/files";
import { createCourse } from "@/server/studio/courses";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

const hasStorage = hasDatabase && Boolean(process.env.TEST_S3_ENDPOINT);

describe.skipIf(!hasDatabase)("credentials, phase 2", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let other: TenantContext;
  let admin: string;
  const email = `ada-${randomBytes(3).toString("hex")}@example.com`;
  const item = {
    external_id: `lw-${randomBytes(3).toString("hex")}`,
    source_platform: "learnworlds",
    learner_email: email,
    display_name: "Ada Lovelace",
    course_slug: "validation-lab",
    artifact_name: "Validated idea brief",
    issued_at: "2026-05-14",
    visibility: "private" as const,
  };

  beforeAll(async () => {
    process.env.DATA_ENCRYPTION_SECRET ??= "test-data-encryption-secret-0123456789";
    if (hasStorage) {
      process.env.S3_ENDPOINT = process.env.TEST_S3_ENDPOINT;
      process.env.S3_BUCKET = `enaibler-test-${randomBytes(4).toString("hex")}`;
      process.env.S3_ACCESS_KEY_ID = "test";
      process.env.S3_SECRET_ACCESS_KEY = "test";
    }
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    other = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    admin = await createUser(dbs.owner.db);
    await createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: "Validation Lab",
      artifactName: "Validated idea brief",
      outcome: "Write a brief.",
      deliveryMode: "free_async",
    });
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("imports certificates from another platform, once", async () => {
    // A link shared on the old platform keeps working: the id comes along.
    const kept = generatePublicId();
    const results = await importCredentials(dbs.app.db, tenant, [
      { ...item, public_id: kept },
      { ...item, external_id: "x-2", course_slug: "no-such-course" },
      { ...item, external_id: "x-3", artifact_name: "Certified brief" },
    ]);
    expect(results.map((result) => result.status)).toEqual(["imported", "failed", "failed"]);
    expect(results[0]).toMatchObject({ publicId: kept });
    expect(results[1]).toMatchObject({ reason: "unknown_course" });
    expect(results[2]).toMatchObject({ reason: "wording" });

    // Running it again changes nothing.
    expect(await importCredentials(dbs.app.db, tenant, [item])).toEqual([
      { external_id: item.external_id, status: "exists", publicId: kept },
    ]);

    const [account] = await dbs.owner.db.select().from(user).where(eq(user.email, email));
    const state = await withTenant(dbs.app.db, tenant.id, async (tx) => ({
      credential: (
        await tx.select().from(credentials).where(eq(credentials.userId, account!.id))
      )[0],
      enrollment: (
        await tx.select().from(enrollments).where(eq(enrollments.userId, account!.id))
      )[0],
      profile: (
        await tx.select().from(learnerProfiles).where(eq(learnerProfiles.userId, account!.id))
      )[0],
    }));
    expect(state.credential).toMatchObject({
      source: "imported",
      sourcePlatform: "learnworlds",
      visibility: "private",
      displayName: "Ada Lovelace",
      issuedAt: new Date("2026-05-14T00:00:00Z"),
    });
    expect(state.enrollment?.completedAt).toEqual(new Date("2026-05-14T00:00:00Z"));
    expect(state.profile?.displayName).toBe("Ada Lovelace");
    const view = await loadCredential(tenant, state.credential!.publicId, dbs.app.db);
    expect(view?.source).toEqual({ kind: "imported", platform: "learnworlds" });
  });

  it("signs an Open Badges 3.0 VC-JWT that verifies with the published key", async () => {
    const [row] = await withTenant(dbs.app.db, tenant.id, (tx) => tx.select().from(credentials));
    const view = (await loadCredential(tenant, row!.publicId, dbs.app.db))!;
    const t = createTranslator({ locale: "en" });
    const badge = await openBadgeFor(dbs.app.db, tenant, view, { t, email });
    const [header, payload, signature] = badge.jwt.split(".");
    const decoded = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    const kid = decoded(header!).kid as string;
    expect(decoded(header!)).toMatchObject({ alg: "RS256", typ: "JWT" });
    expect(kid).toMatch(/\/issuer\/keys\/key-1$/);

    const jwk = (await issuerPublicKey(dbs.app.db, tenant, "key-1"))!;
    expect(jwk).not.toHaveProperty("d");
    const key = createPublicKey({ key: jwk, format: "jwk" });
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${header}.${payload}`),
        key,
        Buffer.from(signature!, "base64url"),
      ),
    ).toBe(true);

    const claims = decoded(payload!);
    expect(claims).toMatchObject({
      iss: badge.credential.issuer && (badge.credential.issuer as { id: string }).id,
      jti: badge.credential.id,
      sub: (badge.credential.credentialSubject as { id: string }).id,
      type: ["VerifiableCredential", "OpenBadgeCredential"],
    });
    expect(claims.sub).toMatch(/^urn:uuid:/);
    expect(JSON.stringify(claims)).not.toContain(email);
    expect(JSON.stringify(claims)).not.toContain(row!.userId);

    // The same key signs the next one; another academy gets its own.
    const again = await openBadgeFor(dbs.app.db, tenant, view, { t, email });
    expect(again.jwt).toBe(badge.jwt);
    expect(await issuerPublicKey(dbs.app.db, other, "key-1")).toBeNull();
  });

  it("accepts API keys only for their academy, scope and lifetime", async () => {
    const { id, key } = await createApiKey(dbs.app.db, tenant.id, {
      name: "Migration",
      scopes: ["credentials.import"],
      createdBy: admin,
    });
    expect(
      await authenticateApiKey(dbs.app.db, tenant.id, `Bearer ${key}`, "credentials.import"),
    ).toBe(id);
    expect(
      await authenticateApiKey(dbs.app.db, other.id, `Bearer ${key}`, "credentials.import"),
    ).toBeNull();
    expect(await authenticateApiKey(dbs.app.db, tenant.id, key, "credentials.import")).toBeNull();
    await revokeApiKey(dbs.app.db, tenant.id, id);
    expect(
      await authenticateApiKey(dbs.app.db, tenant.id, `Bearer ${key}`, "credentials.import"),
    ).toBeNull();
  });

  it.skipIf(!hasStorage)(
    "shows a showcase picture publicly only while the page is public",
    async () => {
      const [row] = await withTenant(dbs.app.db, tenant.id, (tx) => tx.select().from(credentials));
      expect(
        await saveShowcase(dbs.app.db, tenant, {
          userId: row!.userId,
          publicId: row!.publicId,
          showcase: { text: "I am now certified in validation.", fileIds: [] },
        }),
      ).toEqual({ ok: false, error: "wording" });

      const png = await sharp({
        create: { width: 40, height: 30, channels: 3, background: "#dd7f6c" },
      })
        .png()
        .toBuffer();
      const picture = await storeFile(dbs.app.db, tenant.id, {
        purpose: "showcase",
        body: new Uint8Array(png),
        name: "board.png",
        ownerUserId: row!.userId,
        createdBy: row!.userId,
        status: "pending",
      });
      expect(
        await saveShowcase(dbs.app.db, tenant, {
          userId: row!.userId,
          publicId: row!.publicId,
          showcase: { text: "Eight interviews, six paid late fees.", fileIds: [picture.id] },
        }),
      ).toEqual({ ok: true });
      expect(await showcasedPublicly(dbs.app.db, tenant.id, picture.id)).toBe(false);
      await withTenant(dbs.app.db, tenant.id, (tx) =>
        tx.update(credentials).set({ visibility: "public" }).where(eq(credentials.id, row!.id)),
      );
      expect(await showcasedPublicly(dbs.app.db, tenant.id, picture.id)).toBe(true);
      // Someone else's upload cannot be put on this page.
      const stranger = await createUser(dbs.owner.db);
      expect(
        await saveShowcase(dbs.app.db, tenant, {
          userId: stranger,
          publicId: row!.publicId,
          showcase: { text: "Mine now", fileIds: [] },
        }),
      ).toEqual({ ok: false, error: "not_found" });

      // Taken off the page, the picture is deleted.
      await saveShowcase(dbs.app.db, tenant, {
        userId: row!.userId,
        publicId: row!.publicId,
        showcase: null,
      });
      const left = await withTenant(dbs.app.db, tenant.id, (tx) =>
        tx.select().from(files).where(eq(files.id, picture.id)),
      );
      expect(left).toEqual([]);
      expect(await showcasedPublicly(dbs.app.db, tenant.id, picture.id)).toBe(false);
    },
  );
});

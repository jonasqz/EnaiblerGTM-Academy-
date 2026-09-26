import { randomUUID } from "node:crypto";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { validateTenantManifest, type TenantManifestInput } from "@/core/tenant/manifest";
import { createDatabase, type Database, type DatabaseHandle } from "@/db/client";
import { user } from "@/db/schema";
import { applyTenantManifest } from "@/db/tenants";

/**
 * DB tests run against a real Postgres prepared with deploy/postgres/init.sh:
 *   TEST_DATABASE_URL            runtime role (enaibler_app), subject to RLS
 *   TEST_DATABASE_MIGRATION_URL  schema owner (enaibler_owner), runs migrations
 * Without them the suite is skipped.
 */
export const hasDatabase = Boolean(
  process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_MIGRATION_URL,
);

export interface TestDatabases {
  app: DatabaseHandle;
  owner: DatabaseHandle;
  close(): Promise<void>;
}

export async function openTestDatabases(): Promise<TestDatabases> {
  const owner = createDatabase(process.env.TEST_DATABASE_MIGRATION_URL!, { max: 2 });
  await migrate(owner.db, { migrationsFolder: new URL("../../drizzle", import.meta.url).pathname });
  const app = createDatabase(process.env.TEST_DATABASE_URL!, { max: 2 });
  return {
    app,
    owner,
    async close() {
      await Promise.all([app.pool.end(), owner.pool.end()]);
    },
  };
}

export function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export function testManifest(
  slug: string,
  extra: Partial<TenantManifestInput> = {},
): TenantManifestInput {
  return {
    tenant: {
      slug,
      domains: [`${slug}.academy.test`],
      locales: ["en", "de"],
      default_locale: "en",
      author_display_name: `${slug} Academy`,
      legal_links: {
        imprint: "https://example.com/imprint",
        privacy: "https://example.com/privacy",
        terms: "https://example.com/terms",
      },
      verification_cta: { label: "Start this course" },
    },
    ...extra,
  };
}

export async function createTenant(
  db: Database,
  extra: Partial<TenantManifestInput> = {},
): Promise<string> {
  const result = validateTenantManifest(testManifest(uniqueSlug("t"), extra));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return (await applyTenantManifest(db, result.manifest)).tenantId;
}

export async function createUser(db: Database): Promise<string> {
  const id = randomUUID();
  await db.insert(user).values({ id, name: "", email: `${id}@learners.test`, emailVerified: true });
  return id;
}

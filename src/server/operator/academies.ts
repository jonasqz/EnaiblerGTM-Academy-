import { createWriteStream } from "node:fs";
import { once } from "node:events";

import { asc, eq, inArray, sql } from "drizzle-orm";
import { strToU8, Zip, ZipDeflate, ZipPassThrough } from "fflate";

import { tenantPrefix } from "@/core/storage/keys";
import type { Database } from "@/db/client";
import { courses, memberships, tenantDomains, tenants, user } from "@/db/schema";
import { withTenant, withUser } from "@/db/tenant-scope";
import {
  deleteUnderPrefix,
  getObjectBytes,
  listUnderPrefix,
  storageConfigured,
} from "@/server/storage";

/*
 * The operator's tasks per academy (docs/deployment.md §12): see them all,
 * suspend one, hand an academy its data, delete it for good. For
 * scripts/academy.ts, run as enaibler_owner; the app never calls these.
 */

export interface AcademySummary {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended";
  domains: string[];
  createdAt: Date;
  /** People with a Studio role. */
  team: number;
  learners: number;
  publishedCourses: number;
}

export async function listAcademies(db: Database): Promise<AcademySummary[]> {
  const rows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      status: tenants.status,
      config: tenants.config,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .orderBy(asc(tenants.createdAt));
  const domains = await db
    .select({ domain: tenantDomains.domain, tenantId: tenantDomains.tenantId })
    .from(tenantDomains);
  const academies: AcademySummary[] = [];
  for (const row of rows) {
    // Row-level security binds the owner too: each academy is counted in its own context.
    const counts = await withTenant(db, row.id, async (tx) => {
      const [people] = await tx
        .select({
          team: sql<number>`(count(distinct ${memberships.userId}) filter (where ${memberships.role} <> 'learner'))::int`,
          learners: sql<number>`(count(distinct ${memberships.userId}) filter (where ${memberships.role} = 'learner'))::int`,
        })
        .from(memberships);
      const [published] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(courses)
        .where(eq(courses.status, "published"));
      return {
        team: people?.team ?? 0,
        learners: people?.learners ?? 0,
        publishedCourses: published?.n ?? 0,
      };
    });
    academies.push({
      id: row.id,
      slug: row.slug,
      name: row.config.author_display_name,
      status: row.status,
      domains: domains.filter((entry) => entry.tenantId === row.id).map((entry) => entry.domain),
      createdAt: row.createdAt,
      ...counts,
    });
  }
  return academies;
}

/** Suspended academies answer 404 on every address (the proxy's tenant cache: 30 s). */
export async function setAcademyStatus(
  db: Database,
  tenantId: string,
  status: "active" | "suspended",
): Promise<void> {
  await db.update(tenants).set({ status }).where(eq(tenants.id, tenantId));
}

/**
 * Left out of an export: sessions and the secrets of the academy's
 * integrations (not its data), the mail outbox and webhook log (transient),
 * the search index over sources (rebuilt from the sources themselves).
 */
export const NOT_EXPORTED: ReadonlySet<string> = new Set([
  "session",
  "issuer_keys",
  "api_keys",
  "webhook_endpoints",
  "webhook_deliveries",
  "domain_claims",
  "notifications",
  "source_chunks",
]);

const README = `An academy's data, exported by enaibler.

academy.json   settings, theme, terminology and addresses
data/*.json    one file per table, every row of this academy (column names as in the database)
data/users.json  the accounts of its team and learners: id, e-mail, name
files/         uploaded files (hand-ins, media, brand assets), when exported with them

Personal data of learners is in here: keep it as safe as the academy itself.
`;

/** Every row (and, on request, every file) of one academy, as a zip for the academy to keep. */
export async function exportAcademy(
  db: Database,
  tenantId: string,
  target: string,
  options: { withFiles: boolean },
): Promise<{ tables: number; rows: number; files: number }> {
  const [academy] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!academy) throw new Error("No such academy");
  const domains = await db
    .select({ domain: tenantDomains.domain })
    .from(tenantDomains)
    .where(eq(tenantDomains.tenantId, tenantId));
  const tables = (
    await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.columns
          where table_schema = 'public' and column_name = 'tenant_id' order by table_name`,
    )
  ).rows
    .map((row) => row.table_name)
    .filter((table) => !NOT_EXPORTED.has(table));
  const data = await withTenant(db, tenantId, async (tx) => {
    const all: Record<string, Array<Record<string, unknown>>> = {};
    for (const table of tables) {
      all[table] = (
        await tx.execute<Record<string, unknown>>(
          sql`select * from ${sql.identifier(table)} where tenant_id = ${tenantId}`,
        )
      ).rows;
    }
    return all;
  });
  const memberIds = [...new Set((data.memberships ?? []).map((row) => String(row.user_id)))];
  const people = memberIds.length
    ? await db
        .select({ id: user.id, email: user.email, name: user.name, createdAt: user.createdAt })
        .from(user)
        .where(inArray(user.id, memberIds))
    : [];

  const out = createWriteStream(target);
  let failure: Error | null = null;
  const zip = new Zip((error, chunk, final) => {
    if (error) failure = error;
    else out.write(chunk);
    if (final || error) out.end();
  });
  const addJson = (name: string, value: unknown) => {
    const entry = new ZipDeflate(name, { level: 6 });
    zip.add(entry);
    entry.push(strToU8(JSON.stringify(value, null, 2)), true);
  };
  addJson("academy.json", { ...academy, domains: domains.map((row) => row.domain) });
  let rows = 0;
  for (const [table, list] of Object.entries(data)) {
    addJson(`data/${table}.json`, list);
    rows += list.length;
  }
  addJson("data/users.json", people);
  let files = 0;
  if (options.withFiles && storageConfigured()) {
    const prefix = tenantPrefix(tenantId);
    for await (const key of listUnderPrefix(tenantId, "")) {
      // Stored as they are: most uploads are compressed already.
      const entry = new ZipPassThrough(`files/${key.slice(prefix.length)}`);
      zip.add(entry);
      entry.push(await getObjectBytes(tenantId, key), true);
      files += 1;
    }
  }
  const readme = new ZipDeflate("README.txt");
  zip.add(readme);
  readme.push(strToU8(README), true);
  zip.end();
  await once(out, "close");
  if (failure) throw failure;
  return { tables: tables.length, rows, files };
}

/**
 * Deletes an academy with everything in it: its files, every row (all
 * academy tables reference tenants ON DELETE CASCADE), and the accounts of
 * people no other academy knows. Irreversible; export first.
 */
export async function deleteAcademy(
  db: Database,
  tenantId: string,
): Promise<{ files: number; accounts: number }> {
  // Who belonged here, before the rows go.
  const members = await withTenant(db, tenantId, (tx) =>
    tx.selectDistinct({ userId: memberships.userId }).from(memberships),
  );
  // Files first: if storage fails, the academy is still whole and the operator can try again.
  const files = storageConfigured() ? await deleteUnderPrefix(tenantId, "") : 0;
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  let accounts = 0;
  for (const { userId } of members) {
    const [remaining] = await withUser(db, userId, (tx) =>
      tx.select({ n: sql<number>`count(*)::int` }).from(memberships),
    );
    if ((remaining?.n ?? 0) === 0) {
      await db.delete(user).where(eq(user.id, userId));
      accounts += 1;
    }
  }
  return { files, accounts };
}

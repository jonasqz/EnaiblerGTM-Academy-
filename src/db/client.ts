import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "@/db/schema";

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything that can run queries: the database or an open transaction. */
export type Queryable = Database | Transaction;

export interface DatabaseHandle {
  db: Database;
  pool: pg.Pool;
}

export function createDatabase(
  connectionString: string,
  options: { max?: number } = {},
): DatabaseHandle {
  const pool = new pg.Pool({ connectionString, max: options.max ?? 10 });
  return { db: drizzle(pool, { schema }), pool };
}

const globalForDb = globalThis as unknown as { __enaiblerDb?: DatabaseHandle };

/**
 * Process-wide database for the app and the worker. Created lazily so that
 * `next build` does not need a database. Connects as the runtime role
 * (DATABASE_URL), never as the schema owner.
 */
export function getDb(): Database {
  if (!globalForDb.__enaiblerDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__enaiblerDb = createDatabase(url);
  }
  return globalForDb.__enaiblerDb.db;
}

/**
 * Superusers and BYPASSRLS roles skip row-level security, which would turn the
 * tenant isolation policies into decoration. Refuse to run like that in
 * production; warn elsewhere.
 */
export async function assertRlsEnforced(
  db: Queryable,
  env: string | undefined = process.env.NODE_ENV,
): Promise<void> {
  const result = await db.execute<{ rolsuper: boolean; rolbypassrls: boolean; rolname: string }>(
    sql`select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
  );
  const role = result.rows[0];
  if (!role || (!role.rolsuper && !role.rolbypassrls)) return;
  const message = `Database role "${role.rolname}" bypasses row-level security. Connect as the app role (see deploy/postgres/init.sh).`;
  if (env === "production") throw new Error(message);
  console.warn(`[enaibler] ${message}`);
}

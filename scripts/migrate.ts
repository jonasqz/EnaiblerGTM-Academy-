/**
 * Applies Drizzle migrations. Runs as the schema owner:
 *   DATABASE_MIGRATION_URL=postgres://enaibler_owner:…@host/enaibler npm run db:migrate
 * The Coolify deployment runs this before starting the web container.
 */
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDatabase } from "@/db/client";
import { reportConnectionProblem } from "@/db/connection-hints";

const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_MIGRATION_URL (schema owner) to run migrations.");
  process.exit(1);
}

const { db, pool } = createDatabase(url, { max: 1 });
try {
  await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  console.log("Migrations applied.");
} catch (error) {
  if (!reportConnectionProblem(error, url)) throw error;
  process.exitCode = 1;
} finally {
  await pool.end();
}

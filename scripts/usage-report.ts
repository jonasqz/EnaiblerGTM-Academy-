/**
 * AI usage and what it cost, per academy and month, for the operator. The
 * academies see their amounts in the Studio (Settings → Usage), never these
 * costs.
 *   npm run usage:report                             the previous full month
 *   npm run usage:report -- --month 2026-09          a calendar month in Berlin time
 *   npm run usage:report -- --month 2026-09 --csv    as CSV, for a spreadsheet
 * Connects like tenant:apply (DATABASE_MIGRATION_URL). FORCE ROW LEVEL
 * SECURITY binds the owner too, so each academy is read in its own context.
 */
import { asc } from "drizzle-orm";

import { isUsageMonth, shiftMonth, usageMonth } from "@/core/usage/ai-usage";
import {
  usageReport,
  usageReportCsv,
  usageReportTable,
  type AcademyUsage,
} from "@/core/usage/report";
import { createDatabase } from "@/db/client";
import { tenants } from "@/db/schema";
import { usageByKind } from "@/server/studio/usage";

function parseArgs(args: readonly string[]): { month: string; csv: boolean } | null {
  let month = shiftMonth(usageMonth(new Date()), -1);
  let csv = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--csv") csv = true;
    else if (arg === "--month") month = args[++index] ?? "";
    else if (arg.startsWith("--month=")) month = arg.slice("--month=".length);
    else return null;
  }
  return isUsageMonth(month) ? { month, csv } : null;
}

// A reader like `| head` may close the pipe early; that is not a failure.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code !== "EPIPE") throw error;
  process.exit(0);
});

const options = parseArgs(process.argv.slice(2));
if (!options) {
  console.error("Usage: usage-report [--month YYYY-MM] [--csv]");
  process.exit(1);
}

const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_MIGRATION_URL or DATABASE_URL.");
  process.exit(1);
}

const { db, pool } = createDatabase(url, { max: 1 });
try {
  const rows = await db
    .select({ id: tenants.id, slug: tenants.slug, config: tenants.config })
    .from(tenants)
    .orderBy(asc(tenants.slug));
  const academies: AcademyUsage[] = [];
  for (const tenant of rows) {
    academies.push({
      slug: tenant.slug,
      name: tenant.config.author_display_name,
      kinds: await usageByKind(db, tenant.id, options.month),
    });
  }
  const report = usageReport(options.month, academies);
  process.stdout.write(options.csv ? usageReportCsv(report) : `${usageReportTable(report)}\n`);
} finally {
  await pool.end();
}

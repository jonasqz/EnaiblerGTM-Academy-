/**
 * The operator's tasks per academy (docs/deployment.md §12):
 *   npm run academy -- list
 *   npm run academy -- suspend <slug>        every address answers 404 within 30 seconds
 *   npm run academy -- resume <slug>
 *   npm run academy -- export <slug> <file.zip> [--with-files]
 *   npm run academy -- delete <slug> --confirm <slug>
 *   npm run academy -- allowance <slug> [25|unlimited|default]   monthly AI allowance in dollars
 *   npm run academy -- storage <slug> [50|unlimited|default]     video storage quota in GB
 * Runs as enaibler_owner (DATABASE_MIGRATION_URL); the S3_* variables for files.
 */
import { formatGb, parseQuota, type QuotaStatus } from "@/core/media/quota";
import { parseAllowance, type AllowanceStatus } from "@/core/usage/allowance";
import { createDatabase } from "@/db/client";
import { findTenantBySlug } from "@/db/tenants";
import {
  deleteAcademy,
  exportAcademy,
  listAcademies,
  setAcademyStatus,
} from "@/server/operator/academies";
import { readAiAllowance, setAiAllowance } from "@/server/ai-allowance";
import { readMediaQuota, setMediaQuota } from "@/server/media/quota";
import { storageConfigured } from "@/server/storage";

const USAGE = `Usage:
  academy list
  academy suspend <slug>
  academy resume <slug>
  academy export <slug> <file.zip> [--with-files]
  academy delete <slug> --confirm <slug>
  academy allowance <slug> [dollars|unlimited|default]
  academy storage <slug> [gigabytes|unlimited|default]`;

const dollars = (microUsd: number) => `$${(microUsd / 1_000_000).toFixed(2)}`;

/** "$25.00 a month (default), $3.10 used in 2026-09 (12 %)" */
function describeAllowance(status: AllowanceStatus): string {
  const kind = status.setting.kind === "amount" ? "own" : status.setting.kind;
  const limit =
    status.allowanceMicroUsd === null ? "no limit" : `${dollars(status.allowanceMicroUsd)} a month`;
  const used = `${dollars(status.spentMicroUsd)} used in ${status.month}`;
  return `${limit} (${kind}), ${used}${status.percentUsed === null ? "" : ` (${status.percentUsed} %)`}`;
}

/** "video storage 50.00 GB (own), 12.30 GB used (24 %)" */
function describeQuota(status: QuotaStatus): string {
  const kind = status.setting.kind === "amount" ? "own" : status.setting.kind;
  const limit = status.quotaBytes === null ? "without limit" : formatGb(status.quotaBytes);
  const used = `${formatGb(status.usedBytes)} used`;
  return `video storage ${limit} (${kind}), ${used}${status.percentUsed === null ? "" : ` (${status.percentUsed} %)`}`;
}

const args = process.argv.slice(2);
const positional: string[] = [];
const flags = new Set<string>();
let confirmed: string | undefined;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index]!;
  if (arg === "--confirm") confirmed = args[(index += 1)];
  else if (arg.startsWith("--")) flags.add(arg);
  else positional.push(arg);
}
const [command, slug, file] = positional;

const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
if (!command || !url) {
  console.error(url ? USAGE : "Set DATABASE_MIGRATION_URL.");
  process.exit(1);
}

const { db, pool } = createDatabase(url, { max: 2 });
try {
  if (command === "list") {
    const academies = await listAcademies(db);
    console.table(
      academies.map((academy) => ({
        slug: academy.slug,
        name: academy.name,
        status: academy.status,
        address: academy.domains.join(", "),
        created: academy.createdAt.toISOString().slice(0, 10),
        team: academy.team,
        learners: academy.learners,
        courses: academy.publishedCourses,
      })),
    );
  } else {
    if (!slug) throw new Error(USAGE);
    const tenant = await findTenantBySlug(db, slug);
    if (!tenant) throw new Error(`No academy with slug "${slug}"`);
    if (command === "suspend" || command === "resume") {
      await setAcademyStatus(db, tenant.id, command === "suspend" ? "suspended" : "active");
      console.log(command === "suspend" ? `✓ ${slug} is suspended` : `✓ ${slug} is active`);
    } else if (command === "export") {
      if (!file) throw new Error(USAGE);
      const withFiles = flags.has("--with-files");
      if (withFiles && !storageConfigured()) throw new Error("Set the S3_* variables for files.");
      const result = await exportAcademy(db, tenant.id, file, { withFiles });
      console.log(
        `✓ ${file}: ${result.rows} rows from ${result.tables} tables${withFiles ? `, ${result.files} files` : ""}`,
      );
    } else if (command === "delete") {
      if (confirmed !== slug) {
        throw new Error(
          `Deleting "${slug}" cannot be undone. Export it first, then repeat with --confirm ${slug}.`,
        );
      }
      if (!storageConfigured()) {
        console.warn("! S3 is not configured: the academy's files stay in the bucket.");
      }
      const result = await deleteAcademy(db, tenant.id);
      console.log(
        `✓ ${slug} deleted: ${result.files} files, ${result.accounts} accounts no other academy knew`,
      );
    } else if (command === "allowance") {
      // The third word is the new value; without it, the allowance is only shown.
      if (file === undefined) {
        const current = await readAiAllowance(db, slug);
        console.log(`${slug}: ${describeAllowance(current!)}`);
      } else {
        const setting = parseAllowance(file);
        if (!setting)
          throw new Error(`"${file}" is not an amount in dollars, "unlimited" or "default".`);
        const updated = await setAiAllowance(db, slug, setting);
        console.log(`✓ ${slug}: ${describeAllowance(updated!)}`);
      }
    } else if (command === "storage") {
      // Like the allowance: the third word is the new quota; without it, the quota is only shown.
      if (file === undefined) {
        console.log(`${slug}: ${describeQuota((await readMediaQuota(db, slug))!)}`);
      } else {
        const setting = parseQuota(file);
        if (!setting)
          throw new Error(`"${file}" is not an amount in gigabytes, "unlimited" or "default".`);
        const updated = await setMediaQuota(db, slug, setting);
        console.log(`✓ ${slug}: ${describeQuota(updated!)}`);
      }
    } else {
      throw new Error(USAGE);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}

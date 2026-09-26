/**
 * Validates a tenant manifest and applies it to the database.
 *   npm run tenant:validate -- config/tenants/scaling-product.yaml
 *   npm run tenant:apply -- config/tenants/scaling-product.yaml
 * Custom domains also need a Coolify domain entry (Traefik + Let's Encrypt);
 * see docs/deployment.md.
 */
import { readFileSync } from "node:fs";

import { parseTenantManifestYaml } from "@/core/tenant/manifest";
import { createDatabase } from "@/db/client";
import { applyTenantManifest } from "@/db/tenants";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const files = args.filter((arg) => !arg.startsWith("--"));

if (files.length === 0) {
  console.error("Usage: tenant-apply [--dry-run] <manifest.yaml> [...]");
  process.exit(1);
}

let failed = false;
const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
const handle = dryRun ? null : url ? createDatabase(url, { max: 1 }) : null;
if (!dryRun && !handle) {
  console.error("Set DATABASE_MIGRATION_URL or DATABASE_URL, or pass --dry-run.");
  process.exit(1);
}

try {
  for (const file of files) {
    const result = parseTenantManifestYaml(readFileSync(file, "utf8"));
    if (!result.ok) {
      failed = true;
      console.error(`✗ ${file}`);
      for (const error of result.errors) console.error(`  - ${error}`);
      continue;
    }
    console.log(`✓ ${file} is valid`);
    for (const warning of result.warnings) console.warn(`  ! ${warning}`);
    if (handle) {
      const applied = await applyTenantManifest(handle.db, result.manifest);
      console.log(`  applied to tenant ${applied.tenantId}`);
      for (const note of applied.notes) console.log(`  · ${note}`);
    }
  }
} finally {
  await handle?.pool.end();
}

process.exit(failed ? 1 : 0);

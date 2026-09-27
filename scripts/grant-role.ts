/**
 * Grants (or with --revoke, removes) a Studio role in one academy.
 *   npm run role:grant -- <tenant-slug> <email> <author|reviewer|mentor|tenant_admin>
 *   npm run role:grant -- scaling-product team@scaling-product.com tenant_admin
 * An address that never signed in gets an account; the person then signs in
 * with a magic link as usual. Learner memberships are created on sign-in.
 */
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { isMembershipRole } from "@/core/access/roles";
import { createDatabase } from "@/db/client";
import { memberships, user } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantBySlug } from "@/db/tenants";

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const [slug, rawEmail, role] = args.filter((arg) => !arg.startsWith("--"));
const email = rawEmail?.trim().toLowerCase();

if (
  !slug ||
  !email ||
  !role ||
  !isMembershipRole(role) ||
  role === "learner" ||
  !email.includes("@")
) {
  console.error(
    "Usage: role:grant [--revoke] <tenant-slug> <email> <author|reviewer|mentor|tenant_admin>",
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL.");
  process.exit(1);
}

const { db, pool } = createDatabase(url, { max: 1 });
try {
  const tenant = await findTenantBySlug(db, slug);
  if (!tenant) throw new Error(`No academy with slug "${slug}"`);

  let [account] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!account && !revoke) {
    [account] = await db
      .insert(user)
      .values({ id: randomUUID(), name: "", email })
      .returning({ id: user.id });
    console.log(`· created an account for ${email}`);
  }
  if (!account) throw new Error(`No account for ${email}`);
  const userId = account.id;

  await withTenant(db, tenant.id, async (tx) => {
    if (revoke) {
      await tx
        .delete(memberships)
        .where(and(eq(memberships.userId, userId), eq(memberships.role, role)));
    } else {
      await tx
        .insert(memberships)
        .values({ tenantId: tenant.id, userId, role })
        .onConflictDoNothing();
    }
  });
  console.log(
    `✓ ${email} ${revoke ? "no longer has" : "has"} the role ${role} in ${tenant.slug}. Studio: /studio`,
  );
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

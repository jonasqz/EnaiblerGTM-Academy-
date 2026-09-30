/**
 * Grants (or with --revoke, removes) a Studio role in one academy.
 *   npm run role:grant -- <tenant-slug> <email> <author|reviewer|mentor|tenant_admin>
 *   npm run role:grant -- scaling-product team@scaling-product.com tenant_admin
 * An address that never signed in gets an account; the person then signs in
 * with a magic link as usual. Learner memberships are created on sign-in.
 * Admins invite colleagues themselves in Studio → Settings → Team, which
 * mails them; this is the operators' way in, and it mails nobody.
 */
import { isTeamRole, teamEmail } from "@/core/access/team";
import { createDatabase } from "@/db/client";
import { reportConnectionProblem } from "@/db/connection-hints";
import { findTenantBySlug } from "@/db/tenants";
import { ensureAccount, findAccount, grantRole, revokeRole } from "@/server/team";

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const [slug, rawEmail, role] = args.filter((arg) => !arg.startsWith("--"));
const email = teamEmail(rawEmail ?? "");

if (!slug || !email || !role || !isTeamRole(role)) {
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

  let userId = await findAccount(db, email);
  if (!userId && !revoke) {
    userId = (await ensureAccount(db, email)).userId;
    console.log(`· created an account for ${email}`);
  }
  if (!userId) throw new Error(`No account for ${email}`);

  if (revoke) {
    const result = await revokeRole(db, tenant.id, userId, role);
    if (!result.ok) {
      throw new Error(
        `${email} is the last admin of ${tenant.slug}; make someone else admin first`,
      );
    }
  } else {
    await grantRole(db, tenant.id, userId, role);
  }
  console.log(
    `✓ ${email} ${revoke ? "no longer has" : "has"} the role ${role} in ${tenant.slug}. Studio: /studio`,
  );
} catch (error) {
  if (!reportConnectionProblem(error, url)) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}

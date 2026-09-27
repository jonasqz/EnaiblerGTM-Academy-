import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { Locale } from "@/core/i18n/locales";
import { academySlugIssue } from "@/core/platform/academy-slug";
import type { TenantContext } from "@/core/tenant/context";
import { validateTenantManifest } from "@/core/tenant/manifest";
import type { Database } from "@/db/client";
import { memberships, tenantAgreements, tenantDomains, tenants, user } from "@/db/schema";
import { setTenantContext } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import { clearTenantCache } from "@/server/tenant-resolver";

/*
 * Self-serve academies. Creating one is a database write in the running
 * deployment: a tenant, its <slug>.<academy domain> address, the first admin
 * and the accepted agreements. It never updates an existing academy, so a
 * signup cannot take over someone else's slug (manifests are the operator
 * path for that, see tenant:apply).
 */

export interface NewAcademy {
  name: string;
  slug: string;
  email: string;
  /** Languages the academy offers; the first one is the default. */
  locales: Locale[];
  website: string | null;
  agreements: Array<{ kind: "terms" | "dpa"; version: string; wording: string }>;
}

export type CreateAcademyResult =
  | { ok: true; tenant: TenantContext; userId: string }
  | {
      ok: false;
      error: "slug_invalid" | "slug_reserved" | "slug_taken" | "invalid";
      messages?: string[];
    };

class AddressTaken extends Error {}

export async function createAcademy(
  db: Database,
  input: NewAcademy,
  academyDomain: string,
): Promise<CreateAcademyResult> {
  const issue = academySlugIssue(input.slug);
  if (issue) return { ok: false, error: issue === "reserved" ? "slug_reserved" : "slug_invalid" };

  // The same validation as a manifest: wording lint on the name, domain rules, defaults.
  const validation = validateTenantManifest({
    tenant: {
      slug: input.slug,
      domains: [`${input.slug}.${academyDomain}`],
      locales: input.locales,
      default_locale: input.locales[0],
      author_display_name: input.name,
      ...(input.website ? { website: input.website } : {}),
      verification_cta: { label: { en: "Start this course", de: "Kurs starten" } },
    },
  });
  if (!validation.ok) return { ok: false, error: "invalid", messages: validation.errors };
  const { slug, domains, ...config } = validation.manifest.tenant;

  let created: { tenantId: string; userId: string };
  try {
    created = await db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({ slug, config, theme: null, terminology: validation.manifest.terminology })
        .onConflictDoNothing({ target: tenants.slug })
        .returning({ id: tenants.id });
      if (!tenant) throw new AddressTaken();
      const domain = await tx
        .insert(tenantDomains)
        .values({ domain: domains[0]!, tenantId: tenant.id, isPrimary: true })
        .onConflictDoNothing()
        .returning({ domain: tenantDomains.domain });
      if (domain.length === 0) throw new AddressTaken();

      let [account] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, input.email));
      account ??= (
        await tx
          .insert(user)
          .values({ id: randomUUID(), name: "", email: input.email })
          .returning({ id: user.id })
      )[0];

      // Tenant data from here on: same transaction, under RLS for the new academy.
      await setTenantContext(tx, tenant.id);
      await tx
        .insert(memberships)
        .values({ tenantId: tenant.id, userId: account!.id, role: "tenant_admin" });
      await tx.insert(tenantAgreements).values(
        input.agreements.map((agreement) => ({
          tenantId: tenant.id,
          ...agreement,
          acceptedBy: account!.id,
        })),
      );
      return { tenantId: tenant.id, userId: account!.id };
    });
  } catch (error) {
    if (error instanceof AddressTaken) return { ok: false, error: "slug_taken" };
    throw error;
  }

  // A visit before the academy existed may have cached a miss for its host.
  clearTenantCache();
  const tenant = await findTenantById(db, created.tenantId);
  return { ok: true, tenant: tenant!, userId: created.userId };
}

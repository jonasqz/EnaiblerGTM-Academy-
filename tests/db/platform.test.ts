import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { memberships, tenantAgreements, tenantDomains, user } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import { createAcademy, type NewAcademy } from "@/server/platform/academies";
import { updateAcademySettings, updateAcademyTheme } from "@/server/studio/academy";

import { hasDatabase, openTestDatabases, uniqueSlug, type TestDatabases } from "./helpers";

const agreements: NewAcademy["agreements"] = [
  { kind: "terms", version: "2026-09", wording: "I accept the terms of use and the DPA." },
  { kind: "dpa", version: "2026-09", wording: "I accept the terms of use and the DPA." },
];

function academy(slug: string, email: string, extra: Partial<NewAcademy> = {}): NewAcademy {
  return {
    name: "Acme Sales Academy",
    slug,
    email,
    locales: ["de", "en"],
    website: null,
    agreements,
    ...extra,
  };
}

describe.skipIf(!hasDatabase)("self-serve academies", () => {
  let dbs: TestDatabases;

  beforeAll(async () => {
    dbs = await openTestDatabases();
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("creates an academy with its subdomain, first admin and accepted agreements", async () => {
    const slug = uniqueSlug("acme");
    const email = `${slug}@example.test`;
    const result = await createAcademy(
      dbs.app.db,
      academy(slug, email, { website: "https://acme.example" }),
      "academies.test",
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.tenant).toMatchObject({
      slug,
      status: "active",
      primaryDomain: `${slug}.academies.test`,
      settings: {
        author_display_name: "Acme Sales Academy",
        locales: ["de", "en"],
        default_locale: "de",
        website: "https://acme.example",
        legal_links: {},
      },
    });

    const [domain] = await dbs.app.db
      .select()
      .from(tenantDomains)
      .where(eq(tenantDomains.tenantId, result.tenant.id));
    expect(domain).toMatchObject({ domain: `${slug}.academies.test`, isPrimary: true });

    const [account] = await dbs.app.db.select().from(user).where(eq(user.email, email));
    expect(account?.id).toBe(result.userId);
    const rows = await withTenant(dbs.app.db, result.tenant.id, async (tx) => ({
      roles: await tx.select({ role: memberships.role }).from(memberships),
      agreements: await tx.select().from(tenantAgreements),
    }));
    expect(rows.roles).toEqual([{ role: "tenant_admin" }]);
    expect(rows.agreements.map((row) => [row.kind, row.version, row.acceptedBy])).toEqual([
      ["terms", "2026-09", result.userId],
      ["dpa", "2026-09", result.userId],
    ]);
  });

  it("never takes over an existing address", async () => {
    const slug = uniqueSlug("taken");
    const first = await createAcademy(
      dbs.app.db,
      academy(slug, `${slug}-a@example.test`),
      "academies.test",
    );
    expect(first.ok).toBe(true);
    const second = await createAcademy(
      dbs.app.db,
      academy(slug, `${slug}-b@example.test`, { name: "Someone Else" }),
      "academies.test",
    );
    expect(second).toEqual({ ok: false, error: "slug_taken" });
    if (!first.ok) return;
    const [stored] = await dbs.app.db
      .select()
      .from(user)
      .where(eq(user.email, `${slug}-b@example.test`));
    expect(stored).toBeUndefined();
  });

  it("refuses reserved addresses and names that promise a qualification", async () => {
    expect(
      await createAcademy(dbs.app.db, academy("studio", "x@example.test"), "academies.test"),
    ).toEqual({
      ok: false,
      error: "slug_reserved",
    });
    const certified = await createAcademy(
      dbs.app.db,
      academy(uniqueSlug("cert"), "y@example.test", { name: "Certified Sales Academy" }),
      "academies.test",
    );
    expect(certified).toMatchObject({ ok: false, error: "invalid" });
  });

  it("lets the academy's admin change settings and brand, with the manifest rules", async () => {
    const created = await createAcademy(
      dbs.app.db,
      academy(uniqueSlug("brand"), `${uniqueSlug("a")}@example.test`),
      "academies.test",
    );
    if (!created.ok) throw new Error(created.error);
    const tenant = created.tenant;
    const saved = await updateAcademySettings(dbs.app.db, tenant, {
      name: "Acme Growth Academy",
      locales: ["en", "de"],
      defaultLocale: "en",
      website: "https://acme.example",
      legalLinks: {
        imprint: "https://acme.example/imprint",
        privacy: "https://acme.example/privacy",
      },
      ctaLabel: { en: "Join us", de: "Mach mit" },
    });
    expect(saved.ok).toBe(true);
    const reloaded = await findTenantById(dbs.app.db, tenant.id);
    expect(reloaded?.settings).toMatchObject({
      author_display_name: "Acme Growth Academy",
      default_locale: "en",
      legal_links: { imprint: "https://acme.example/imprint" },
      verification_cta: { label: { en: "Join us", de: "Mach mit" } },
    });

    const refused = await updateAcademySettings(dbs.app.db, reloaded!, {
      name: "Acme Certified Academy",
      locales: ["en"],
      defaultLocale: "en",
      website: null,
      legalLinks: {},
      ctaLabel: { en: "Join us" },
    });
    expect(refused.ok).toBe(false);

    const theme = {
      colors: {
        ink: "#14213d",
        surface: "#f4f1ea",
        card: "#ffffff",
        primary: "#0f7b6c",
        accents: [],
      },
      fonts: { display: "Merriweather", body: "Montserrat" },
      radius: "12px",
      border_width: "1px",
      shadow: { x: "0px", y: "8px", blur: "24px", color: "#14213d1f" },
      visual_style: "soft" as const,
    };
    expect((await updateAcademyTheme(dbs.app.db, tenant, theme)).ok).toBe(true);
    expect((await findTenantById(dbs.app.db, tenant.id))?.theme.fonts.display).toBe("Merriweather");
    const unreadable = await updateAcademyTheme(dbs.app.db, tenant, {
      ...theme,
      colors: { ...theme.colors, ink: "#eeeeee" },
    });
    expect(unreadable.ok).toBe(false);
    expect((await updateAcademyTheme(dbs.app.db, tenant, null)).ok).toBe(true);
    expect((await findTenantById(dbs.app.db, tenant.id))?.theme.fonts.display).toBe("Inter");
  });

  it("reuses the account of someone who already has one", async () => {
    const email = `${uniqueSlug("owner")}@example.test`;
    const one = await createAcademy(
      dbs.app.db,
      academy(uniqueSlug("one"), email),
      "academies.test",
    );
    const two = await createAcademy(
      dbs.app.db,
      academy(uniqueSlug("two"), email),
      "academies.test",
    );
    if (!one.ok || !two.ok) throw new Error("not created");
    expect(two.userId).toBe(one.userId);
    expect(two.tenant.id).not.toBe(one.tenant.id);
  });
});

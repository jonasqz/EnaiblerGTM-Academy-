import { and, eq, inArray, notInArray } from "drizzle-orm";

import type { TenantContext } from "@/core/tenant/context";
import {
  tenantSettingsSchema,
  terminologySchema,
  type TenantManifest,
} from "@/core/tenant/manifest";
import { DEFAULT_THEME } from "@/core/theme/enaibler-tokens";
import { themeSchema } from "@/core/theme/schema";
import type { Database, Queryable, Transaction } from "@/db/client";
import { courses, levelSchemes, pathCourses, paths, tenantDomains, tenants } from "@/db/schema";
import type { StoredTenantConfig } from "@/db/schema/tenancy";
import { setTenantContext } from "@/db/tenant-scope";

type TenantRow = typeof tenants.$inferSelect;

/** Parses a stored tenant into its runtime context (re-validates, fills new defaults). */
export function tenantContextFromRow(
  row: TenantRow,
  domains: ReadonlyArray<{ domain: string; isPrimary: boolean }>,
): TenantContext {
  const ordered = [...domains].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const settings = tenantSettingsSchema.parse({
    ...row.config,
    slug: row.slug,
    domains: ordered.map((entry) => entry.domain),
  });
  const [primaryDomain] = settings.domains;
  if (!primaryDomain) throw new Error(`Tenant ${row.slug} has no domains`);
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    settings,
    theme: row.theme ? themeSchema.parse(row.theme) : DEFAULT_THEME,
    terminology: terminologySchema.parse(row.terminology ?? {}),
    primaryDomain,
  };
}

async function loadContext(
  db: Queryable,
  row: TenantRow | undefined,
): Promise<TenantContext | null> {
  if (!row) return null;
  const domains = await db
    .select({ domain: tenantDomains.domain, isPrimary: tenantDomains.isPrimary })
    .from(tenantDomains)
    .where(eq(tenantDomains.tenantId, row.id));
  return tenantContextFromRow(row, domains);
}

export async function findTenantByDomain(
  db: Queryable,
  domain: string,
): Promise<TenantContext | null> {
  const [row] = await db
    .select({ tenant: tenants })
    .from(tenantDomains)
    .innerJoin(tenants, eq(tenants.id, tenantDomains.tenantId))
    .where(eq(tenantDomains.domain, domain))
    .limit(1);
  return loadContext(db, row?.tenant);
}

export async function findTenantBySlug(db: Queryable, slug: string): Promise<TenantContext | null> {
  const [row] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  return loadContext(db, row);
}

export async function findTenantById(db: Queryable, id: string): Promise<TenantContext | null> {
  const [row] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  return loadContext(db, row);
}

export async function listTenantDomains(db: Queryable): Promise<string[]> {
  const rows = await db.select({ domain: tenantDomains.domain }).from(tenantDomains);
  return rows.map((row) => row.domain);
}

export interface ApplyResult {
  tenantId: string;
  created: boolean;
  notes: string[];
}

/**
 * Applies a validated tenant manifest (brief Appendix A) declaratively:
 * tenant settings, theme, terminology, domains, paths, level scheme and course
 * shells, in one transaction. Never deletes courses or paths (they may carry authored content)
 * and leaves a path's course order alone when the manifest does not set one.
 */
export async function applyTenantManifest(
  db: Database,
  manifest: TenantManifest,
): Promise<ApplyResult> {
  const { slug, domains, ...config } = manifest.tenant;
  const storedConfig: StoredTenantConfig = config;
  const notes: string[] = [];

  const tenantId = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug));
    const values = {
      config: storedConfig,
      theme: manifest.theme ?? null,
      terminology: manifest.terminology,
    };
    const id = existing
      ? (
          await tx
            .update(tenants)
            .set(values)
            .where(eq(tenants.id, existing.id))
            .returning({ id: tenants.id })
        )[0]!.id
      : (
          await tx
            .insert(tenants)
            .values({ slug, ...values })
            .returning({ id: tenants.id })
        )[0]!.id;
    if (!existing) notes.push(`Created tenant ${slug}.`);

    await syncDomains(tx, id, domains);

    // Everything below is tenant data: same transaction, now under RLS for this tenant.
    await setTenantContext(tx, id);
    await syncCatalog(tx, id, manifest, notes);
    return id;
  });

  return { tenantId, created: notes.some((note) => note.startsWith("Created")), notes };
}

async function syncDomains(
  tx: Transaction,
  tenantId: string,
  domains: readonly string[],
): Promise<void> {
  const taken = await tx
    .select({ domain: tenantDomains.domain, tenantId: tenantDomains.tenantId })
    .from(tenantDomains)
    .where(inArray(tenantDomains.domain, [...domains]));
  const conflict = taken.find((entry) => entry.tenantId !== tenantId);
  if (conflict) throw new Error(`Domain ${conflict.domain} already belongs to another tenant`);

  await tx
    .delete(tenantDomains)
    .where(
      and(eq(tenantDomains.tenantId, tenantId), notInArray(tenantDomains.domain, [...domains])),
    );
  // Clear the primary flag first so the partial unique index never sees two primaries.
  await tx
    .update(tenantDomains)
    .set({ isPrimary: false })
    .where(eq(tenantDomains.tenantId, tenantId));
  for (const [index, domain] of domains.entries()) {
    await tx
      .insert(tenantDomains)
      .values({ domain, tenantId, isPrimary: index === 0 })
      .onConflictDoUpdate({ target: tenantDomains.domain, set: { isPrimary: index === 0 } });
  }
}

async function syncCatalog(
  tx: Transaction,
  tenantId: string,
  manifest: TenantManifest,
  notes: string[],
): Promise<void> {
  const courseIds = new Map<string, string>();
  for (const course of manifest.courses) {
    const [row] = await tx
      .insert(courses)
      .values({
        tenantId,
        slug: course.slug,
        title: course.title ?? { en: course.slug },
        languages: course.languages ?? [...manifest.tenant.locales],
        deliveryMode: course.delivery_mode,
        estMinutes: course.est_minutes,
        plannedLaunch: course.launch,
        completionMode: course.completion,
      })
      .onConflictDoUpdate({
        target: [courses.tenantId, courses.slug],
        // Only what the manifest owns; titles and content set by authors stay.
        set: {
          deliveryMode: course.delivery_mode,
          plannedLaunch: course.launch ?? null,
          ...(course.title ? { title: course.title } : {}),
          ...(course.languages ? { languages: course.languages } : {}),
          ...(course.est_minutes ? { estMinutes: course.est_minutes } : {}),
          // The mode only: the Studio adds the assignment or the test when authors set them up.
          ...(course.completion ? { completionMode: course.completion } : {}),
        },
      })
      .returning({ id: courses.id });
    courseIds.set(course.slug, row!.id);
  }

  for (const [position, path] of manifest.paths.entries()) {
    const [row] = await tx
      .insert(paths)
      .values({
        tenantId,
        slug: path.slug,
        title: path.title,
        promise: path.promise,
        color: path.color,
        visual: path.visual,
        position,
      })
      .onConflictDoUpdate({
        target: [paths.tenantId, paths.slug],
        set: {
          title: path.title,
          promise: path.promise ?? null,
          color: path.color ?? null,
          visual: path.visual ?? null,
          position,
        },
      })
      .returning({ id: paths.id });
    const pathId = row!.id;
    if (path.courses.length > 0) {
      await tx.delete(pathCourses).where(eq(pathCourses.pathId, pathId));
      await tx.insert(pathCourses).values(
        path.courses.map((courseSlug, index) => ({
          tenantId,
          pathId,
          courseId: courseIds.get(courseSlug)!,
          position: index,
        })),
      );
    }
  }

  const manifestPaths = new Set(manifest.paths.map((path) => path.slug));
  const extra = (await tx.select({ slug: paths.slug }).from(paths)).filter(
    (row) => !manifestPaths.has(row.slug),
  );
  if (extra.length > 0)
    notes.push(`Paths not in the manifest were kept: ${extra.map((row) => row.slug).join(", ")}.`);

  if (manifest.levels.length > 0) {
    await tx
      .insert(levelSchemes)
      .values({ tenantId, levels: manifest.levels })
      .onConflictDoUpdate({ target: levelSchemes.tenantId, set: { levels: manifest.levels } });
  } else {
    await tx.delete(levelSchemes).where(eq(levelSchemes.tenantId, tenantId));
  }
}

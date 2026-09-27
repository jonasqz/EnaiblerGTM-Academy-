import { and, eq, gte, lt, sql, type AnyColumn, type SQL } from "drizzle-orm";

import {
  AiAllowanceUsedUp,
  allowanceFromColumn,
  allowanceLeft,
  allowanceStatus,
  allowanceToColumn,
  countedMicroUsd,
  effectiveAllowance,
  parseAllowanceConfig,
  type AllowanceConfig,
  type AllowanceRates,
  type AllowanceSetting,
  type AllowanceStatus,
} from "@/core/usage/allowance";
import { monthRange, usageMonth } from "@/core/usage/ai-usage";
import type { Database, Queryable, Transaction } from "@/db/client";
import { aiUsage, tenants } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";

/*
 * The monthly AI allowance (core/usage/allowance). The metering path
 * (server/ai-usage.ts) asks admitAiCall before every model call, so no caller
 * can skip it. The worker and the operator's scripts use this module too,
 * hence no "server-only".
 */

/** Read by name, not through env(): the worker and the scripts have no auth secret. */
export function allowanceConfig(): AllowanceConfig {
  return parseAllowanceConfig({
    AI_MONTHLY_ALLOWANCE_USD: process.env.AI_MONTHLY_ALLOWANCE_USD,
    AI_UNPRICED_CALL_USD: process.env.AI_UNPRICED_CALL_USD,
  });
}

/** tenants is global: the operator's setting is read without a tenant context. */
async function settingOf(db: Queryable, tenantId: string): Promise<AllowanceSetting> {
  const [row] = await db
    .select({ allowance: tenants.aiAllowanceMicroUsd })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  return allowanceFromColumn(row?.allowance ?? null);
}

/** No price: none reported, or transcription on our own Whisper, which records 0. */
const unpriced = sql`(${aiUsage.costMicroUsd} is null or (${aiUsage.kind} = 'transcription' and ${aiUsage.costMicroUsd} = 0))`;

const totalWhere = (column: AnyColumn, condition: SQL) =>
  sql`coalesce(sum(${column}) filter (where ${condition}), 0)`.mapWith(Number);

/** The academy's month as the allowance counts it: one aggregate over its usage rows. */
async function monthSpend(
  tx: Transaction,
  tenantId: string,
  month: string,
  rates: AllowanceRates,
): Promise<number> {
  const range = monthRange(month);
  const [row] = await tx
    .select({
      pricedMicroUsd: totalWhere(aiUsage.costMicroUsd, sql`not ${unpriced}`),
      unpricedCalls: totalWhere(
        aiUsage.calls,
        sql`${unpriced} and coalesce(${aiUsage.audioSeconds}, 0) = 0`,
      ),
      unpricedAudioSeconds: totalWhere(
        aiUsage.audioSeconds,
        sql`${unpriced} and ${aiUsage.audioSeconds} > 0`,
      ),
    })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.tenantId, tenantId),
        gte(aiUsage.createdAt, range.from),
        lt(aiUsage.createdAt, range.to),
      ),
    );
  return row ? countedMicroUsd(row, rates) : 0;
}

/**
 * Before every model call: throws AiAllowanceUsedUp once the academy has
 * spent its allowance for the month. Without a limit this is one lookup of
 * the academy; with one, an aggregate over the month's usage more.
 */
export async function admitAiCall(
  db: Database,
  tenantId: string,
  now: Date = new Date(),
): Promise<void> {
  const config = allowanceConfig();
  const allowance = effectiveAllowance(await settingOf(db, tenantId), config.defaultMicroUsd);
  if (allowance === null) return;
  const spent = await withTenant(db, tenantId, (tx) =>
    monthSpend(tx, tenantId, usageMonth(now), config.rates),
  );
  if (!allowanceLeft(spent, allowance)) throw new AiAllowanceUsedUp();
}

/**
 * An academy's allowance for a month (this one by default) and what the month
 * counted against it. The Studio shows only the percentage and the date it
 * resets; amounts are for the operator.
 */
export async function aiAllowanceStatus(
  db: Database,
  tenantId: string,
  month: string = usageMonth(new Date()),
): Promise<AllowanceStatus> {
  const config = allowanceConfig();
  const setting = await settingOf(db, tenantId);
  const spentMicroUsd = await withTenant(db, tenantId, (tx) =>
    monthSpend(tx, tenantId, month, config.rates),
  );
  return allowanceStatus({
    month,
    setting,
    platformDefaultMicroUsd: config.defaultMicroUsd,
    spentMicroUsd,
  });
}

export interface AcademyAllowance extends AllowanceStatus {
  slug: string;
}

/** For the operator's CLI: the academy's allowance this month and its spend so far; null for an unknown slug. */
export async function readAiAllowance(
  db: Database,
  slug: string,
): Promise<AcademyAllowance | null> {
  const [row] = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.slug, slug));
  return row ? { slug: row.slug, ...(await aiAllowanceStatus(db, row.id)) } : null;
}

/**
 * For the operator's CLI: an amount (parseAllowance reads "25", "default" or
 * "unlimited"), read back with this month's spend; null for an unknown slug.
 * Takes effect with the next model call.
 */
export async function setAiAllowance(
  db: Database,
  slug: string,
  setting: AllowanceSetting,
): Promise<AcademyAllowance | null> {
  const [row] = await db
    .update(tenants)
    .set({ aiAllowanceMicroUsd: allowanceToColumn(setting) })
    .where(eq(tenants.slug, slug))
    .returning({ id: tenants.id });
  return row ? readAiAllowance(db, slug) : null;
}

import { toMicroUsd, type AiUsageKind } from "@/core/usage/ai-usage";
import type { Database } from "@/db/client";
import { aiUsage } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { admitAiCall } from "@/server/ai-allowance";
import type { LlmCaller } from "@/server/llm";
import { reportError } from "@/server/observability/report";

/*
 * Metering (core/usage/ai-usage): every model call an academy causes is
 * recorded right after it returns, in a transaction of its own, so a run that
 * fails later still counts. Recording never fails the work it measures. The
 * academy's monthly allowance (server/ai-allowance.ts) is checked before each
 * call, here, so that no caller can forget it.
 */

export interface UsageScope {
  tenantId: string;
  kind: AiUsageKind;
  courseId?: string | null;
  /** The submission, run, source or draft the call was for. */
  refId?: string | null;
}

export interface UsageAmount {
  model: string | null;
  calls?: number;
  tokensIn?: number | null;
  tokensOut?: number | null;
  audioSeconds?: number | null;
  /** US dollars as the gateway reports them; null when it does not know the price. */
  cost: number | null;
}

export async function recordAiUsage(
  db: Database,
  scope: UsageScope,
  amount: UsageAmount,
): Promise<void> {
  try {
    await withTenant(db, scope.tenantId, (tx) =>
      tx.insert(aiUsage).values({
        tenantId: scope.tenantId,
        kind: scope.kind,
        model: amount.model,
        courseId: scope.courseId ?? null,
        refId: scope.refId ?? null,
        calls: amount.calls ?? 1,
        tokensIn: amount.tokensIn ?? null,
        tokensOut: amount.tokensOut ?? null,
        audioSeconds:
          amount.audioSeconds === null || amount.audioSeconds === undefined
            ? null
            : Math.round(amount.audioSeconds),
        costMicroUsd: toMicroUsd(amount.cost),
      }),
    );
  } catch (error) {
    await reportError(error, {
      // Next sets NEXT_RUNTIME; the worker runs without it.
      runtime: process.env.NEXT_RUNTIME ? "web" : "worker",
      extra: { usage: scope.kind, tenantId: scope.tenantId },
    });
  }
}

/** Services outside LlmCaller (Whisper, embeddings) admit each request before it and record it after. */
export interface UsageMeter {
  /** Throws AiAllowanceUsedUp once the academy's allowance for the month is used up. */
  admit(): Promise<void>;
  record(amount: UsageAmount): Promise<void>;
}

/** Meters each request a service makes for this academy. */
export function usageMeter(db: Database, scope: UsageScope): UsageMeter {
  return {
    admit: () => admitAiCall(db, scope.tenantId),
    record: (amount) => recordAiUsage(db, scope, amount),
  };
}

/** The same caller, admitting and recording each call it makes for this academy. */
export function meteredLlm(db: Database, llm: LlmCaller, scope: UsageScope): LlmCaller {
  return async (options) => {
    await admitAiCall(db, scope.tenantId);
    const result = await llm(options);
    await recordAiUsage(db, scope, {
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      cost: result.cost,
    });
    return result;
  };
}

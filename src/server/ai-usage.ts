import { toMicroUsd, type AiUsageKind } from "@/core/usage/ai-usage";
import type { Database } from "@/db/client";
import { aiUsage } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import type { LlmCaller } from "@/server/llm";
import { reportError } from "@/server/observability/report";

/*
 * Metering (core/usage/ai-usage): every model call an academy causes is
 * recorded right after it returns, in a transaction of its own, so a run that
 * fails later still counts. Recording never fails the work it measures.
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

/** Told what one request used; services outside LlmCaller (Whisper, embeddings) report through it. */
export type UsageCallback = (amount: UsageAmount) => Promise<void>;

/** Records each request a service reports for this academy. */
export function usageRecorder(db: Database, scope: UsageScope): UsageCallback {
  return (amount) => recordAiUsage(db, scope, amount);
}

/** The same caller, recording each call it makes for this academy. */
export function meteredLlm(db: Database, llm: LlmCaller, scope: UsageScope): LlmCaller {
  return async (options) => {
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

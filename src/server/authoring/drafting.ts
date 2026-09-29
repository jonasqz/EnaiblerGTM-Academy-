import { and, asc, eq } from "drizzle-orm";

import { JobFailure, jobErrorCode, type JobError } from "@/core/authoring/job-errors";
import { sourceSections, type SourceSection } from "@/core/authoring/sections";
import type { Database } from "@/db/client";
import { sources } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import type { AuthoringModel } from "@/server/authoring/model";
import { log } from "@/server/observability/log";

/*
 * What the AI drafts from sources share (quiz questions, the assignment, the
 * coverage map, the FAQ lesson): the course's ready sources as sections, and
 * one structured-output call whose answer is validated, tried twice.
 * Callers pass a metered model (server/ai-usage), so every call counts
 * against the academy's allowance and AiAllowanceUsedUp stops them.
 */

/** Every ready source of the course, as sections in the order they were added. */
export async function loadSourceSections(
  db: Database,
  tenantId: string,
  courseId: string,
): Promise<SourceSection[]> {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .select({
        id: sources.id,
        title: sources.title,
        kind: sources.kind,
        transcript: sources.transcript,
        content: sources.content,
      })
      .from(sources)
      .where(and(eq(sources.courseId, courseId), eq(sources.status, "ready")))
      .orderBy(asc(sources.createdAt)),
  );
  return rows.flatMap(sourceSections);
}

export interface JsonRequest<T> {
  prompt: { system: string; user: string };
  jsonSchema: { name: string; strict: boolean; schema: Record<string, unknown> };
  purpose: string;
  promptVersion: string;
  temperature: number;
  maxTokens: number;
  /** Null when the answer is not usable; the call is tried once more. */
  parse: (content: string) => T | null;
}

/** The model's answer, validated; null when neither try gave a usable one. Errors pass through. */
export async function askForJson<T>(
  model: AuthoringModel,
  request: JsonRequest<T>,
): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const call = await model.llm({
      model: model.model,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      jsonSchema: request.jsonSchema,
      metadata: { purpose: request.purpose, prompt_version: request.promptVersion },
      messages: [
        { role: "system", content: request.prompt.system },
        { role: "user", content: request.prompt.user },
      ],
    });
    const parsed = request.parse(call.content);
    if (parsed !== null) return parsed;
  }
  return null;
}

/** Why a draft failed, as a code the Studio words; unexpected errors are logged. */
export function draftFailure(error: unknown, purpose: string): JobError {
  if (!(error instanceof JobFailure)) log.warn("authoring draft failed", { purpose, error });
  return jobErrorCode(error, "gateway_failed");
}

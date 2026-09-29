import { requiresTest, requiresWork, type CompletionMode } from "@/core/courses/completion";

/**
 * What a credential rests on (webinar brief §2.6): the reviewed work, the
 * passed quiz (the final test), the live sessions attended, and sessions
 * caught up on as a recording. Stored at issue, so the page stays honest
 * however the course changes later.
 */
export const CREDENTIAL_EVIDENCE = ["artifact", "quiz", "attendance", "relive"] as const;
export type CredentialEvidence = (typeof CREDENTIAL_EVIDENCE)[number];

export function isCredentialEvidence(value: unknown): value is CredentialEvidence {
  return typeof value === "string" && (CREDENTIAL_EVIDENCE as readonly string[]).includes(value);
}

/** The evidence of a credential earned this way, in a fixed order. */
export function evidenceFor(
  basis: CompletionMode,
  sessions: ReadonlyArray<"attendance" | "relive">,
): CredentialEvidence[] {
  return CREDENTIAL_EVIDENCE.filter(
    (kind) =>
      (kind === "artifact" && requiresWork(basis)) ||
      (kind === "quiz" && requiresTest(basis)) ||
      ((kind === "attendance" || kind === "relive") && sessions.includes(kind)),
  );
}

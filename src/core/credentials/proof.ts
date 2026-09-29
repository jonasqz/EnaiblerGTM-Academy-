import type { CompletionMode } from "@/core/courses/completion";
import { requiresTest } from "@/core/courses/completion";
import type { CredentialEvidence } from "@/core/credentials/evidence";
import { localize, type LocalizedText } from "@/core/i18n/locales";
import type { Translator } from "@/core/i18n/translator";

/**
 * What a credential says about how it was earned: the work, the final test,
 * or both, and the live sessions of a series. A credential never claims
 * work nobody handed in, nor sessions nobody was at.
 */
export interface CredentialProof {
  basis: CompletionMode;
  /** In every language the course had; each reader gets theirs (or any there is). */
  artifactName: LocalizedText | null;
  /** What it rests on (core/credentials/evidence); only sessions are read from it here. */
  evidence?: readonly CredentialEvidence[];
  /** How many sessions the course asked for when it was issued. */
  sessionCount?: number | null;
}

/** The artifact's name in the reader's language, or null when the credential names none. */
export function artifactNameFor(t: Translator, credential: CredentialProof): string | null {
  return localize(credential.artifactName, t.locale) || null;
}

/**
 * "Attended all 4 live sessions", "Took part in all 4 sessions, live or as
 * recording": what the credential says about the sessions, or null when the
 * course asked for none.
 */
export function sessionsLine(t: Translator, credential: CredentialProof): string | null {
  const evidence = credential.evidence ?? [];
  const live = evidence.includes("attendance");
  const relive = evidence.includes("relive");
  const n = credential.sessionCount ?? 0;
  if (live && relive) return t.t("verify.sessionsMixed", { n });
  if (live) return t.t(n === 1 ? "verify.sessionsLiveOne" : "verify.sessionsLive", { n });
  if (relive) return t.t(n === 1 ? "verify.sessionsReliveOne" : "verify.sessionsRelive", { n });
  return null;
}

/** "Deliverable: Reminder playbook · Final test passed · Attended all 4 live sessions" */
export function proofLine(t: Translator, credential: CredentialProof): string {
  const artifact = artifactNameFor(t, credential);
  return [
    artifact ? t.t("verify.artifact", { name: artifact }) : null,
    requiresTest(credential.basis) ? t.t("verify.testPassed") : null,
    sessionsLine(t, credential),
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

/** The sentence under the credential on its verification page. */
export function earnedText(t: Translator, basis: CompletionMode): string {
  switch (basis) {
    case "work":
      return t.t("verify.backedByWork");
    case "test":
      return t.t("verify.backedByTest");
    case "work_and_test":
      return t.t("verify.backedByWorkAndTest");
  }
}

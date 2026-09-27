import type { CompletionMode } from "@/core/courses/completion";
import { requiresTest } from "@/core/courses/completion";
import { localize, type LocalizedText } from "@/core/i18n/locales";
import type { Translator } from "@/core/i18n/translator";

/**
 * What a credential says about how it was earned: the work, the final test,
 * or both. A credential never claims work nobody handed in.
 */
export interface CredentialProof {
  basis: CompletionMode;
  /** In every language the course had; each reader gets theirs (or any there is). */
  artifactName: LocalizedText | null;
}

/** The artifact's name in the reader's language, or null when the credential names none. */
export function artifactNameFor(t: Translator, credential: CredentialProof): string | null {
  return localize(credential.artifactName, t.locale) || null;
}

/** "Deliverable: Reminder playbook · Final test passed" */
export function proofLine(t: Translator, credential: CredentialProof): string {
  const artifact = artifactNameFor(t, credential);
  return [
    artifact ? t.t("verify.artifact", { name: artifact }) : null,
    requiresTest(credential.basis) ? t.t("verify.testPassed") : null,
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

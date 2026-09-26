/**
 * Open Badges 3.0 export (brief §6: nice to have in MVP, required in phase 2).
 * OB 3.0 builds on the W3C VC Data Model 2.0. This produces the unsigned
 * credential document; signing (VC-JWT or eddsa-rdfc-2022 Data Integrity
 * proof) is a phase 2 task and needs a published issuer key.
 */
export const OB3_CONTEXT = [
  "https://www.w3.org/ns/credentials/v2",
  "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
] as const;

export interface OpenBadgeInput {
  /** Verification URL of the credential; doubles as the credential id. */
  credentialUrl: string;
  issuedAt: Date;
  issuer: { id: string; name: string; url: string };
  achievement: {
    id: string;
    name: string;
    description: string;
    criteriaNarrative: string;
  };
  /** Salted SHA-256 of the learner's e-mail (see hashRecipientEmail). */
  recipient: { identityHash: string; salt: string };
  /** Credential term, e.g. "Certificate of Completion". */
  credentialName: string;
}

export function buildOpenBadgeCredential(input: OpenBadgeInput): Record<string, unknown> {
  return {
    "@context": [...OB3_CONTEXT],
    id: input.credentialUrl,
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    name: `${input.credentialName}: ${input.achievement.name}`,
    issuer: {
      id: input.issuer.id,
      type: ["Profile"],
      name: input.issuer.name,
      url: input.issuer.url,
    },
    validFrom: input.issuedAt.toISOString(),
    credentialSubject: {
      type: ["AchievementSubject"],
      identifier: [
        {
          type: "IdentityObject",
          hashed: true,
          identityType: "emailAddress",
          identityHash: input.recipient.identityHash,
          salt: input.recipient.salt,
        },
      ],
      achievement: {
        id: input.achievement.id,
        type: ["Achievement"],
        achievementType: "CertificateOfCompletion",
        name: input.achievement.name,
        description: input.achievement.description,
        criteria: { narrative: input.achievement.criteriaNarrative },
      },
    },
  };
}

/** OB 3.0 hashed identity: "sha256$" + hex(sha256(email + salt)). */
export async function hashRecipientEmail(email: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(email.trim().toLowerCase() + salt);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return `sha256$${hex}`;
}

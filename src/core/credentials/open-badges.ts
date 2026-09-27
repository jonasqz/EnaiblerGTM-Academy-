/**
 * Open Badges 3.0 (brief §6: required in phase 2). OB 3.0 builds on the W3C
 * VC Data Model 2.0; the document here is secured as a VC-JWT (RS256, see
 * server/credentials/open-badge.ts), the proof format every OB 3.0
 * verifier supports.
 */
export const OB3_CONTEXT = [
  "https://www.w3.org/ns/credentials/v2",
  "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
] as const;

export interface OpenBadgeInput {
  /** Verification URL of the credential; doubles as the credential id. */
  credentialUrl: string;
  issuedAt: Date;
  issuer: { id: string; name: string; url: string; image?: string };
  achievement: {
    id: string;
    name: string;
    description: string;
    criteriaNarrative: string;
    image?: string;
  };
  subject: {
    /** A pseudonymous urn:uuid: the JWT's `sub`, never the account id. */
    id: string;
    /** Salted SHA-256 of the learner's e-mail (see hashRecipientEmail). */
    email?: { identityHash: string; salt: string };
    /** The name on the credential, exactly as the learner entered it. */
    name?: string;
  };
  /** Credential term, e.g. "Certificate of Completion". */
  credentialName: string;
  /** What the learner handed in, described (the work itself stays private). */
  evidence?: { name: string; narrative: string };
}

export function buildOpenBadgeCredential(input: OpenBadgeInput): Record<string, unknown> {
  const identifier: Array<Record<string, unknown>> = [];
  if (input.subject.email) {
    identifier.push({
      type: "IdentityObject",
      hashed: true,
      identityType: "emailAddress",
      identityHash: input.subject.email.identityHash,
      salt: input.subject.email.salt,
    });
  }
  if (input.subject.name) {
    identifier.push({
      type: "IdentityObject",
      hashed: false,
      identityType: "name",
      identityHash: input.subject.name,
    });
  }
  const image = (url: string | undefined) => (url ? { image: { id: url, type: "Image" } } : {});
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
      ...image(input.issuer.image),
    },
    validFrom: input.issuedAt.toISOString(),
    credentialSubject: {
      id: input.subject.id,
      type: ["AchievementSubject"],
      ...(identifier.length > 0 ? { identifier } : {}),
      achievement: {
        id: input.achievement.id,
        type: ["Achievement"],
        achievementType: "CertificateOfCompletion",
        name: input.achievement.name,
        description: input.achievement.description,
        criteria: { narrative: input.achievement.criteriaNarrative },
        ...image(input.achievement.image),
      },
    },
    ...(input.evidence
      ? {
          evidence: [
            {
              type: ["Evidence"],
              name: input.evidence.name,
              narrative: input.evidence.narrative,
            },
          ],
        }
      : {}),
  };
}

/** The registered JWT claims OB 3.0 requires next to the credential (VC-JWT payload). */
export function openBadgeJwtPayload(credential: Record<string, unknown>): Record<string, unknown> {
  const issuer = credential.issuer as { id: string };
  const subject = credential.credentialSubject as { id: string };
  return {
    ...credential,
    iss: issuer.id,
    jti: credential.id,
    sub: subject.id,
    nbf: Math.floor(new Date(credential.validFrom as string).getTime() / 1000),
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

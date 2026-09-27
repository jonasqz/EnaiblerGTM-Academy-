import { describe, expect, it } from "vitest";

import { credentialImportSchema } from "@/core/credentials/import";
import { earnedText, proofLine } from "@/core/credentials/proof";
import { createTranslator } from "@/core/i18n/translator";
import { linkedInAddToProfileUrl, linkedInShareUrl } from "@/core/credentials/linkedin";
import {
  buildOpenBadgeCredential,
  hashRecipientEmail,
  OB3_CONTEXT,
  openBadgeJwtPayload,
} from "@/core/credentials/open-badges";
import {
  formatPublicId,
  generatePublicId,
  normalizePublicId,
  PUBLIC_ID_LENGTH,
} from "@/core/credentials/public-id";

describe("public credential ids", () => {
  it("generates 16-character Crockford base32 ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => generatePublicId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
  });

  it("is deterministic for given random bytes", () => {
    expect(generatePublicId((bytes) => bytes.fill(0))).toBe("0".repeat(PUBLIC_ID_LENGTH));
    expect(generatePublicId((bytes) => bytes.fill(255))).toBe("Z".repeat(PUBLIC_ID_LENGTH));
  });

  it("normalises user input and formats for display", () => {
    expect(normalizePublicId("abcd-efgh-jkmn-pqrs")).toBe("ABCDEFGHJKMNPQRS");
    expect(normalizePublicId(" o1il-0000-0000-0000 ")).toBe("0111000000000000");
    expect(normalizePublicId("ABCD")).toBeNull();
    expect(normalizePublicId("ABCD-EFGH-JKMN-PQRU")).toBeNull();
    expect(formatPublicId("ABCDEFGHJKMNPQRS")).toBe("ABCD-EFGH-JKMN-PQRS");
  });
});

describe("LinkedIn", () => {
  const input = {
    name: "Validation Lab — Certificate of Completion",
    organizationName: "Scaling Product Academy",
    issuedAt: new Date("2027-01-31T23:30:00Z"),
    certUrl: "https://academy.scaling-product.com/verify/ABCDEFGHJKMNPQRS",
    certId: "ABCD-EFGH-JKMN-PQRS",
  };

  it("builds the add-to-profile URL with a 1-based issue month", () => {
    const url = new URL(linkedInAddToProfileUrl(input));
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/profile/add");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      startTask: "CERTIFICATION_NAME",
      name: input.name,
      organizationName: "Scaling Product Academy",
      issueYear: "2027",
      issueMonth: "1",
      certUrl: input.certUrl,
      certId: input.certId,
    });
  });

  it("uses the organisation id instead of the name when configured", () => {
    const url = new URL(linkedInAddToProfileUrl({ ...input, organizationId: "12345" }));
    expect(url.searchParams.get("organizationId")).toBe("12345");
    expect(url.searchParams.has("organizationName")).toBe(false);
  });

  it("builds the share URL", () => {
    expect(linkedInShareUrl("https://a.example/verify/X?y=1")).toBe(
      "https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fa.example%2Fverify%2FX%3Fy%3D1",
    );
  });
});

describe("Open Badges 3.0", () => {
  it("builds an unsigned OpenBadgeCredential on VC 2.0", async () => {
    const identityHash = await hashRecipientEmail(" Learner@Example.com ", "salt");
    expect(identityHash).toMatch(/^sha256\$[0-9a-f]{64}$/);
    expect(identityHash).toBe(await hashRecipientEmail("learner@example.com", "salt"));

    const credential = buildOpenBadgeCredential({
      credentialUrl: "https://academy.scaling-product.com/verify/ABCDEFGHJKMNPQRS",
      issuedAt: new Date("2027-02-01T10:00:00Z"),
      issuer: {
        id: "https://academy.scaling-product.com",
        name: "Scaling Product Academy",
        url: "https://academy.scaling-product.com",
      },
      achievement: {
        id: "https://academy.scaling-product.com/courses/validation-lab",
        name: "Validation Lab",
        description: "Built a validated idea brief.",
        criteriaNarrative: "Submitted a validated idea brief that passed a rubric-based review.",
      },
      subject: {
        id: "urn:uuid:0b7a1f6e-8a51-8d1c-9a55-3f0c2f7f9b10",
        email: { identityHash, salt: "salt" },
        name: "Ada Lovelace",
      },
      credentialName: "Certificate of Completion",
      evidence: { name: "Validated idea brief", narrative: "Reviewed against three criteria." },
    });

    expect(credential["@context"]).toEqual([...OB3_CONTEXT]);
    expect(credential.type).toEqual(["VerifiableCredential", "OpenBadgeCredential"]);
    expect(credential.validFrom).toBe("2027-02-01T10:00:00.000Z");
    expect(credential).not.toHaveProperty("issuanceDate");
    expect(credential).toMatchObject({
      issuer: { type: ["Profile"], name: "Scaling Product Academy" },
      credentialSubject: {
        type: ["AchievementSubject"],
        achievement: {
          type: ["Achievement"],
          achievementType: "CertificateOfCompletion",
          name: "Validation Lab",
        },
        identifier: [
          { identityType: "emailAddress", hashed: true, identityHash },
          { identityType: "name", hashed: false, identityHash: "Ada Lovelace" },
        ],
      },
      evidence: [{ type: ["Evidence"], name: "Validated idea brief" }],
    });

    // VC-JWT claims mirror the credential (OB 3.0, JSON Web Token proof format).
    expect(openBadgeJwtPayload(credential)).toMatchObject({
      iss: "https://academy.scaling-product.com",
      jti: "https://academy.scaling-product.com/verify/ABCDEFGHJKMNPQRS",
      sub: "urn:uuid:0b7a1f6e-8a51-8d1c-9a55-3f0c2f7f9b10",
      nbf: Date.UTC(2027, 1, 1, 10) / 1000,
    });
  });
});

describe("credential import", () => {
  const item = {
    external_id: "lw-123",
    source_platform: "learnworlds",
    learner_email: "a@example.com",
    display_name: "Ada Lovelace",
    course_slug: "validation-lab",
    artifact_name: "Validated idea brief",
    issued_at: "2027-01-20",
  };

  it("accepts imports and keeps them private by default", () => {
    const parsed = credentialImportSchema.parse({ credentials: [item] });
    expect(parsed.credentials[0]?.visibility).toBe("private");
  });

  it("normalises preserved public ids and rejects invalid ones", () => {
    expect(
      credentialImportSchema.parse({ credentials: [{ ...item, public_id: "abcd-efgh-jkmn-pqrs" }] })
        .credentials[0]?.public_id,
    ).toBe("ABCDEFGHJKMNPQRS");
    expect(
      credentialImportSchema.safeParse({ credentials: [{ ...item, public_id: "nope" }] }).success,
    ).toBe(false);
  });
});

describe("how a credential was earned", () => {
  const en = createTranslator({ locale: "en" });
  const de = createTranslator({ locale: "de", termOverrides: { test: { de: "Wissenstest" } } });

  it("names the work, the test or both, and never work nobody handed in", () => {
    expect(proofLine(en, { basis: "work", artifactName: "Reminder playbook" })).toBe(
      "Deliverable: Reminder playbook",
    );
    expect(proofLine(en, { basis: "test", artifactName: null })).toBe("Final Test passed");
    expect(proofLine(de, { basis: "work_and_test", artifactName: "Mahnplan" })).toBe(
      "Arbeitsergebnis: Mahnplan · Wissenstest bestanden",
    );
    expect(earnedText(en, "test")).toBe("Earned by passing the Final Test.");
    expect(earnedText(en, "work")).toBe("Earned with real work that passed a rubric-based review.");
  });
});

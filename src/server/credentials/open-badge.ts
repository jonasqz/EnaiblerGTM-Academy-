import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";

import {
  buildOpenBadgeCredential,
  hashRecipientEmail,
  OB3_CONTEXT,
  openBadgeJwtPayload,
} from "@/core/credentials/open-badges";
import { requiresTest } from "@/core/courses/completion";
import { artifactNameFor, proofLine, sessionsLine } from "@/core/credentials/proof";
import { localize } from "@/core/i18n/locales";
import type { Translator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";
import type { Database } from "@/db/client";
import { issuerKeys } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import type { CredentialView } from "@/server/credentials";
import { academyUrl } from "@/server/platform/config";
import { openSecret, pseudonymUuid, sealSecret } from "@/server/secrets";

/*
 * Open Badges 3.0 for the academy's credentials (brief §6, phase 2): the
 * document is signed as a VC-JWT with the academy's RS256 key, whose public
 * half is published at /issuer/keys/<kid> on the academy's own domain.
 */

const FIRST_KID = "key-1";

interface SigningKey {
  kid: string;
  privateKey: KeyObject;
}

/** The academy's active signing key, created on first use. */
export async function issuerSigningKey(db: Database, tenantId: string): Promise<SigningKey> {
  const active = () =>
    withTenant(db, tenantId, (tx) =>
      tx
        .select()
        .from(issuerKeys)
        .where(isNull(issuerKeys.retiredAt))
        .orderBy(desc(issuerKeys.createdAt))
        .limit(1),
    );
  let [row] = await active();
  if (!row) {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const { kty, n, e } = publicKey.export({ format: "jwk" }) as Record<string, string>;
    await withTenant(db, tenantId, (tx) =>
      tx
        .insert(issuerKeys)
        .values({
          tenantId,
          kid: FIRST_KID,
          publicJwk: { kty: kty!, n: n!, e: e!, alg: "RS256", use: "sig" },
          privateKeySealed: sealSecret(
            privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
          ),
        })
        // Two first downloads at once: one key wins, both use it.
        .onConflictDoNothing(),
    );
    [row] = await active();
  }
  return { kid: row!.kid, privateKey: createPrivateKey(openSecret(row!.privateKeySealed)) };
}

/** A published public key (JWK), also after it was retired: old credentials keep verifying. */
export async function issuerPublicKey(
  db: Database,
  tenant: TenantContext,
  kid: string,
): Promise<Record<string, string> | null> {
  const [row] = await withTenant(db, tenant.id, (tx) =>
    tx
      .select({ jwk: issuerKeys.publicJwk })
      .from(issuerKeys)
      .where(and(eq(issuerKeys.kid, kid))),
  );
  return row ? { ...row.jwk, kid: academyUrl(tenant, `/issuer/keys/${kid}`) } : null;
}

/** The issuer profile (OB 3.0 Profile) behind every credential's `issuer.id`. */
export function issuerProfile(tenant: TenantContext): Record<string, unknown> {
  const logo = tenant.theme.logo;
  const png = logo?.png ?? (logo?.src.endsWith(".png") ? logo.src : undefined);
  return {
    "@context": [...OB3_CONTEXT],
    id: academyUrl(tenant, "/issuer"),
    type: ["Profile"],
    name: tenant.settings.author_display_name,
    url: academyUrl(tenant, "/"),
    ...(png ? { image: { id: academyUrl(tenant, png), type: "Image" } } : {}),
  };
}

export function compactJws(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: KeyObject,
): string {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encode(header)}.${encode(payload)}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
}

export interface OpenBadgeExport {
  credential: Record<string, unknown>;
  jwt: string;
}

/** The learner's credential as a signed Open Badges 3.0 VC-JWT. */
/**
 * What the achievement asked for: the work, the final test, or both, and the
 * sessions of a series (core/credentials/proof).
 */
function achievementTexts(t: Translator, credential: CredentialView, course: string) {
  const artifact = artifactNameFor(t, credential) ?? "";
  const sessions = sessionsLine(t, credential);
  const withSessions = (texts: { description: string; criteriaNarrative: string }) =>
    sessions ? { ...texts, criteriaNarrative: `${texts.criteriaNarrative} ${sessions}.` } : texts;
  switch (credential.basis) {
    case "work":
      return withSessions({
        description: t.t("openBadge.description", { course, artifact }),
        criteriaNarrative: t.t("openBadge.criteria", { artifact }),
      });
    case "test":
      return withSessions({
        description: t.t("openBadge.descriptionTest", { course }),
        criteriaNarrative: t.t("openBadge.criteriaTest"),
      });
    case "work_and_test":
      return withSessions({
        description: t.t("openBadge.descriptionWorkAndTest", { course, artifact }),
        criteriaNarrative: t.t("openBadge.criteriaWorkAndTest", { artifact }),
      });
  }
}

export async function openBadgeFor(
  db: Database,
  tenant: TenantContext,
  credential: CredentialView,
  input: { t: Translator; email: string },
): Promise<OpenBadgeExport> {
  const { t } = input;
  const fallback = [tenant.settings.default_locale];
  const course = localize(credential.courseTitle, t.locale, fallback);
  const logo = issuerProfile(tenant).image as { id: string } | undefined;
  // Deterministic salt: downloading twice yields the same document.
  const salt = createHash("sha256").update(`salt:${credential.id}`).digest("hex").slice(0, 16);
  const document = buildOpenBadgeCredential({
    credentialUrl: academyUrl(tenant, `/verify/${credential.publicId}`),
    issuedAt: credential.issuedAt,
    issuer: {
      id: academyUrl(tenant, "/issuer"),
      name: tenant.settings.author_display_name,
      url: academyUrl(tenant, "/"),
      image: logo?.id,
    },
    achievement: {
      id: academyUrl(tenant, `/courses/${credential.courseSlug}`),
      name: course,
      ...achievementTexts(t, credential, course),
    },
    subject: {
      id: `urn:uuid:${pseudonymUuid("ob3-subject", tenant.id, credential.userId)}`,
      email: { identityHash: await hashRecipientEmail(input.email, salt), salt },
      name: credential.displayName || undefined,
    },
    credentialName: t.term("credential"),
    evidence: {
      name: proofLine(t, credential),
      narrative: [
        credential.artifactName ? t.t("openBadge.evidence") : null,
        requiresTest(credential.basis) ? t.t("openBadge.evidenceTest") : null,
        sessionsLine(t, credential) ? `${sessionsLine(t, credential)}.` : null,
      ]
        .filter((part): part is string => part !== null)
        .join(" "),
    },
  });
  const key = await issuerSigningKey(db, tenant.id);
  const jwt = compactJws(
    { alg: "RS256", typ: "JWT", kid: academyUrl(tenant, `/issuer/keys/${key.kid}`) },
    openBadgeJwtPayload(document),
    key.privateKey,
  );
  return { credential: document, jwt };
}

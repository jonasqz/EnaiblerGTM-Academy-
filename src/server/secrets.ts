import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

/**
 * Secrets the app must read back later (the academy's credential signing
 * key, webhook secrets) are sealed with AES-256-GCM under a key derived from
 * DATA_ENCRYPTION_SECRET. Development may fall back to BETTER_AUTH_SECRET;
 * production needs its own secret, so rotating the auth secret can never
 * orphan sealed data. Read by name: the worker seals and opens too.
 */
function secretMaterial(): string {
  const own = process.env.DATA_ENCRYPTION_SECRET?.trim();
  if (own) return own;
  const fallback = process.env.BETTER_AUTH_SECRET?.trim();
  if (fallback && process.env.NODE_ENV !== "production") return fallback;
  throw new Error("DATA_ENCRYPTION_SECRET is not set");
}

function derivedKey(purpose: string): Buffer {
  const material = secretMaterial();
  if (material.length < 32)
    throw new Error("DATA_ENCRYPTION_SECRET must be at least 32 characters");
  return Buffer.from(hkdfSync("sha256", material, "enaibler", `enaibler/${purpose}`, 32));
}

/** "v1.<iv>.<tag>.<ciphertext>", base64url. */
export function sealSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey("sealed"), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), body]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function openSecret(sealed: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || body === undefined)
    throw new Error("Unknown sealed format");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    derivedKey("sealed"),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** A stable, unguessable id derived from inputs (e.g. a learner's pseudonym in exports). */
export function pseudonymUuid(...parts: string[]): string {
  const hex = createHmac("sha256", derivedKey("pseudonym"))
    .update(parts.join("\u0000"))
    .digest("hex");
  // Shaped as a UUID (version 8: custom), so it fits urn:uuid: identifiers.
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) + hex.slice(18, 20),
    hex.slice(20, 32),
  ].join("-");
}

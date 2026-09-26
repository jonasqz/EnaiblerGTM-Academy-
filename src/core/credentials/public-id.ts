/**
 * Public credential ids: 16 Crockford base32 characters (80 random bits).
 * Unguessable on purpose: private credentials must not be discoverable by
 * enumerating ids. Shown grouped (ABCD-EFGH-JKMN-PQRS); accepted in any case,
 * with or without dashes, with the usual Crockford look-alike substitutions.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PUBLIC_ID_LENGTH = 16;

export function generatePublicId(
  random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b),
): string {
  const bytes = random(new Uint8Array(10));
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return output;
}

export function normalizePublicId(input: string): string | null {
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/[-\s]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  if (cleaned.length !== PUBLIC_ID_LENGTH) return null;
  for (const ch of cleaned) {
    if (!ALPHABET.includes(ch)) return null;
  }
  return cleaned;
}

export function formatPublicId(id: string): string {
  return id.match(/.{1,4}/g)?.join("-") ?? id;
}

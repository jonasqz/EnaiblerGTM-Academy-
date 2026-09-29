/**
 * Check-in codes for "link only" webinars (webinar brief §2.3): the host
 * shows a short code during the session, registrants enter it in the
 * academy, and that is their attendance. No 0/O, 1/I/L or U, so a code read
 * off a shared screen is typed right.
 */
export const CHECKIN_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CHECKIN_CODE_LENGTH = 6;

/** A new code from random bytes (crypto on the server; any source in tests). */
export function generateCheckinCode(randomBytes: (size: number) => Uint8Array): string {
  const alphabet = CHECKIN_ALPHABET.length;
  // Rejection sampling: bytes above the last full multiple would favour the first letters.
  const limit = 256 - (256 % alphabet);
  let code = "";
  while (code.length < CHECKIN_CODE_LENGTH) {
    for (const byte of randomBytes(CHECKIN_CODE_LENGTH * 2)) {
      if (byte >= limit) continue;
      code += CHECKIN_ALPHABET[byte % alphabet];
      if (code.length === CHECKIN_CODE_LENGTH) break;
    }
  }
  return code;
}

/** What someone typed, as a code: upper case, without spaces or dashes. */
export function normalizeCheckinCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s\-–.]/g, "")
    .slice(0, 32);
}

export function isCheckinCode(value: string): boolean {
  return new RegExp(`^[${CHECKIN_ALPHABET}]{${CHECKIN_CODE_LENGTH}}$`).test(value);
}

/** "K7M4QX" → "K7M 4QX", easier to read out and to type. */
export function formatCheckinCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** Compares in constant time over the code's length (codes are short and rate-limited anyway). */
export function checkinCodeMatches(expected: string, input: string): boolean {
  const given = normalizeCheckinCode(input);
  if (given.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  }
  return difference === 0;
}

/** Tries per registrant and webinar before the field waits (codes have 30^6 values). */
export const CHECKIN_ATTEMPTS = { max: 10, windowMs: 10 * 60_000 };

/**
 * Pseudonymous learner label for Studio views, e.g. "L-7F3K". Derived per
 * academy, so the same person gets unrelated aliases in different academies.
 * Contact details are only shown with a lead-handoff opt-in (brief §9).
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function learnerAlias(tenantId: string, userId: string): string {
  let hash = 0x811c9dc5;
  for (const ch of `${tenantId}:${userId}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  let value = hash >>> 0;
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += ALPHABET[value & 31];
    value >>>= 5;
  }
  return `L-${code}`;
}

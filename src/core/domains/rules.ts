/**
 * An academy's own domain (brief §11, custom domains). Adding one creates a
 * claim; it routes only once DNS proves both that the academy controls the
 * domain (a TXT record with the claim's token) and that the domain points
 * at us (so the certificate can be issued without failed attempts).
 */
export const CLAIM_TTL_DAYS = 7;
export const MAX_CUSTOM_DOMAINS = 3;
export const VERIFICATION_PREFIX = "enaibler-verification=";

export type DomainIssue = "invalid" | "reserved" | "ip";

const HOST = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * "https://Academy.Acme.com/start" → "academy.acme.com". Our own zones
 * (platform, academy wildcard) and local names are not custom domains.
 */
export function normalizeCustomDomain(
  input: string,
  reservedZones: readonly string[],
): { domain: string } | { issue: DomainIssue } {
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split(/[/?#]/)[0]!.replace(/:\d+$/, "").replace(/\.$/, "");
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) || value.includes(":")) return { issue: "ip" };
  if (!HOST.test(value)) return { issue: "invalid" };
  const local = ["localhost", "local", "test", "internal", "example", "invalid"];
  if (local.some((zone) => value === zone || value.endsWith(`.${zone}`))) {
    return { issue: "reserved" };
  }
  for (const zone of reservedZones) {
    if (value === zone || value.endsWith(`.${zone}`)) return { issue: "reserved" };
  }
  return { domain: value };
}

/** The TXT record that proves control of the domain. */
export function verificationRecord(domain: string, token: string): { name: string; value: string } {
  return { name: `_enaibler.${domain}`, value: `${VERIFICATION_PREFIX}${token}` };
}

export function claimExpired(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() > CLAIM_TTL_DAYS * 24 * 60 * 60_000;
}

export interface DnsAnswers {
  /** TXT records at the verification name, each joined from its chunks. */
  txt: string[];
  /** CNAME targets of the domain itself (none for apex domains). */
  cname: string[];
  /** A/AAAA addresses the domain resolves to. */
  addresses: string[];
  /** A/AAAA addresses of our target host. */
  targetAddresses: string[];
}

export type DomainCheck =
  { status: "verified" } | { status: "pending"; missing: Array<"txt" | "routing"> };

/** Both proofs are needed; either CNAME to the target or the same addresses counts as routing. */
export function evaluateDns(
  answers: DnsAnswers,
  expected: { token: string; target: string },
): DomainCheck {
  const missing: Array<"txt" | "routing"> = [];
  if (!answers.txt.some((record) => record.trim() === `${VERIFICATION_PREFIX}${expected.token}`)) {
    missing.push("txt");
  }
  const target = expected.target.replace(/\.$/, "").toLowerCase();
  const cnameOk = answers.cname.some((name) => name.replace(/\.$/, "").toLowerCase() === target);
  const ipOk =
    answers.addresses.length > 0 &&
    answers.addresses.every((address) => answers.targetAddresses.includes(address));
  if (!cnameOk && !ipOk) missing.push("routing");
  return missing.length === 0 ? { status: "verified" } : { status: "pending", missing };
}

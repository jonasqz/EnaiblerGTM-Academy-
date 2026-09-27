import { Resolver } from "node:dns/promises";

import type { DnsAnswers } from "@/core/domains/rules";
import { verificationRecord } from "@/core/domains/rules";

/** What a domain check asks DNS; tests pass a fake. */
export type DnsLookup = (domain: string, token: string, target: string) => Promise<DnsAnswers>;

const NO_ANSWER = new Set(["ENODATA", "ENOTFOUND", "ESERVFAIL", "ETIMEOUT", "ECONNREFUSED"]);

async function quietly<T>(query: Promise<T>, fallback: T): Promise<T> {
  try {
    return await query;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code && NO_ANSWER.has(code)) return fallback;
    throw error;
  }
}

/** The system resolver, with short timeouts: a check must never hang a request or job. */
export const systemDns: DnsLookup = async (domain, token, target) => {
  const resolver = new Resolver({ timeout: 3_000, tries: 2 });
  const addresses = async (name: string) => [
    ...(await quietly(resolver.resolve4(name), [] as string[])),
    ...(await quietly(resolver.resolve6(name), [] as string[])),
  ];
  const txt = await quietly(resolver.resolveTxt(verificationRecord(domain, token).name), []);
  return {
    txt: txt.map((chunks) => chunks.join("")),
    cname: await quietly(resolver.resolveCname(domain), []),
    addresses: await addresses(domain),
    targetAddresses: await addresses(target),
  };
};

/** Addresses of a host for the DNS instructions (apex domains need A/AAAA records). */
export async function hostAddresses(host: string, withinMs = 1_500): Promise<string[]> {
  const resolver = new Resolver({ timeout: 1_000, tries: 1 });
  const lookup = Promise.all([
    quietly(resolver.resolve4(host), [] as string[]),
    quietly(resolver.resolve6(host), [] as string[]),
  ]).then(([v4, v6]) => [...v4, ...v6]);
  const timeout = new Promise<string[]>((resolve) => setTimeout(() => resolve([]), withinMs));
  return Promise.race([lookup.catch(() => []), timeout]);
}

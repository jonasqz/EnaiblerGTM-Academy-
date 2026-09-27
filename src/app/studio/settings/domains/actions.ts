"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { FormState } from "@/app/studio/actions";
import { text } from "@/app/studio/form-data";
import { CLAIM_TTL_DAYS, MAX_CUSTOM_DOMAINS } from "@/core/domains/rules";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import {
  addDomainClaim,
  checkDomainClaim,
  makePrimaryDomain,
  removeDomain,
} from "@/server/domains/claims";
import { systemDns } from "@/server/domains/dns";
import { academyOrigin } from "@/server/platform/config";
import { rateLimit } from "@/server/rate-limit";

const PAGE = "/studio/settings/domains";

const ADD_ERRORS = {
  invalid: "Enter a domain such as academy.your-company.com.",
  reserved: "This address belongs to enaibler or is not a public domain.",
  ip: "Enter a domain name, not an IP address.",
  taken: "This domain is already in use by an academy.",
  limit: `An academy can have up to ${MAX_CUSTOM_DOMAINS} own domains. Remove one first.`,
  unavailable: "Own domains are not set up on this server yet.",
} as const;

export async function addDomainAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant, viewer } = await requireCapability("academy.manage", PAGE);
  const result = await addDomainClaim(getDb(), tenant, {
    domain: text(formData, "domain"),
    createdBy: viewer.userId,
  });
  if (!result.ok) return { errors: [ADD_ERRORS[result.error]] };
  revalidatePath(PAGE);
  return {
    ok: true,
    message: `Added. Set the two DNS records below; we check every ten minutes for ${CLAIM_TTL_DAYS} days.`,
  };
}

export async function checkDomainAction(formData: FormData): Promise<void> {
  const { tenant } = await requireCapability("academy.manage", PAGE);
  // DNS lookups on demand, a few per minute at most.
  if (rateLimit(`domain-check:${tenant.id}`, 20, 10 * 60_000)) {
    await checkDomainClaim(getDb(), tenant, text(formData, "claimId"), systemDns);
  }
  revalidatePath(PAGE);
}

export async function removeDomainAction(formData: FormData): Promise<void> {
  const { tenant } = await requireCapability("academy.manage", PAGE);
  await removeDomain(getDb(), tenant, text(formData, "domain"));
  revalidatePath(PAGE);
}

/** The new main address: the Studio continues there (sign-in is per address). */
export async function makePrimaryAction(formData: FormData): Promise<void> {
  const { tenant } = await requireCapability("academy.manage", PAGE);
  const domain = text(formData, "domain");
  if (!(await makePrimaryDomain(getDb(), tenant, domain))) redirect(PAGE);
  redirect(`${academyOrigin(domain).origin}${PAGE}`);
}

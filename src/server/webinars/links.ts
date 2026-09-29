import { timingSafeEqual } from "node:crypto";

import type { TenantContext } from "@/core/tenant/context";
import { academyUrl } from "@/server/platform/config";
import { pseudonymUuid } from "@/server/secrets";

/*
 * Links in webinar mail. Cancelling must work from the mail on any device,
 * signed in or not, so the link carries a key derived from the registration
 * (HMAC under the data secret): nothing to store, nothing to leak from the
 * database, and a key for one registration opens no other.
 */

export function cancelKey(tenantId: string, registrationId: string): string {
  return pseudonymUuid("webinar-cancel", tenantId, registrationId);
}

export function cancelKeyValid(tenantId: string, registrationId: string, key: string): boolean {
  const expected = Buffer.from(cancelKey(tenantId, registrationId));
  const given = Buffer.from(key);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function webinarUrl(tenant: TenantContext, slug: string): string {
  return academyUrl(tenant, `/webinars/${slug}`);
}

/** The page that asks before it cancels (mail scanners open links, and must not cancel). */
export function cancelUrl(tenant: TenantContext, slug: string, registrationId: string): string {
  const key = cancelKey(tenant.id, registrationId);
  return academyUrl(tenant, `/webinars/${slug}/cancel?r=${registrationId}&k=${key}`);
}

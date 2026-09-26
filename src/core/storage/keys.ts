/**
 * Object keys are always prefixed by tenant (brief §11): tenants/<tenant-id>/<area>/…
 * Signing or deleting a key outside the current tenant's prefix is refused.
 */
export const STORAGE_AREAS = [
  "submissions",
  "sources",
  "assets",
  "credentials",
  "exports",
] as const;
export type StorageArea = (typeof STORAGE_AREAS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function tenantPrefix(tenantId: string): string {
  if (!UUID.test(tenantId)) throw new Error(`Invalid tenant id: ${tenantId}`);
  return `tenants/${tenantId.toLowerCase()}/`;
}

export function objectKey(tenantId: string, area: StorageArea, ...segments: string[]): string {
  if (segments.length === 0) throw new Error("An object key needs at least one segment");
  for (const segment of segments) {
    if (!SEGMENT.test(segment) || segment.includes(".."))
      throw new Error(`Invalid key segment: ${segment}`);
  }
  return `${tenantPrefix(tenantId)}${area}/${segments.join("/")}`;
}

export function assertTenantKey(tenantId: string, key: string): void {
  if (!key.startsWith(tenantPrefix(tenantId)) || key.includes("..") || key.includes("//")) {
    throw new Error("Object key does not belong to this tenant");
  }
}

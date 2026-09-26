import { describe, expect, it } from "vitest";

import { assertTenantKey, objectKey, tenantPrefix } from "@/core/storage/keys";

const tenant = "0b7a3c1e-9f4d-4d7e-8a51-6f7e2b9c1d20";
const other = "5c2d9e8f-1a3b-4c5d-9e7f-0a1b2c3d4e5f";

describe("storage keys", () => {
  it("prefixes every key with the tenant", () => {
    expect(objectKey(tenant, "submissions", "sub-1", "brief.pdf")).toBe(
      `tenants/${tenant}/submissions/sub-1/brief.pdf`,
    );
    expect(tenantPrefix(tenant.toUpperCase())).toBe(`tenants/${tenant}/`);
  });

  it("rejects traversal and odd segments", () => {
    expect(() => objectKey(tenant, "assets", "..", "x")).toThrow();
    expect(() => objectKey(tenant, "assets", "a/b")).toThrow();
    expect(() => objectKey(tenant, "assets", ".hidden")).toThrow();
    expect(() => objectKey("not-a-uuid", "assets", "x")).toThrow();
  });

  it("refuses keys of another tenant", () => {
    expect(() => assertTenantKey(tenant, objectKey(tenant, "exports", "x.json"))).not.toThrow();
    expect(() => assertTenantKey(tenant, objectKey(other, "exports", "x.json"))).toThrow();
    expect(() => assertTenantKey(tenant, `tenants/${tenant}/../${other}/x`)).toThrow();
  });
});

import { afterEach, describe, expect, it } from "vitest";

import { openSecret, pseudonymUuid, sealSecret } from "@/server/secrets";

describe("sealed secrets", () => {
  const original = process.env.DATA_ENCRYPTION_SECRET;
  afterEach(() => {
    process.env.DATA_ENCRYPTION_SECRET = original;
  });

  it("round-trips and detects tampering", () => {
    process.env.DATA_ENCRYPTION_SECRET = "a".repeat(40);
    const sealed = sealSecret("-----BEGIN PRIVATE KEY-----");
    expect(sealed).not.toContain("PRIVATE");
    expect(openSecret(sealed)).toBe("-----BEGIN PRIVATE KEY-----");
    const [v, iv, tag, body] = sealed.split(".");
    const flipped = `${v}.${iv}.${tag}.${body!.slice(0, -2)}AA`;
    expect(() => openSecret(flipped)).toThrow();
    process.env.DATA_ENCRYPTION_SECRET = "b".repeat(40);
    expect(() => openSecret(sealed)).toThrow();
  });

  it("derives stable pseudonyms shaped as UUIDs", () => {
    process.env.DATA_ENCRYPTION_SECRET = "a".repeat(40);
    const one = pseudonymUuid("tenant", "user");
    expect(one).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(pseudonymUuid("tenant", "user")).toBe(one);
    expect(pseudonymUuid("tenant", "other")).not.toBe(one);
  });
});

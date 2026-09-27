import { describe, expect, it } from "vitest";

import { isPublicAddress } from "@/core/net/address";

describe("public addresses (SSRF guard)", () => {
  it("allows the public internet", () => {
    for (const ip of [
      "8.8.8.8",
      "93.184.216.34",
      "1.1.1.1",
      "2606:4700:4700::1111",
      "2a00:1450:4001:82a::200e",
    ]) {
      expect(isPublicAddress(ip)).toBe(true);
    }
  });

  it("blocks loopback, private, link-local and reserved ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "198.18.0.1",
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "64:ff9b::a00:1",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("treats IPv4-mapped public addresses as public and rejects non-addresses", () => {
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
    expect(isPublicAddress("localhost")).toBe(false);
    expect(isPublicAddress("")).toBe(false);
  });
});

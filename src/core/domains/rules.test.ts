import { describe, expect, it } from "vitest";

import {
  claimExpired,
  evaluateDns,
  normalizeCustomDomain,
  verificationRecord,
} from "@/core/domains/rules";

const zones = ["enaibler.app", "academies.enaibler.app"];

describe("custom domains", () => {
  it("takes what people paste and keeps the host name", () => {
    expect(normalizeCustomDomain(" https://Academy.Acme.com/start?x=1 ", zones)).toEqual({
      domain: "academy.acme.com",
    });
    expect(normalizeCustomDomain("lernen.acme.de.", zones)).toEqual({ domain: "lernen.acme.de" });
    expect(normalizeCustomDomain("acme.com:443", zones)).toEqual({ domain: "acme.com" });
  });

  it("refuses our own zones, local names and addresses", () => {
    expect(normalizeCustomDomain("x.academies.enaibler.app", zones)).toEqual({
      issue: "reserved",
    });
    expect(normalizeCustomDomain("enaibler.app", zones)).toEqual({ issue: "reserved" });
    expect(normalizeCustomDomain("academy.localhost", zones)).toEqual({ issue: "reserved" });
    expect(normalizeCustomDomain("10.0.0.7", zones)).toEqual({ issue: "ip" });
    expect(normalizeCustomDomain("not a domain", zones)).toEqual({ issue: "invalid" });
  });

  it("asks for a TXT record under _enaibler", () => {
    expect(verificationRecord("academy.acme.com", "abc")).toEqual({
      name: "_enaibler.academy.acme.com",
      value: "enaibler-verification=abc",
    });
  });

  it("needs the token and routing before a domain goes live", () => {
    const expected = { token: "abc", target: "acme.academies.enaibler.app" };
    const answers = {
      txt: ["v=spf1 -all", "enaibler-verification=abc"],
      cname: ["acme.academies.enaibler.app."],
      addresses: [],
      targetAddresses: ["203.0.113.10"],
    };
    expect(evaluateDns(answers, expected)).toEqual({ status: "verified" });
    // An apex domain with A records to our server counts as routing.
    expect(evaluateDns({ ...answers, cname: [], addresses: ["203.0.113.10"] }, expected)).toEqual({
      status: "verified",
    });
    // Pointing somewhere else, or a token of another claim, does not.
    expect(
      evaluateDns(
        {
          ...answers,
          txt: ["enaibler-verification=other"],
          cname: [],
          addresses: ["198.51.100.1"],
        },
        expected,
      ),
    ).toEqual({ status: "pending", missing: ["txt", "routing"] });
  });

  it("lets claims lapse after a week", () => {
    const created = new Date("2026-10-01T00:00:00Z");
    expect(claimExpired(created, new Date("2026-10-07T23:00:00Z"))).toBe(false);
    expect(claimExpired(created, new Date("2026-10-08T01:00:00Z"))).toBe(true);
  });
});

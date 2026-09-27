import { describe, expect, it } from "vitest";

import { traefikDynamicConfig } from "@/core/domains/proxy-config";

describe("Traefik config for custom domains", () => {
  it("routes each domain over https with a certificate, and redirects http", () => {
    const config = traefikDynamicConfig(["academy.acme.com"], {
      serviceUrl: "http://enaibler-web:3000",
      httpEntryPoint: "http",
      httpsEntryPoint: "https",
      certResolver: "letsencrypt",
    });
    expect(config.http.routers).toEqual({
      "enaibler-academy-acme-com": {
        rule: "Host(`academy.acme.com`)",
        entryPoints: ["https"],
        service: "enaibler-web",
        tls: { certResolver: "letsencrypt" },
      },
      "enaibler-academy-acme-com-http": {
        rule: "Host(`academy.acme.com`)",
        entryPoints: ["http"],
        middlewares: ["enaibler-to-https"],
        service: "enaibler-web",
      },
    });
    expect(config.http.services["enaibler-web"].loadBalancer.servers).toEqual([
      { url: "http://enaibler-web:3000" },
    ]);
  });

  it("is valid with no domains yet", () => {
    const config = traefikDynamicConfig([], {
      serviceUrl: "http://web:3000",
      httpEntryPoint: "http",
      httpsEntryPoint: "https",
      certResolver: "letsencrypt",
    });
    expect(config.http.routers).toEqual({});
  });
});

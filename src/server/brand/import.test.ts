import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { importBrand } from "@/server/brand/import";
import { safeFetchText, type FetchText } from "@/server/brand/safe-fetch";
import type { LlmCaller } from "@/server/llm";

const HTML = `<html><head><title>Acme</title>
<link rel="stylesheet" href="/site.css"><meta name="theme-color" content="#0f7b6c"></head>
<body><h1>Acme</h1></body></html>`;
const CSS = `:root{--brand:#0f7b6c;--sun:#f2a541}
body{background:#fff;color:#14213d;font-family:Gotham,Arial,sans-serif}
.btn{background:var(--brand);border-radius:12px}h1{font-family:Georgia,serif}`;

const fakeSite: FetchText = async (url) => {
  if (url.endsWith("/site.css")) return { ok: true, url, contentType: "text/css", text: CSS };
  return { ok: true, url, contentType: "text/html; charset=utf-8", text: HTML };
};

function fakeModel(answer: unknown): LlmCaller {
  return async () => ({
    content: JSON.stringify(answer),
    model: "fake",
    tokensIn: 900,
    tokensOut: 120,
    cost: 0.001,
    latencyMs: 5,
  });
}

const goodAnswer = {
  colors: {
    ink: "#14213d",
    surface: "#f4f7f6",
    card: "#ffffff",
    primary: "#0f7b6c",
    accents: ["#f2a541"],
  },
  fonts: { display: "Merriweather", body: "Montserrat" },
  radius_px: 12,
  border_width_px: 1,
  shadow: "soft",
  visual_style: "soft",
  notes: ["Headings use a serif like your site."],
};

describe("brand import", () => {
  it("proposes a theme from the site's CSS without a model", async () => {
    const result = await importBrand("acme.example", {
      llm: null,
      model: "m",
      fetchText: fakeSite,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result).toMatchObject({ source: "acme.example", usedAi: false });
    expect(result.theme.colors.primary).toBe("#0f7b6c");
    expect(result.theme.fonts).toEqual({ display: "Merriweather", body: "Montserrat" });
    expect(result.notes).toContain(
      "Your site uses “Gotham”; closest open-source match: Montserrat.",
    );
  });

  it("uses the model's refinement when it passes the same checks", async () => {
    const result = await importBrand("https://acme.example", {
      llm: fakeModel(goodAnswer),
      model: "m",
      fetchText: fakeSite,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.usedAi).toBe(true);
    expect(result.theme.colors.surface).toBe("#f4f7f6");
    expect(result.notes).toContain("Headings use a serif like your site.");
  });

  it("keeps the rule-based proposal when the model's theme is unreadable or off-list", async () => {
    for (const answer of [
      { ...goodAnswer, colors: { ...goodAnswer.colors, ink: "#dddddd" } },
      { ...goodAnswer, fonts: { display: "Comic Sans MS", body: "Inter" } },
    ]) {
      const result = await importBrand("acme.example", {
        llm: fakeModel(answer),
        model: "m",
        fetchText: fakeSite,
      });
      expect(result).toMatchObject({ ok: true, usedAi: false });
    }
  });

  it("reports addresses it may not read", async () => {
    const blocked: FetchText = async () => ({ ok: false, reason: "blocked" });
    expect(
      await importBrand("http://10.0.0.1", { llm: null, model: "m", fetchText: blocked }),
    ).toEqual({
      ok: false,
      error: "blocked",
    });
    expect(await importBrand("", { llm: null, model: "m", fetchText: fakeSite })).toEqual({
      ok: false,
      error: "invalid_url",
    });
  });
});

describe("safe fetch", () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === "/to-private") {
        response.writeHead(302, { location: "http://127.0.0.1/admin" });
        return response.end();
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html>ok</html>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
    delete process.env.BRAND_IMPORT_ALLOWED_HOSTS;
  });

  const html = { accept: /text\/html/, maxBytes: 10_000, timeoutMs: 2_000 };

  it("refuses loopback, private and metadata addresses, and odd ports", async () => {
    for (const url of [
      `${origin}/`,
      "http://127.0.0.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://localhost/",
      "http://[::1]/",
      "ftp://example.com/",
    ]) {
      expect(await safeFetchText(url, html), url).toEqual({ ok: false, reason: "blocked" });
    }
  });

  it("reads an explicitly allowed test host, but re-checks every redirect", async () => {
    process.env.BRAND_IMPORT_ALLOWED_HOSTS = origin.replace("http://", "");
    expect(await safeFetchText(`${origin}/`, html)).toMatchObject({
      ok: true,
      text: "<html>ok</html>",
    });
    expect(await safeFetchText(`${origin}/to-private`, html)).toEqual({
      ok: false,
      reason: "blocked",
    });
  });
});

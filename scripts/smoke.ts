/**
 * Checks a running deployment from the outside, after every deploy
 * (docs/deployment.md §10):
 *   npm run smoke -- --academy https://academy.example.com [--platform https://enaibler.app]
 *   npm run smoke -- --academy http://academy.test --platform http://enaibler.test --connect 127.0.0.1:3000
 * --connect sends every request to that address and keeps the Host (no DNS needed).
 * Read-only: it signs no one in and changes nothing. Exits with 1 if a check fails.
 */
import http from "node:http";
import https from "node:https";

interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

const args = process.argv.slice(2);
const option = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const academy = option("academy");
const platform = option("platform");
const connect = option("connect");
if (!academy) {
  console.error("Usage: smoke --academy <url> [--platform <url>] [--connect host:port]");
  process.exit(1);
}

function get(base: string, path: string): Promise<Reply> {
  const url = new URL(path, base);
  const [connectHost, connectPort] = connect?.split(":") ?? [];
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(
      {
        method: "GET",
        host: connectHost ?? url.hostname,
        port: Number(connectPort ?? (url.port || (url.protocol === "https:" ? 443 : 80))),
        path: `${url.pathname}${url.search}`,
        servername: url.hostname,
        headers: { host: url.host, "user-agent": "enaibler-smoke/1", accept: "*/*" },
        timeout: 15_000,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    request.on("timeout", () => request.destroy(new Error("timed out")));
    request.on("error", reject);
    request.end();
  });
}

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
async function check(name: string, run: () => Promise<string | true>) {
  try {
    const outcome = await run();
    results.push({ name, ok: outcome === true, detail: outcome === true ? "" : outcome });
  } catch (error) {
    results.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

const header = (reply: Reply, name: string) => String(reply.headers[name] ?? "");
const secure = (base: string) => new URL(base).protocol === "https:";

/** The headers every page carries (next.config.ts), HSTS only where it means something. */
function hardened(reply: Reply, base: string, frameAncestors: string): string | true {
  const missing: string[] = [];
  if (header(reply, "x-content-type-options") !== "nosniff") missing.push("X-Content-Type-Options");
  if (!header(reply, "referrer-policy")) missing.push("Referrer-Policy");
  if (!header(reply, "content-security-policy").includes(`frame-ancestors ${frameAncestors}`)) {
    missing.push(`CSP frame-ancestors ${frameAncestors}`);
  }
  if (!header(reply, "permissions-policy").includes("camera=()"))
    missing.push("Permissions-Policy");
  if (secure(base) && !header(reply, "strict-transport-security")) missing.push("HSTS");
  if (header(reply, "x-powered-by")) missing.push("no X-Powered-By");
  return missing.length ? `missing: ${missing.join(", ")}` : true;
}

/** Only the session and the language preference may be set (brief §9: no tracking cookies). */
function cookiesAllowed(reply: Reply): string | true {
  const cookies = [reply.headers["set-cookie"] ?? []].flat();
  const names = cookies.map((cookie) => cookie.split("=")[0]!.trim());
  const foreign = names.filter((name) => !/^(enaibler_locale|(__Secure-)?enaibler\.)/.test(name));
  return foreign.length ? `unexpected cookies: ${foreign.join(", ")}` : true;
}

await check("academy: health (database reachable)", async () => {
  const reply = await get(academy, "/api/health");
  return reply.status === 200 ? true : `status ${reply.status}: ${reply.body.slice(0, 120)}`;
});
await check("academy: home page", async () => {
  const reply = await get(academy, "/");
  if (reply.status !== 200) return `status ${reply.status}`;
  return reply.body.includes("Powered by enaibler") ? true : "no “Powered by enaibler” mark";
});
await check("academy: security headers", async () =>
  hardened(await get(academy, "/"), academy, "'self'"),
);
await check("academy: no tracking cookies", async () =>
  cookiesAllowed(await get(academy, "/?lang=en")),
);
await check("academy: an unknown certificate looks like a deleted one", async () => {
  const reply = await get(academy, "/verify/ZZZZZZZZZZZZZZZZ");
  return reply.status === 404 ? true : `status ${reply.status}`;
});
await check("academy: Studio asks for sign-in", async () => {
  const reply = await get(academy, "/studio");
  const location = header(reply, "location");
  if ([302, 303, 307, 308].includes(reply.status)) {
    return location.includes("/sign-in") ? true : `redirects to ${location}`;
  }
  return reply.status === 200 && reply.body.includes('name="email"')
    ? true
    : `status ${reply.status}`;
});
await check("academy: platform pages are not served here", async () => {
  const reply = await get(academy, "/platform");
  return reply.status === 404 ? true : `status ${reply.status}`;
});
await check("academy: robots.txt", async () => {
  const reply = await get(academy, "/robots.txt");
  return reply.status === 200 ? true : `status ${reply.status}`;
});

if (platform) {
  for (const path of ["/", "/how-it-works", "/for/consultancies", "/for/software", "/create"]) {
    await check(`website: ${path}`, async () => {
      const reply = await get(platform, `${path}?lang=en`);
      if (reply.status !== 200) return `status ${reply.status}`;
      return reply.body.includes('property="og:image"') ? true : "no link preview";
    });
  }
  await check("website: security headers", async () =>
    hardened(await get(platform, "/"), platform, "'self'"),
  );
  await check("website: link preview image", async () => {
    const reply = await get(platform, "/og?page=home&lang=de");
    return reply.status === 200 && header(reply, "content-type") === "image/png"
      ? true
      : `status ${reply.status} ${header(reply, "content-type")}`;
  });
  await check("website: sitemap", async () => {
    const reply = await get(platform, "/sitemap.xml");
    return reply.status === 200 && reply.body.includes("<urlset") ? true : `status ${reply.status}`;
  });
  await check("website: signup is open", async () => {
    const reply = await get(platform, "/create?lang=en");
    return reply.body.includes('name="slug"') ? true : "the signup form is not shown";
  });
  for (const path of ["/imprint", "/privacy", "/terms", "/dpa"]) {
    await check(`website: ${path}`, async () => {
      const reply = await get(platform, `${path}?lang=en`);
      // A PLATFORM_*_URL sends the page on to the operator's own document.
      if ([307, 308].includes(reply.status)) {
        return header(reply, "location") ? true : `status ${reply.status} without a target`;
      }
      return reply.status === 200 ? true : `status ${reply.status}`;
    });
  }
  await check("website: content reports reach an inbox", async () => {
    const reply = await get(platform, "/report?lang=en");
    if (reply.status !== 200) return `status ${reply.status}`;
    if (!reply.body.includes('name="explanation"')) return "no report form";
    return reply.body.includes("<fieldset disabled")
      ? "the form is closed: set PLATFORM_ABUSE_EMAIL"
      : true;
  });
  await check("academy: pages link to content reports", async () => {
    const reply = await get(academy, "/");
    return reply.body.includes("/report?url=") ? true : "no “Report content” link";
  });
}

const width = Math.max(...results.map((result) => result.name.length));
for (const result of results) {
  console.log(
    `${result.ok ? "✓" : "✗"} ${result.name.padEnd(width)}${result.detail ? `  ${result.detail}` : ""}`,
  );
}
const failed = results.filter((result) => !result.ok).length;
console.log(
  failed
    ? `\n${failed} of ${results.length} checks failed.`
    : `\nAll ${results.length} checks passed.`,
);
process.exitCode = failed ? 1 : 0;

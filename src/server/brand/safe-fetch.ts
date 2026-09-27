import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

import { isPublicAddress } from "@/core/net/address";

/*
 * Fetching a customer-supplied URL from our servers (brand import). Every
 * connection, including each redirect hop, may only reach public addresses:
 * the check runs on the addresses the socket actually connects to, so DNS
 * rebinding cannot slip past it. Small, text-only, time-boxed responses.
 * BRAND_IMPORT_ALLOWED_HOSTS (host:port list) exempts local test servers.
 */

export interface FetchTextOptions {
  accept: RegExp;
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
}

export type FetchTextResult =
  | { ok: true; url: string; contentType: string; text: string }
  | { ok: false; reason: "blocked" | "unreachable" | "status" | "type" };

export type FetchText = (url: string, options: FetchTextOptions) => Promise<FetchTextResult>;

class Blocked extends Error {}

function allowedHosts(): Set<string> {
  return new Set(
    (process.env.BRAND_IMPORT_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

function guardedLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "");
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((entry) => !isPublicAddress(entry.address))) {
      return callback(new Blocked(`${hostname} resolves to a non-public address`), "");
    }
    if (options.all) return callback(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
}

function request(
  url: URL,
  options: FetchTextOptions,
  exempt: boolean,
): Promise<{ status: number; location?: string; contentType: string; text: string }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "GET",
        headers: {
          "user-agent": "enaibler-brand-import/1.0 (+https://enaibler.com)",
          accept: "text/html,application/xhtml+xml,text/css;q=0.9,*/*;q=0.1",
        },
        ...(exempt ? {} : { lookup: guardedLookup as unknown as typeof dnsLookup }),
        timeout: options.timeoutMs ?? 8_000,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const contentType = String(response.headers["content-type"] ?? "");
        if (status >= 300 && status < 400) {
          response.resume();
          return resolve({ status, location: response.headers.location, contentType, text: "" });
        }
        if (status < 200 || status >= 300 || !options.accept.test(contentType)) {
          response.resume();
          return resolve({ status, contentType, text: "" });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            // Enough to read a brand from; stop downloading.
            chunks.push(chunk.subarray(0, Math.max(0, options.maxBytes - (size - chunk.length))));
            response.destroy();
            return resolve({ status, contentType, text: Buffer.concat(chunks).toString("utf8") });
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({ status, contentType, text: Buffer.concat(chunks).toString("utf8") }),
        );
        response.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

export const safeFetchText: FetchText = async (input, options) => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "blocked" };
  }
  const exemptions = allowedHosts();
  for (let hop = 0; hop <= (options.maxRedirects ?? 3); hop++) {
    if (url.protocol !== "https:" && url.protocol !== "http:")
      return { ok: false, reason: "blocked" };
    if (url.username || url.password) return { ok: false, reason: "blocked" };
    const exempt = exemptions.has(url.host.toLowerCase());
    if (!exempt) {
      if (url.port && url.port !== "80" && url.port !== "443")
        return { ok: false, reason: "blocked" };
      // IP literals never go through DNS, so check them here.
      const literal = url.hostname.replace(/^\[|\]$/g, "");
      if (isIP(literal) && !isPublicAddress(literal)) return { ok: false, reason: "blocked" };
    }
    let result: Awaited<ReturnType<typeof request>>;
    try {
      result = await request(url, options, exempt);
    } catch (error) {
      return { ok: false, reason: error instanceof Blocked ? "blocked" : "unreachable" };
    }
    if (result.location) {
      try {
        url = new URL(result.location, url);
      } catch {
        return { ok: false, reason: "unreachable" };
      }
      continue;
    }
    if (result.status < 200 || result.status >= 300) return { ok: false, reason: "status" };
    if (!options.accept.test(result.contentType)) return { ok: false, reason: "type" };
    return { ok: true, url: url.toString(), contentType: result.contentType, text: result.text };
  }
  return { ok: false, reason: "unreachable" };
};

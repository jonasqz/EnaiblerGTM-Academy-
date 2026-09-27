import { NextResponse, type NextRequest } from "next/server";

import { isLocale, SUPPORTED_LOCALES, type Locale } from "@/core/i18n/locales";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/server/cookies";
import { isPlatformHost } from "@/server/platform/config";
import { resolveTenant } from "@/server/tenant-resolver";

const notFound = () =>
  new NextResponse("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

/**
 * Host-based tenancy (brief §11). The platform host (self-serve signup) is
 * served from /platform/*; every other host must be an active academy, and
 * academies never see the platform pages.
 * `?lang=de|en` on any URL stores the language preference (a functional
 * cookie; no tracking cookies are set anywhere).
 * Runs on the Node.js runtime (Next 16 proxy), so it can use the database.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = request.headers.get("host");
  if (isPlatformHost(host)) {
    // Relative to request.url (not nextUrl, which renames 127.0.0.1 to localhost):
    // a different origin would make Next proxy the rewrite as an external request.
    const target = pathname === "/" ? "/platform" : `/platform${pathname}`;
    const url = new URL(`${target}${search}`, request.url);
    return withLanguage(request, SUPPORTED_LOCALES, (headers) =>
      NextResponse.rewrite(url, { request: { headers } }),
    );
  }

  const tenant = await resolveTenant(host);
  if (!tenant || tenant.status !== "active") return notFound();
  if (pathname === "/platform" || pathname.startsWith("/platform/")) return notFound();

  return withLanguage(request, tenant.settings.locales, (headers) =>
    NextResponse.next({ request: { headers } }),
  );
}

function withLanguage(
  request: NextRequest,
  offered: readonly Locale[],
  respond: (headers: Headers) => NextResponse,
): NextResponse {
  const lang = request.nextUrl.searchParams.get("lang")?.toLowerCase();
  if (!isLocale(lang) || !offered.includes(lang)) return respond(request.headers);
  request.cookies.set(LOCALE_COOKIE, lang);
  const response = respond(request.headers);
  response.cookies.set(LOCALE_COOKIE, lang, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export const config = {
  // Health checks come in on internal host names; static assets need no tenant.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|api/health).*)"],
};

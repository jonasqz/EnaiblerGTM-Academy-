import { NextResponse, type NextRequest } from "next/server";

import { isLocale } from "@/core/i18n/locales";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/server/cookies";
import { resolveTenant } from "@/server/tenant-resolver";

/**
 * Host-based tenancy (brief §11): unknown or suspended hosts stop here.
 * `?lang=de|en` on any URL stores the language preference (a functional
 * cookie; no tracking cookies are set anywhere).
 * Runs on the Node.js runtime (Next 16 proxy), so it can use the database.
 */
export async function proxy(request: NextRequest) {
  const tenant = await resolveTenant(request.headers.get("host"));
  if (!tenant || tenant.status !== "active") {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const lang = request.nextUrl.searchParams.get("lang")?.toLowerCase();
  if (isLocale(lang) && tenant.settings.locales.includes(lang)) {
    request.cookies.set(LOCALE_COOKIE, lang);
    const response = NextResponse.next({ request: { headers: request.headers } });
    response.cookies.set(LOCALE_COOKIE, lang, {
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  // Health checks come in on internal host names; static assets need no tenant.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|api/health).*)"],
};

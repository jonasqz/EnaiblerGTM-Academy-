import Link from "next/link";

import { SUPPORTED_LOCALES } from "@/core/i18n/locales";
import { platformText } from "@/core/i18n/platform-messages";
import { platformConfig } from "@/server/platform/config";
import { getLocale } from "@/server/request";

/**
 * The platform site (PLATFORM_HOST, reached through the proxy's rewrite, so
 * "/" here is this page, not an academy home). enaibler's own brand.
 */
export default async function PlatformLayout({ children }: LayoutProps<"/platform">) {
  const locale = await getLocale();
  const t = platformText(locale);
  const links = platformConfig()?.links ?? {};
  const legal = [
    ["footer.imprint", links.imprint],
    ["footer.privacy", links.privacy],
    ["footer.terms", links.terms],
  ] as const;
  return (
    <>
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="font-display text-xl font-bold tracking-tight">
            enaibler
          </Link>
          <ul className="flex gap-3 text-sm" aria-label={t("nav.language")}>
            {SUPPORTED_LOCALES.map((option) => (
              <li key={option}>
                <a
                  href={`?lang=${option}`}
                  hrefLang={option}
                  aria-current={option === locale ? "true" : undefined}
                  className={
                    option === locale
                      ? "font-bold underline underline-offset-4"
                      : "text-muted hover:text-ink"
                  }
                >
                  {option.toUpperCase()}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:py-16">{children}</main>
      <footer className="border-t border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm">
          <p className="font-semibold">enaibler</p>
          <ul className="flex flex-wrap gap-4">
            {legal.map(([key, href]) =>
              href ? (
                <li key={key}>
                  <a href={href} className="underline-offset-4 hover:underline">
                    {t(key)}
                  </a>
                </li>
              ) : null,
            )}
          </ul>
          <p className="text-muted">{t("footer.hosted")}</p>
        </div>
      </footer>
    </>
  );
}

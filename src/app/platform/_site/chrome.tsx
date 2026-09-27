import { Menu } from "lucide-react";
import Link from "next/link";

import { NavLink } from "@/app/platform/_site/nav-link";
import { Container } from "@/app/platform/_site/ui";
import { SUPPORTED_LOCALES, type Locale } from "@/core/i18n/locales";
import { SITE_PATHS } from "@/core/i18n/site";
import type { SiteCommonCopy } from "@/core/i18n/site/common";
import { legalHref, type LegalPage } from "@/core/platform/legal";

const NAV = [
  ["how", SITE_PATHS.how],
  ["consultancies", SITE_PATHS.consultancies],
  ["software", SITE_PATHS.software],
] as const;

function LanguageSwitch(props: { locale: Locale; label: string }) {
  return (
    <ul className="flex gap-3 text-sm" aria-label={props.label}>
      {SUPPORTED_LOCALES.map((option) => (
        <li key={option}>
          {/* Relative: the same page in the other language (the proxy stores the choice). */}
          <a
            href={`?lang=${option}`}
            hrefLang={option}
            lang={option}
            aria-current={option === props.locale ? "true" : undefined}
            className={
              option === props.locale
                ? "font-bold underline underline-offset-4"
                : "text-muted hover:text-ink"
            }
          >
            {option.toUpperCase()}
          </a>
        </li>
      ))}
    </ul>
  );
}

const navLink =
  "rounded-control px-1 py-1 text-muted hover:text-ink aria-[current=page]:font-semibold aria-[current=page]:text-ink";

export function SiteHeader(props: { locale: Locale; copy: SiteCommonCopy }) {
  const { copy } = props;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-card/90 backdrop-blur-md">
      <Container className="flex items-center gap-6 py-3">
        <Link href="/" className="font-display text-xl font-bold tracking-tight">
          enaibler
        </Link>
        <nav aria-label={copy.nav.label} className="hidden md:block">
          <ul className="flex items-center gap-5 text-sm font-medium">
            {NAV.map(([key, href]) => (
              <li key={key}>
                <NavLink href={href} className={navLink}>
                  {copy.nav[key]}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <div className="hidden md:block">
            <LanguageSwitch locale={props.locale} label={copy.nav.language} />
          </div>
          <a href={SITE_PATHS.create} className="btn btn-primary btn-sm hidden sm:inline-flex">
            {copy.nav.create}
          </a>
          {/* No script needed: a disclosure holds the menu on small screens. */}
          <details className="group relative md:hidden">
            <summary className="btn btn-secondary btn-sm list-none [&::-webkit-details-marker]:hidden">
              <Menu aria-hidden size={18} />
              {copy.nav.menu}
            </summary>
            <div className="card absolute right-0 mt-2 w-[min(18rem,calc(100vw-2rem))] space-y-4 p-4">
              <nav aria-label={copy.nav.label}>
                <ul className="space-y-1">
                  {NAV.map(([key, href]) => (
                    <li key={key}>
                      <NavLink
                        href={href}
                        className="block rounded-control px-2 py-2 font-medium hover:bg-subtle aria-[current=page]:bg-primary-soft"
                      >
                        {copy.nav[key]}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </nav>
              <a href={SITE_PATHS.create} className="btn btn-primary w-full">
                {copy.nav.create}
              </a>
              <LanguageSwitch locale={props.locale} label={copy.nav.language} />
            </div>
          </details>
        </div>
      </Container>
    </header>
  );
}

export function SiteFooter(props: {
  copy: SiteCommonCopy;
  /** The operator's own addresses; a page without one links to the built-in page. */
  legal: Partial<Record<LegalPage, string>>;
}) {
  const { copy } = props;
  const legal: ReadonlyArray<readonly [string, string]> = [
    [copy.footer.imprint, legalHref("imprint", props.legal)],
    [copy.footer.privacy, legalHref("privacy", props.legal)],
    [copy.footer.terms, legalHref("terms", props.legal)],
    [copy.footer.dpa, legalHref("dpa", props.legal)],
    [copy.footer.report, SITE_PATHS.report],
  ];
  const column = (title: string, links: ReadonlyArray<readonly [string, string]>) => (
    <nav aria-label={title} className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="space-y-2 text-sm text-muted">
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href} className="hover:text-ink hover:underline">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
  return (
    <footer className="border-t border-line bg-card">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <p className="font-display text-xl font-bold tracking-tight">enaibler</p>
          <p className="max-w-xs text-sm text-muted">{copy.footer.tagline}</p>
          <p className="text-sm text-muted">{copy.footer.hosted}</p>
        </div>
        {column(copy.footer.product, [
          [copy.nav.how, SITE_PATHS.how],
          [copy.nav.create, SITE_PATHS.create],
        ])}
        {column(copy.footer.madeFor, [
          [copy.nav.consultancies, SITE_PATHS.consultancies],
          [copy.nav.software, SITE_PATHS.software],
        ])}
        {column(copy.footer.legal, legal)}
      </Container>
    </footer>
  );
}

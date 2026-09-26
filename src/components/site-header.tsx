import Link from "next/link";

import { signOut } from "@/app/actions";
import type { Locale } from "@/core/i18n/locales";
import type { Translator } from "@/core/i18n/translator";

export function SiteHeader(props: {
  academyName: string;
  t: Translator;
  locales: readonly Locale[];
  signedIn: boolean;
}) {
  const { t } = props;
  return (
    <header className="border-b-outline border-line bg-card">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="font-display text-lg leading-tight">
          {props.academyName}
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {props.locales.length > 1 && (
            <ul className="flex gap-2" aria-label={t.t("nav.language")}>
              {props.locales.map((locale) => (
                <li key={locale}>
                  <a
                    href={`?lang=${locale}`}
                    hrefLang={locale}
                    aria-current={locale === t.locale ? "true" : undefined}
                    className={
                      locale === t.locale ? "font-bold underline" : "opacity-70 hover:opacity-100"
                    }
                  >
                    {locale.toUpperCase()}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {props.signedIn ? (
            <form action={signOut}>
              <button type="submit" className="btn btn-secondary">
                {t.t("nav.signOut")}
              </button>
            </form>
          ) : (
            <Link href="/sign-in" className="btn btn-secondary">
              {t.t("nav.signIn")}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

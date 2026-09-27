import Link from "next/link";

import { signOut } from "@/app/actions";
import type { Locale } from "@/core/i18n/locales";
import type { Translator } from "@/core/i18n/translator";
import type { Logo } from "@/core/theme/schema";

export function SiteHeader(props: {
  academyName: string;
  logo?: Logo;
  t: Translator;
  locales: readonly Locale[];
  signedIn: boolean;
  showStudio: boolean;
}) {
  const { t } = props;
  return (
    <header className="border-b-outline border-line bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-3 font-display text-lg leading-tight">
          {props.logo && (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded logo, any size
            <img
              src={props.logo.src}
              alt={props.logo.show_name ? "" : props.academyName}
              className="h-9 w-auto max-w-48 object-contain"
            />
          )}
          {(!props.logo || props.logo.show_name) && props.academyName}
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm sm:gap-2">
          {props.signedIn && (
            <Link href="/me" className="btn btn-ghost btn-sm">
              {t.t("nav.myLearning")}
            </Link>
          )}
          {props.showStudio && (
            <Link href="/studio" className="btn btn-ghost btn-sm">
              {t.t("nav.studio")}
            </Link>
          )}
          {props.locales.length > 1 && (
            <ul className="flex gap-2 px-2" aria-label={t.t("nav.language")}>
              {props.locales.map((locale) => (
                <li key={locale}>
                  <a
                    href={`?lang=${locale}`}
                    hrefLang={locale}
                    aria-current={locale === t.locale ? "true" : undefined}
                    className={
                      locale === t.locale
                        ? "font-bold underline underline-offset-4"
                        : "text-muted hover:text-ink"
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
              <button type="submit" className="btn btn-secondary btn-sm">
                {t.t("nav.signOut")}
              </button>
            </form>
          ) : (
            <Link href="/sign-in" className="btn btn-secondary btn-sm">
              {t.t("nav.signIn")}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

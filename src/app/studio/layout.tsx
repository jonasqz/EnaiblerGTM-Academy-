import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

import { signOut } from "@/app/actions";
import { StudioNav, type StudioNavItem } from "@/app/studio/studio-nav";
import { StudioTextProvider } from "@/components/studio/studio-text";
import { ErrorTextProvider } from "@/components/ui/error-view";
import { can } from "@/core/access/roles";
import { SUPPORTED_LOCALES } from "@/core/i18n/locales";
import { themeToCssVariables } from "@/core/theme/css";
import { DEFAULT_THEME } from "@/core/theme/enaibler-tokens";
import { getDb } from "@/db/client";
import { requireCapability, reviewScopeOf } from "@/server/access";
import { countHeldSubmissions } from "@/server/studio/reviews";
import { getStudioText, studioTimeZone } from "@/server/studio-text";

export const metadata: Metadata = {
  title: { default: "Studio", template: "%s · Studio" },
  robots: { index: false, follow: false },
};

/**
 * Studio: where authors and reviewers run the academy. It is enaibler's tool,
 * so it always wears enaibler's theme; the academy's own theme applies to
 * what learners see (and to previews of it). It speaks the team member's
 * language (German or English), whatever languages the academy teaches in.
 */
const STUDIO_THEME = themeToCssVariables(DEFAULT_THEME) as CSSProperties;

export default async function StudioLayout({ children }: LayoutProps<"/studio">) {
  const session = await requireCapability("studio.view");
  const { tenant, roles } = session;
  const t = await getStudioText();
  const reviewer = can(roles, "reviews.decide");
  const waiting = reviewer
    ? await countHeldSubmissions(getDb(), tenant.id, reviewScopeOf(session))
    : 0;
  const cohortsOn = tenant.settings.features.cohorts;
  const items: StudioNavItem[] = [
    { icon: "overview", href: "/studio", label: t.t("common.nav.overview") },
    ...(can(roles, "courses.view")
      ? [{ icon: "courses", href: "/studio/courses", label: t.t("common.nav.courses") } as const]
      : []),
    ...(can(roles, "courses.edit")
      ? [{ icon: "videos", href: "/studio/videos", label: t.t("media.nav") } as const]
      : []),
    // Like cohorts: nothing to manage until the academy turns paths on (Settings → Academy).
    ...(tenant.settings.features.paths && can(roles, "courses.edit")
      ? [{ icon: "paths", href: "/studio/paths", label: t.t("common.nav.paths") } as const]
      : []),
    ...(cohortsOn && (can(roles, "cohorts.manage") || roles.includes("mentor"))
      ? [{ icon: "cohorts", href: "/studio/cohorts", label: t.t("common.nav.cohorts") } as const]
      : []),
    // Authors set webinars up; reviewers with people.view see who registered.
    ...(can(roles, "courses.edit") || can(roles, "people.view")
      ? [{ icon: "webinars", href: "/studio/webinars", label: t.t("common.nav.webinars") } as const]
      : []),
    ...(reviewer
      ? [
          {
            icon: "reviews",
            href: "/studio/reviews",
            label: t.t("common.nav.reviews"),
            count: waiting,
          } as const,
        ]
      : []),
    ...(can(roles, "people.view")
      ? [{ icon: "people", href: "/studio/people", label: t.t("common.nav.people") } as const]
      : []),
    ...(can(roles, "academy.manage")
      ? [{ icon: "settings", href: "/studio/settings", label: t.t("common.nav.settings") } as const]
      : []),
  ];

  return (
    <div
      data-theme-scope
      lang={t.locale}
      style={STUDIO_THEME}
      className="flex flex-1 flex-col bg-surface font-body text-ink"
    >
      <header className="border-b-outline border-line bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/studio" className="flex items-center gap-3">
            <span className="font-display text-lg leading-tight">
              {tenant.settings.author_display_name}
            </span>
            <span className="eyebrow rounded-control bg-subtle px-2 py-0.5">
              {t.t("common.studio")}
            </span>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <ul className="flex gap-2 px-2" aria-label={t.t("common.language")}>
              {SUPPORTED_LOCALES.map((option) => (
                <li key={option}>
                  <a
                    href={`?lang=${option}`}
                    hrefLang={option}
                    lang={option}
                    aria-current={option === t.locale ? "true" : undefined}
                    className={
                      option === t.locale
                        ? "font-bold underline underline-offset-4"
                        : "text-muted hover:text-ink"
                    }
                  >
                    {option.toUpperCase()}
                  </a>
                </li>
              ))}
            </ul>
            <Link href="/" className="btn btn-ghost btn-sm">
              {t.t("common.viewAcademy")} <ExternalLink aria-hidden size={14} />
            </Link>
            <form action={signOut}>
              <button type="submit" className="btn btn-secondary btn-sm">
                {t.t("common.signOut")}
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10 lg:py-10">
        <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <StudioNav
            items={items}
            label={t.t("common.studio")}
            waiting={t.t("common.nav.waiting")}
          />
        </aside>
        <main className="min-w-0">
          <StudioTextProvider locale={t.locale} timeZone={studioTimeZone()}>
            <ErrorTextProvider
              text={{
                title: t.t("common.error.title"),
                body: t.t("common.error.body"),
                retry: t.t("common.error.retry"),
                home: t.t("common.error.home"),
              }}
            >
              {children}
            </ErrorTextProvider>
          </StudioTextProvider>
        </main>
      </div>
      <footer className="border-t border-line py-4 text-center text-xs text-muted">
        Powered by enaibler
      </footer>
    </div>
  );
}

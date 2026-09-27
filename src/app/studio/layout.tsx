import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

import { signOut } from "@/app/actions";
import { StudioNav, type StudioNavItem } from "@/app/studio/studio-nav";
import { can } from "@/core/access/roles";
import { themeToCssVariables } from "@/core/theme/css";
import { DEFAULT_THEME } from "@/core/theme/enaibler-tokens";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { countHeldSubmissions } from "@/server/studio/reviews";

export const metadata: Metadata = {
  title: { default: "Studio", template: "%s · Studio" },
  robots: { index: false, follow: false },
};

/**
 * Studio: where authors and reviewers run the academy. It is enaibler's tool,
 * so it always wears enaibler's theme; the academy's own theme applies to
 * what learners see (and to previews of it). English only for now; everything
 * learners see stays DE/EN.
 */
const STUDIO_THEME = themeToCssVariables(DEFAULT_THEME) as CSSProperties;

export default async function StudioLayout({ children }: LayoutProps<"/studio">) {
  const { tenant, roles } = await requireCapability("studio.view");
  const reviewer = can(roles, "reviews.decide");
  const waiting = reviewer ? await countHeldSubmissions(getDb(), tenant.id) : 0;
  const items: StudioNavItem[] = [
    { icon: "overview", href: "/studio", label: "Overview" },
    { icon: "courses", href: "/studio/courses", label: "Courses" },
    ...(reviewer
      ? [{ icon: "reviews", href: "/studio/reviews", label: "Reviews", count: waiting } as const]
      : []),
    ...(can(roles, "people.view")
      ? [{ icon: "people", href: "/studio/people", label: "People" } as const]
      : []),
    ...(can(roles, "academy.manage")
      ? [{ icon: "settings", href: "/studio/settings", label: "Settings" } as const]
      : []),
  ];

  return (
    <div
      data-theme-scope
      style={STUDIO_THEME}
      className="flex flex-1 flex-col bg-surface font-body text-ink"
    >
      <header className="border-b-outline border-line bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/studio" className="flex items-center gap-3">
            <span className="font-display text-lg leading-tight">
              {tenant.settings.author_display_name}
            </span>
            <span className="eyebrow rounded-control bg-subtle px-2 py-0.5">Studio</span>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Link href="/" className="btn btn-ghost btn-sm">
              View academy <ExternalLink aria-hidden size={14} />
            </Link>
            <form action={signOut}>
              <button type="submit" className="btn btn-secondary btn-sm">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10 lg:py-10">
        <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <StudioNav items={items} />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
      <footer className="border-t border-line py-4 text-center text-xs text-muted">
        Powered by enaibler
      </footer>
    </div>
  );
}

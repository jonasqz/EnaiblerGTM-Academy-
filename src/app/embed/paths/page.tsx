import { BookOpen } from "lucide-react";
import type { Metadata } from "next";

import { EmbedHeight } from "@/app/embed/embed-height";
import { CourseCard } from "@/components/course-card";
import { PathCard } from "@/components/path-card";
import { EmptyState } from "@/components/ui/empty-state";
import { embedEntryContext, entryQuery } from "@/core/entry/context";
import { pathColor } from "@/core/theme/css";
import { loadCatalog } from "@/server/catalog";
import { getTenant, getTranslator } from "@/server/request";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Path picker for the academy's own website (brief §2, entry by embed),
 * framed by public/embed.js. The same for everyone: no session, no cookies.
 * A choice opens the academy in a new tab through /start, carrying the
 * language and utm_* of the embed code, as a deep link would.
 */
export default async function EmbedPathsPage({ searchParams }: PageProps<"/embed/paths">) {
  const tenant = await getTenant();
  const t = await getTranslator();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") query.set(key, value);
  }
  const entry = embedEntryContext(query, { tenantLocales: tenant.settings.locales });
  const { paths, courses } = await loadCatalog(tenant, null);
  const fallback = [tenant.settings.default_locale];
  const showHeading = query.get("heading") !== "0";

  return (
    <main id="embed-root" className="space-y-5 p-4 sm:p-5">
      {showHeading && (
        <h1 className="font-display text-2xl">
          {paths.length > 0 ? t.t("home.choosePath") : t.t("home.courses")}
        </h1>
      )}
      {paths.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paths.map((path, index) => (
            <li key={path.id}>
              <PathCard
                path={path}
                index={index}
                theme={tenant.theme}
                t={t}
                fallback={fallback}
                href={`/start?${entryQuery({ ...entry, path: path.slug })}`}
                newTab
              />
            </li>
          ))}
        </ul>
      ) : courses.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((item, index) => (
            <li key={item.course.id}>
              <CourseCard
                entry={item}
                t={t}
                fallback={fallback}
                accent={pathColor(tenant.theme, index)}
                href={`/start?${entryQuery({ ...entry, course: item.course.slug })}`}
                newTab
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={BookOpen} title={t.t("home.empty")} />
      )}
      <EmbedHeight targetId="embed-root" />
    </main>
  );
}

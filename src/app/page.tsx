import Link from "next/link";

import { localize } from "@/core/i18n/locales";
import { pathColor } from "@/core/theme/css";
import { loadCatalog } from "@/server/catalog";
import { getTenant, getTranslator } from "@/server/request";

export default async function HomePage() {
  const tenant = await getTenant();
  const t = await getTranslator();
  const { paths, courses } = await loadCatalog(tenant);
  const fallback = [tenant.settings.default_locale];

  return (
    <div className="space-y-12">
      <section>
        <h1 className="font-display text-3xl sm:text-4xl">{tenant.settings.author_display_name}</h1>
      </section>

      {paths.length > 0 && (
        <section aria-labelledby="paths-heading" className="space-y-4">
          <h2 id="paths-heading" className="font-display text-2xl">
            {t.t("home.choosePath")}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {paths.map((path, index) => (
              <li key={path.id}>
                <Link href={`/paths/${path.slug}`} className="card block h-full overflow-hidden">
                  <span
                    className="block h-3"
                    style={{ background: pathColor(tenant.theme, index, path.color) }}
                  />
                  <span className="block space-y-1 p-5">
                    <span className="block font-display text-xl">
                      {localize(path.title, t.locale, fallback)}
                    </span>
                    {path.promise && (
                      <span className="block text-sm opacity-80">
                        {localize(path.promise, t.locale, fallback)}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="courses-heading" className="space-y-4">
        <h2 id="courses-heading" className="font-display text-2xl">
          {t.t("home.courses")}
        </h2>
        {courses.length === 0 ? (
          <p className="card p-5 opacity-80">{t.t("home.empty")}</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {courses.map((course) => (
              <li key={course.id}>
                <Link href={`/courses/${course.slug}`} className="card block h-full space-y-2 p-5">
                  <span className="block font-display text-xl">
                    {localize(course.title, t.locale, fallback)}
                  </span>
                  {course.summary && (
                    <span className="block text-sm opacity-80">
                      {localize(course.summary, t.locale, fallback)}
                    </span>
                  )}
                  {course.estMinutes && (
                    <span className="block text-sm opacity-70">
                      {t.t("home.minutes", { minutes: course.estMinutes })}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

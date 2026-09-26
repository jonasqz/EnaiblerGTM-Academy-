import Link from "next/link";
import { notFound } from "next/navigation";

import { localize } from "@/core/i18n/locales";
import { pathColor } from "@/core/theme/css";
import { loadPath } from "@/server/catalog";
import { getTenant, getTranslator } from "@/server/request";

export default async function PathPage({ params, searchParams }: PageProps<"/paths/[slug]">) {
  const { slug } = await params;
  const { ctx } = await searchParams;
  const tenant = await getTenant();
  const t = await getTranslator();
  const data = await loadPath(tenant, slug);
  if (!data) notFound();
  const fallback = [tenant.settings.default_locale];
  const query = typeof ctx === "string" ? `?ctx=${encodeURIComponent(ctx)}` : "";

  return (
    <div className="space-y-8">
      <header className="card overflow-hidden">
        <div
          className="h-3"
          style={{ background: pathColor(tenant.theme, data.position, data.path.color) }}
        />
        <div className="space-y-2 p-6">
          <p className="text-sm uppercase tracking-wide opacity-70">{t.term("path")}</p>
          <h1 className="font-display text-3xl">{localize(data.path.title, t.locale, fallback)}</h1>
          {data.path.promise && (
            <p className="text-lg">{localize(data.path.promise, t.locale, fallback)}</p>
          )}
        </div>
      </header>
      <section className="space-y-4">
        <h2 className="font-display text-2xl">{t.t("home.coursesInPath")}</h2>
        {data.courses.length === 0 ? (
          <p className="card p-5 opacity-80">{t.t("home.empty")}</p>
        ) : (
          <ol className="space-y-3">
            {data.courses.map((course, index) => (
              <li key={course.id}>
                <Link
                  href={`/courses/${course.slug}${query}`}
                  className="card flex items-center gap-4 p-5"
                >
                  <span className="font-display text-2xl opacity-60">{index + 1}</span>
                  <span className="font-display text-xl">
                    {localize(course.title, t.locale, fallback)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

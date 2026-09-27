import { notFound } from "next/navigation";

import { CourseCard } from "@/components/course-card";
import { EmptyState } from "@/components/ui/empty-state";
import { localize } from "@/core/i18n/locales";
import { pathColor } from "@/core/theme/css";
import { getSession } from "@/server/access";
import { loadPath } from "@/server/catalog";
import { getTenant, getTranslator } from "@/server/request";
import { BookOpen } from "lucide-react";

export default async function PathPage({ params, searchParams }: PageProps<"/paths/[slug]">) {
  const { slug } = await params;
  const { ctx } = await searchParams;
  const tenant = await getTenant();
  const t = await getTranslator();
  const session = await getSession();
  const data = await loadPath(tenant, slug, session?.viewer.userId ?? null);
  if (!data) notFound();
  const fallback = [tenant.settings.default_locale];
  const color = pathColor(tenant.theme, data.position, data.path.color);
  const query = typeof ctx === "string" ? `?ctx=${encodeURIComponent(ctx)}` : "";

  return (
    <div className="space-y-10">
      <header className="card overflow-hidden">
        <div className="h-3" style={{ background: color }} />
        <div className="space-y-3 p-6 sm:p-10">
          <p className="eyebrow">{t.term("path")}</p>
          <h1 className="font-display text-4xl">{localize(data.path.title, t.locale, fallback)}</h1>
          {data.path.promise && (
            <p className="max-w-2xl text-lg text-muted">
              {localize(data.path.promise, t.locale, fallback)}
            </p>
          )}
        </div>
      </header>
      <section className="space-y-5">
        <h2 className="font-display text-2xl">{t.t("home.coursesInPath")}</h2>
        {data.courses.length === 0 ? (
          <EmptyState icon={BookOpen} title={t.t("home.empty")} />
        ) : (
          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.courses.map((entry, index) => (
              <li key={entry.course.id}>
                <CourseCard
                  entry={entry}
                  t={t}
                  fallback={fallback}
                  accent={color}
                  index={index}
                  href={`/courses/${entry.course.slug}${query}`}
                />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

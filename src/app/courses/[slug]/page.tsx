import { notFound } from "next/navigation";

import { continueUrl } from "@/components/entry-links";
import { decodeEntryContext } from "@/core/entry/context";
import { localize } from "@/core/i18n/locales";
import { getViewer } from "@/server/auth";
import { loadCourse } from "@/server/catalog";
import { getTenant, getTranslator } from "@/server/request";

export default async function CoursePage({ params, searchParams }: PageProps<"/courses/[slug]">) {
  const { slug } = await params;
  const { ctx } = await searchParams;
  const tenant = await getTenant();
  const t = await getTranslator();
  const viewer = await getViewer(tenant);
  const data = await loadCourse(tenant, slug, viewer?.userId ?? null);
  if (!data) notFound();

  const fallback = [tenant.settings.default_locale];
  const entry = {
    ...(decodeEntryContext(typeof ctx === "string" ? ctx : null) ?? {}),
    course: slug,
  };
  const lessons = data.lessons.filter(
    (lesson) => lesson.locale === (data.enrollment?.locale ?? t.locale),
  );

  return (
    <article className="space-y-8">
      <header className="card space-y-3 p-6">
        <p className="text-sm uppercase tracking-wide opacity-70">{t.term("course")}</p>
        <h1 className="font-display text-3xl">{localize(data.course.title, t.locale, fallback)}</h1>
        {data.course.summary && (
          <p className="text-lg">{localize(data.course.summary, t.locale, fallback)}</p>
        )}
        {data.course.estMinutes && (
          <p className="text-sm opacity-70">
            {t.t("home.minutes", { minutes: data.course.estMinutes })}
          </p>
        )}
        {!data.enrollment && (
          <a href={continueUrl(entry)} className="btn btn-primary">
            {t.t("home.start")}
          </a>
        )}
      </header>
      {lessons.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl">{t.term("lesson", { plural: true })}</h2>
          <ol className="card divide-y divide-line">
            {lessons.map((lesson) => (
              <li key={lesson.key} className="flex items-center gap-3 px-5 py-4">
                <span className="opacity-60">{lesson.position + 1}</span>
                <span>{lesson.title}</span>
                {data.enrollment?.lessonProgress[lesson.key] && <span aria-hidden>✓</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}

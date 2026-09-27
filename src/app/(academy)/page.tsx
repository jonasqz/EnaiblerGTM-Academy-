import { Award, BookOpen, Hammer } from "lucide-react";
import Link from "next/link";

import { CourseCard } from "@/components/course-card";
import { EmptyState } from "@/components/ui/empty-state";
import { HeroArt } from "@/components/ui/hero-art";
import { localize } from "@/core/i18n/locales";
import { pathColor } from "@/core/theme/css";
import { getSession } from "@/server/access";
import { loadCatalog } from "@/server/catalog";
import { getTenant, getTranslator } from "@/server/request";

export default async function HomePage() {
  const tenant = await getTenant();
  const t = await getTranslator();
  const session = await getSession();
  const { paths, courses } = await loadCatalog(tenant, session?.viewer.userId ?? null);
  const fallback = [tenant.settings.default_locale];
  const { theme } = tenant;

  const steps = [
    { icon: BookOpen, title: t.t("home.step1Title"), body: t.t("home.step1Body") },
    { icon: Hammer, title: t.t("home.step2Title"), body: t.t("home.step2Body") },
    { icon: Award, title: t.t("home.step3Title"), body: t.t("home.step3Body") },
  ];

  return (
    <div className="space-y-16 sm:space-y-20">
      <section className="grid items-center gap-10 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <p className="eyebrow">{tenant.settings.author_display_name}</p>
          <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">
            {t.t("home.heroTitle")}
          </h1>
          <p className="max-w-xl text-lg text-muted">{t.t("home.heroIntro")}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            {paths.length > 0 && (
              <a href="#paths" className="btn btn-primary">
                {t.t("home.choosePath")}
              </a>
            )}
            <a
              href="#courses"
              className={paths.length > 0 ? "btn btn-secondary" : "btn btn-primary"}
            >
              {t.t("home.browse")}
            </a>
          </div>
        </div>
        <div className="hidden justify-center md:flex">
          <HeroArt colors={theme.colors.accents} outlined={theme.visual_style === "outlined"} />
        </div>
      </section>

      <section aria-labelledby="how-heading" className="space-y-5">
        <h2 id="how-heading" className="font-display text-2xl">
          {t.t("home.howItWorks")}
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="card-flat flex gap-4 p-5">
              <span
                className="grid size-11 shrink-0 place-items-center rounded-control border-outline border-line"
                style={{ background: pathColor(theme, index) }}
              >
                <step.icon aria-hidden size={20} />
              </span>
              <span className="space-y-1">
                <span className="block font-semibold">
                  {index + 1}. {step.title}
                </span>
                <span className="block text-sm text-muted">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {paths.length > 0 && (
        <section id="paths" aria-labelledby="paths-heading" className="scroll-mt-8 space-y-5">
          <h2 id="paths-heading" className="font-display text-2xl">
            {t.t("home.choosePath")}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {paths.map((path, index) => (
              <li key={path.id}>
                <Link
                  href={`/paths/${path.slug}`}
                  className="card card-interactive flex h-full flex-col overflow-hidden"
                >
                  <span
                    className="grid h-24 place-items-center border-b-outline border-line"
                    style={{ background: pathColor(theme, index, path.color) }}
                  >
                    <span className="font-display text-4xl opacity-90">
                      {localize(path.title, t.locale, fallback).slice(0, 1)}
                    </span>
                  </span>
                  <span className="space-y-1 p-5">
                    <span className="block font-display text-xl">
                      {localize(path.title, t.locale, fallback)}
                    </span>
                    {path.promise && (
                      <span className="block text-sm text-muted">
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

      <section id="courses" aria-labelledby="courses-heading" className="scroll-mt-8 space-y-5">
        <h2 id="courses-heading" className="font-display text-2xl">
          {t.t("home.courses")}
        </h2>
        {courses.length === 0 ? (
          <EmptyState icon={BookOpen} title={t.t("home.empty")} />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((entry, index) => (
              <li key={entry.course.id}>
                <CourseCard
                  entry={entry}
                  t={t}
                  fallback={fallback}
                  accent={pathColor(theme, index)}
                  href={`/courses/${entry.course.slug}`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

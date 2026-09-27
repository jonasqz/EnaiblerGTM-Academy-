import { Award, BookOpen, Hammer, ListChecks } from "lucide-react";

import { CourseCard } from "@/components/course-card";
import { PathCard } from "@/components/path-card";
import { EmptyState } from "@/components/ui/empty-state";
import { HeroArt } from "@/components/ui/hero-art";
import { academyEnding } from "@/core/courses/completion";
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

  // Promise only what every published course keeps: real work, the test, or either.
  const ending = academyEnding(courses.map((entry) => entry.course.completionMode));
  const steps = [
    { icon: BookOpen, title: t.t("home.step1Title"), body: t.t("home.step1Body") },
    ending === "work"
      ? { icon: Hammer, title: t.t("home.step2Title"), body: t.t("home.step2Body") }
      : ending === "test"
        ? { icon: ListChecks, title: t.t("home.step2TitleTest"), body: t.t("home.step2BodyTest") }
        : { icon: Hammer, title: t.t("home.step2TitleMixed"), body: t.t("home.step2BodyMixed") },
    {
      icon: Award,
      title: t.t("home.step3Title"),
      body: t.t(ending === "work" ? "home.step3Body" : "home.step3BodyEarned"),
    },
  ];

  return (
    <div className="space-y-16 sm:space-y-20">
      <section className="grid items-center gap-10 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <p className="eyebrow">{tenant.settings.author_display_name}</p>
          <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">
            {t.t(ending === "test" ? "home.heroTitleTest" : "home.heroTitle")}
          </h1>
          <p className="max-w-xl text-lg text-muted">
            {t.t(
              ending === "work"
                ? "home.heroIntro"
                : ending === "test"
                  ? "home.heroIntroTest"
                  : "home.heroIntroMixed",
            )}
          </p>
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
                <PathCard
                  path={path}
                  index={index}
                  theme={theme}
                  t={t}
                  fallback={fallback}
                  href={`/paths/${path.slug}`}
                />
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

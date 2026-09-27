import { ArrowDown, ArrowUp, Route as RouteIcon } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";

import { movePathAction } from "@/app/studio/paths/actions";
import { LevelsEditor } from "@/app/studio/paths/levels-editor";
import { NewPathForm } from "@/app/studio/paths/new-path-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { localize } from "@/core/i18n/locales";
import { createTranslator } from "@/core/i18n/translator";
import { pathColor } from "@/core/theme/css";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { listStudioPaths, loadLevels } from "@/server/studio/paths";

export const metadata: Metadata = { title: "Paths & levels" };

/** Paths and levels (brief §4): optional modules, managed here or by manifest. */
export default async function PathsPage({ searchParams }: PageProps<"/studio/paths">) {
  const { deleted } = await searchParams;
  const { tenant, roles } = await requireCapability("courses.edit", "/studio/paths");
  const { settings, theme } = tenant;
  const [rows, levels] = await Promise.all([
    listStudioPaths(getDb(), tenant.id),
    loadLevels(getDb(), tenant.id),
  ]);
  const locale = settings.default_locale;
  const terms = createTranslator({ locale: "en", termOverrides: tenant.terminology });
  const settingsLink = roles.includes("tenant_admin") ? (
    <Link href="/studio/settings" className="underline">
      Settings
    </Link>
  ) : (
    "Settings (academy admins)"
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Studio"
        title="Paths & levels"
        description={`Paths are ordered sets of courses with an identity learners choose (your academy calls them “${terms.term("path", { plural: true })}”). Levels reward progress along a path. Both are optional.`}
      />
      {deleted === "1" && <Notice tone="good" title="Path deleted" />}
      {!settings.features.paths && (
        <Notice tone="info" title="Paths are switched off">
          Learners see a plain course catalogue. Switch paths on in {settingsLink} when they are
          ready.
        </Notice>
      )}

      <section aria-labelledby="paths-heading" className="space-y-4">
        <h2 id="paths-heading" className="text-lg font-semibold">
          Paths
        </h2>
        {rows.length === 0 ? (
          <EmptyState
            icon={RouteIcon}
            title="No paths yet"
            body="Start with two or three: each one a direction a learner can grow in."
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {rows.map(({ path, courses, learners }, index) => (
              <li key={path.id} className="card-flat flex gap-4 p-4">
                {path.visual?.png || path.visual?.svg ? (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded path pictures
                  <img
                    src={path.visual.svg ?? path.visual.png}
                    alt=""
                    className="size-16 shrink-0 rounded-control object-contain"
                    style={{ background: pathColor(theme, index, path.color) }}
                  />
                ) : (
                  <span
                    aria-hidden
                    className="size-16 shrink-0 rounded-control"
                    style={{ background: pathColor(theme, index, path.color) }}
                  />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <Link
                    href={`/studio/paths/${path.id}` as Route}
                    className="block truncate font-semibold hover:underline"
                  >
                    {localize(path.title, locale)}
                  </Link>
                  {path.promise && (
                    <p className="line-clamp-2 text-sm text-muted">
                      {localize(path.promise, locale)}
                    </p>
                  )}
                  <p className="text-xs text-muted">
                    {courses.length} {courses.length === 1 ? "course" : "courses"} · {learners}{" "}
                    {learners === 1 ? "learner" : "learners"} chose it · /paths/{path.slug}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  {(["up", "down"] as const).map((direction) => (
                    <form key={direction} action={movePathAction}>
                      <input type="hidden" name="pathId" value={path.id} />
                      <input type="hidden" name="direction" value={direction} />
                      <SubmitButton
                        className="btn btn-ghost btn-sm"
                        title={direction === "up" ? "Move up" : "Move down"}
                        disabled={direction === "up" ? index === 0 : index === rows.length - 1}
                      >
                        {direction === "up" ? (
                          <ArrowUp aria-hidden size={16} />
                        ) : (
                          <ArrowDown aria-hidden size={16} />
                        )}
                      </SubmitButton>
                    </form>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        <NewPathForm locale={locale} />
      </section>

      <section aria-labelledby="levels-heading" className="space-y-4">
        <div>
          <h2 id="levels-heading" className="text-lg font-semibold">
            Levels
          </h2>
          <p className="text-sm text-muted">
            A learner&rsquo;s level counts per path. It appears on their certificates as “Level N ·
            name”, so level names follow the same wording rules as course titles.
          </p>
        </div>
        {!settings.features.levels && (
          <Notice tone="info" title="Levels are switched off">
            You can prepare them here; learners see them once levels are on in {settingsLink}.
          </Notice>
        )}
        <LevelsEditor levels={levels} locales={[...settings.locales]} />
      </section>
    </div>
  );
}

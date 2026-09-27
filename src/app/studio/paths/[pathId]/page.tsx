import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  deletePathAction,
  pathCourseAction,
  setPathVisualAction,
} from "@/app/studio/paths/actions";
import { PathForm, PathVisualUpload } from "@/app/studio/paths/[pathId]/path-form";
import { CourseStatusBadge } from "@/components/studio/status-badges";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { localize } from "@/core/i18n/locales";
import { pathColor } from "@/core/theme/css";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { listStudioPaths, loadStudioPath } from "@/server/studio/paths";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("team.path.title") };
}

export default async function PathPage({
  params,
  searchParams,
}: PageProps<"/studio/paths/[pathId]">) {
  const { pathId } = await params;
  const { blocked } = await searchParams;
  const { tenant } = await requireCapability("courses.edit", `/studio/paths/${pathId}`);
  const t = await getStudioText();
  const data = await loadStudioPath(getDb(), tenant.id, pathId);
  if (!data) notFound();
  const { path, courseIds, allCourses } = data;
  const locale = tenant.settings.default_locale;
  const index = (await listStudioPaths(getDb(), tenant.id)).findIndex(
    (row) => row.path.id === pathId,
  );
  const color = pathColor(tenant.theme, Math.max(0, index), path.color);
  const title = (id: string) => {
    const course = allCourses.find((candidate) => candidate.id === id);
    return course ? localize(course.title, locale) : id;
  };
  const available = allCourses.filter((course) => !courseIds.includes(course.id));

  return (
    <div className="space-y-8">
      <Link
        href="/studio/paths"
        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> {t.t("team.paths.title")}
      </Link>
      <h1 className="font-display text-2xl leading-tight sm:text-3xl">
        {localize(path.title, locale)}
      </h1>
      {blocked === "1" && (
        <Notice tone="warning" title={t.t("team.path.stays")}>
          {t.t("team.path.staysBody")}
        </Notice>
      )}

      <PathForm
        pathId={path.id}
        locales={[...tenant.settings.locales]}
        title={path.title}
        promise={path.promise}
        color={path.color}
        fallbackColor={color}
        slug={path.slug}
      />

      <section aria-labelledby="visual-heading" className="card-flat space-y-4 p-5 sm:p-6">
        <div>
          <h2 id="visual-heading" className="text-lg font-semibold">
            {t.t("team.path.picture")}
          </h2>
          <p className="text-sm text-muted">{t.t("team.path.pictureBody")}</p>
        </div>
        <div className="flex flex-wrap items-start gap-6">
          <div
            className="grid size-32 shrink-0 place-items-center rounded-card"
            style={{ background: color }}
          >
            {path.visual?.svg || path.visual?.png ? (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded path picture
              <img
                src={path.visual.svg ?? path.visual.png}
                alt=""
                className="size-28 object-contain"
              />
            ) : (
              <span className="text-sm font-semibold text-[var(--tenant-on-primary)]">
                {t.t("team.path.noPicture")}
              </span>
            )}
          </div>
          <div className="min-w-64 flex-1 space-y-3">
            <PathVisualUpload pathId={path.id} />
            {path.visual && (
              <form action={setPathVisualAction}>
                <input type="hidden" name="pathId" value={path.id} />
                <input type="hidden" name="remove" value="1" />
                <SubmitButton className="btn btn-ghost btn-sm">
                  <X aria-hidden size={16} /> {t.t("team.path.removePicture")}
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="courses-heading" className="card-flat space-y-4 p-5 sm:p-6">
        <div>
          <h2 id="courses-heading" className="text-lg font-semibold">
            {t.t("team.path.courses")}
          </h2>
          <p className="text-sm text-muted">{t.t("team.path.coursesBody")}</p>
        </div>
        {courseIds.length === 0 ? (
          <p className="text-sm text-muted">{t.t("team.path.noCourses")}</p>
        ) : (
          <ol className="space-y-2">
            {courseIds.map((courseId, position) => (
              <li
                key={courseId}
                className="flex flex-wrap items-center gap-3 rounded-control border border-line bg-card px-3 py-2"
              >
                <span className="w-6 text-sm tabular-nums text-muted">{position + 1}</span>
                <span className="min-w-0 flex-1 font-semibold">{title(courseId)}</span>
                <CourseStatusBadge
                  status={allCourses.find((course) => course.id === courseId)?.status ?? "draft"}
                />
                {(
                  [
                    ["up", ArrowUp, t.t("team.paths.moveUp"), position === 0],
                    [
                      "down",
                      ArrowDown,
                      t.t("team.paths.moveDown"),
                      position === courseIds.length - 1,
                    ],
                    ["remove", Trash, t.t("team.path.removeCourse"), false],
                  ] as const
                ).map(([op, Icon, label, disabled]) => (
                  <form key={op} action={pathCourseAction}>
                    <input type="hidden" name="pathId" value={path.id} />
                    <input type="hidden" name="courseId" value={courseId} />
                    <input type="hidden" name="op" value={op} />
                    <SubmitButton
                      className="btn btn-ghost btn-sm"
                      title={label}
                      disabled={disabled}
                    >
                      <Icon aria-hidden size={16} />
                    </SubmitButton>
                  </form>
                ))}
              </li>
            ))}
          </ol>
        )}
        {available.length > 0 && (
          <form action={pathCourseAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="pathId" value={path.id} />
            <input type="hidden" name="op" value="add" />
            <div className="field min-w-56 flex-1">
              <label htmlFor="add-course" className="label">
                {t.t("team.path.addCourse")}
              </label>
              <select id="add-course" name="courseId" className="select">
                {available.map((course) => (
                  <option key={course.id} value={course.id}>
                    {localize(course.title, locale)}
                    {course.status !== "published"
                      ? ` (${t.t(`common.courseStatus.${course.status}`)})`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
            <SubmitButton className="btn btn-secondary">
              <Plus aria-hidden size={16} /> {t.t("common.add")}
            </SubmitButton>
          </form>
        )}
      </section>

      <form action={deletePathAction}>
        <input type="hidden" name="pathId" value={path.id} />
        <SubmitButton className="btn btn-danger btn-sm" confirm={t.t("team.path.deleteConfirm")}>
          <Trash aria-hidden size={16} /> {t.t("team.path.delete")}
        </SubmitButton>
      </form>
    </div>
  );
}

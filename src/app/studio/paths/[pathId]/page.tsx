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

export const metadata: Metadata = { title: "Path" };

export default async function PathPage({
  params,
  searchParams,
}: PageProps<"/studio/paths/[pathId]">) {
  const { pathId } = await params;
  const { blocked } = await searchParams;
  const { tenant } = await requireCapability("courses.edit", `/studio/paths/${pathId}`);
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
        <ArrowLeft aria-hidden size={16} /> Paths & levels
      </Link>
      <h1 className="font-display text-2xl leading-tight sm:text-3xl">
        {localize(path.title, locale)}
      </h1>
      {blocked === "1" && (
        <Notice tone="warning" title="This path stays">
          Learners have chosen it or earned credentials in it. Remove its courses or rename it
          instead.
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
            Picture
          </h2>
          <p className="text-sm text-muted">
            Shown on the path, in the catalogue and on certificates. SVG is best; we also render it
            to PNG for shared certificate images.
          </p>
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
                No picture
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
                  <X aria-hidden size={16} /> Remove picture
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="courses-heading" className="card-flat space-y-4 p-5 sm:p-6">
        <div>
          <h2 id="courses-heading" className="text-lg font-semibold">
            Courses, in order
          </h2>
          <p className="text-sm text-muted">
            Learners on this path take them in this order; level rules count the courses completed
            in it. Only published courses are visible to learners.
          </p>
        </div>
        {courseIds.length === 0 ? (
          <p className="text-sm text-muted">No courses in this path yet.</p>
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
                    ["up", ArrowUp, "Move up", position === 0],
                    ["down", ArrowDown, "Move down", position === courseIds.length - 1],
                    ["remove", Trash, "Remove from path", false],
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
                Add a course
              </label>
              <select id="add-course" name="courseId" className="select">
                {available.map((course) => (
                  <option key={course.id} value={course.id}>
                    {localize(course.title, locale)}
                    {course.status !== "published" ? ` (${course.status})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <SubmitButton className="btn btn-secondary">
              <Plus aria-hidden size={16} /> Add
            </SubmitButton>
          </form>
        )}
      </section>

      <form action={deletePathAction}>
        <input type="hidden" name="pathId" value={path.id} />
        <SubmitButton
          className="btn btn-danger btn-sm"
          confirm="Delete this path? Its courses stay; only the path goes."
        >
          <Trash aria-hidden size={16} /> Delete path
        </SubmitButton>
      </form>
    </div>
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { FormState } from "@/app/studio/actions";
import { localized, text, wording } from "@/app/studio/form-data";
import { hexColorSchema } from "@/core/theme/schema";
import { levelSchemeSchema } from "@/core/levels/rules";
import { getDb } from "@/db/client";
import { getStudioText } from "@/server/studio-text";
import { requireCapability } from "@/server/access";
import {
  createPath,
  deletePath,
  grantLevel,
  loadStudioPath,
  movePath,
  pathVisualFromUpload,
  revokeLevelGrant,
  saveLevels,
  setPathCourses,
  setPathVisual,
  updatePath,
} from "@/server/studio/paths";

const uuid = z.uuid();

function done(pathId?: string) {
  revalidatePath("/", "layout");
  if (pathId) revalidatePath(`/studio/paths/${pathId}`);
}

export async function createPathAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant } = await requireCapability("courses.edit", "/studio/paths");
  const t = await getStudioText();
  const title = localized(formData, "title", tenant.settings.locales);
  const primary = title[tenant.settings.default_locale] ?? Object.values(title)[0];
  if (!primary) return { errors: ["Give the path a name."] };
  const lint = wording(t, [[title, "path_name"]]);
  if (lint.blocking) return { errors: lint.errors };
  const pathId = await createPath(getDb(), tenant.id, { title, slugFrom: primary });
  done();
  redirect(`/studio/paths/${pathId}`);
}

export async function savePathAction(_: FormState, formData: FormData): Promise<FormState> {
  const pathId = uuid.parse(text(formData, "pathId"));
  const { tenant } = await requireCapability("courses.edit", `/studio/paths/${pathId}`);
  const t = await getStudioText();
  const locales = tenant.settings.locales;
  const title = localized(formData, "title", locales);
  if (!title[tenant.settings.default_locale]) {
    return { errors: [`Name the path in the academy's main language.`] };
  }
  const promise = localized(formData, "promise", locales);
  const color = text(formData, "color");
  if (color && !hexColorSchema.safeParse(color).success) {
    return { errors: ["Colours are hex values like #dd7f6c."] };
  }
  const lint = wording(t, [
    [title, "path_name"],
    [promise, "course_description"],
  ]);
  if (lint.blocking) return { errors: lint.errors, warnings: lint.warnings };
  await updatePath(getDb(), tenant.id, pathId, {
    title,
    promise: Object.keys(promise).length > 0 ? promise : null,
    color: color || null,
    slug: text(formData, "slug") || title[tenant.settings.default_locale]!,
  });
  done(pathId);
  return { ok: true, message: "Path saved.", warnings: lint.warnings };
}

export async function setPathVisualAction(formData: FormData): Promise<void> {
  const pathId = uuid.parse(text(formData, "pathId"));
  const { tenant, viewer } = await requireCapability("courses.edit", `/studio/paths/${pathId}`);
  if (formData.get("remove") === "1") {
    await setPathVisual(getDb(), tenant.id, pathId, null);
  } else {
    const visual = await pathVisualFromUpload(
      getDb(),
      tenant.id,
      uuid.parse(text(formData, "fileId")),
      viewer.userId,
    );
    if (visual) await setPathVisual(getDb(), tenant.id, pathId, visual);
  }
  done(pathId);
}

/** Adds, removes or moves one course in the path's order. */
export async function pathCourseAction(formData: FormData): Promise<void> {
  const pathId = uuid.parse(text(formData, "pathId"));
  const { tenant } = await requireCapability("courses.edit", `/studio/paths/${pathId}`);
  const data = await loadStudioPath(getDb(), tenant.id, pathId);
  if (!data) return;
  const courseId = uuid.parse(text(formData, "courseId"));
  const order = [...data.courseIds];
  const index = order.indexOf(courseId);
  switch (text(formData, "op")) {
    case "add":
      if (index < 0 && data.allCourses.some((course) => course.id === courseId))
        order.push(courseId);
      break;
    case "remove":
      if (index >= 0) order.splice(index, 1);
      break;
    case "up":
      if (index > 0) [order[index - 1], order[index]] = [order[index]!, order[index - 1]!];
      break;
    case "down":
      if (index >= 0 && index < order.length - 1) {
        [order[index + 1], order[index]] = [order[index]!, order[index + 1]!];
      }
      break;
  }
  await setPathCourses(getDb(), tenant.id, pathId, order);
  done(pathId);
}

export async function movePathAction(formData: FormData): Promise<void> {
  const { tenant } = await requireCapability("courses.edit", "/studio/paths");
  const direction = text(formData, "direction") === "up" ? "up" : "down";
  await movePath(getDb(), tenant.id, uuid.parse(text(formData, "pathId")), direction);
  done();
}

export async function deletePathAction(formData: FormData): Promise<void> {
  const pathId = uuid.parse(text(formData, "pathId"));
  const { tenant } = await requireCapability("courses.edit", `/studio/paths/${pathId}`);
  const result = await deletePath(getDb(), tenant.id, pathId);
  done();
  redirect(result.ok ? "/studio/paths?deleted=1" : `/studio/paths/${pathId}?blocked=1`);
}

export async function saveLevelsAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant } = await requireCapability("courses.edit", "/studio/paths");
  const t = await getStudioText();
  let input: unknown;
  try {
    input = JSON.parse(text(formData, "levels"));
  } catch {
    return { errors: ["The levels could not be read. Reload the page and try again."] };
  }
  const parsed = levelSchemeSchema.safeParse(input);
  if (!parsed.success) return { errors: parsed.error.issues.map((issue) => issue.message) };
  const lint = wording(
    t,
    parsed.data.map((level) => [level.name, "level_name"] as const),
  );
  if (lint.blocking) return { errors: lint.errors };
  await saveLevels(getDb(), tenant.id, parsed.data);
  done();
  return { ok: true, message: "Levels saved." };
}

export async function grantLevelAction(formData: FormData): Promise<void> {
  const { tenant, viewer } = await requireCapability("courses.edit", "/studio/people");
  await grantLevel(getDb(), tenant, {
    userId: text(formData, "userId"),
    pathId: uuid.parse(text(formData, "pathId")),
    levelN: Number(text(formData, "levelN")),
    grantedBy: viewer.userId,
    reason: text(formData, "reason") || null,
  });
  revalidatePath("/studio/people");
}

export async function revokeGrantAction(formData: FormData): Promise<void> {
  const { tenant } = await requireCapability("courses.edit", "/studio/people");
  await revokeLevelGrant(getDb(), tenant.id, uuid.parse(text(formData, "grantId")));
  revalidatePath("/studio/people");
}

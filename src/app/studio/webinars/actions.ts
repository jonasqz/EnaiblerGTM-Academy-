"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { FormState } from "@/app/studio/actions";
import { text, wording } from "@/app/studio/form-data";
import { addVideoFromForm } from "@/app/studio/videos/create";
import { wordingText } from "@/core/i18n/studio/helpers";
import type { StudioKey } from "@/core/i18n/studio/index";
import type { StudioText } from "@/core/i18n/studio/translator";
import type { WordingFinding } from "@/core/compliance/wording-lint";
import {
  decodeAttendanceFile,
  parseAttendanceCsv,
  type AttendanceFormat,
} from "@/core/webinars/attendance-csv";
import {
  landingBlocksSchema,
  presentersSchema,
  registrationFormSchema,
} from "@/core/webinars/landing";
import { isReliveAccess } from "@/core/webinars/relive";
import { validateSetup, type WebinarSetupInput } from "@/core/webinars/setup";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { getStudioText } from "@/server/studio-text";
import { attachRecording, detachRecording, setReliveAccess } from "@/server/webinars/recording";
import {
  cancelWebinar,
  createWebinar,
  deleteDraftWebinar,
  importAttendance,
  loadStudioWebinar,
  previewAttendance,
  publishWebinar,
  setAttendance,
  updateWebinarContent,
  updateWebinarSetup,
  type AttendancePreview,
} from "@/server/webinars/studio";

/*
 * Studio actions for webinars. Each re-checks its capability (courses.edit
 * to set one up and manage its recording, courses.publish to publish or
 * cancel it) and takes the academy from the host, never from the form.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function webinarIdOf(formData: FormData): string {
  const id = text(formData, "webinarId");
  if (!UUID.test(id)) redirect("/studio/webinars");
  return id;
}

function setupInput(formData: FormData): WebinarSetupInput {
  return {
    slug: text(formData, "slug"),
    locale: text(formData, "locale"),
    title: text(formData, "title"),
    description: text(formData, "description"),
    date: text(formData, "date"),
    time: text(formData, "time"),
    timeZone: text(formData, "timeZone"),
    durationMinutes: text(formData, "durationMinutes"),
    capacity: text(formData, "capacity"),
    joinUrl: text(formData, "joinUrl"),
    courseId: text(formData, "courseId"),
    recorded: formData.get("recorded") === "on",
    recordingNotice: text(formData, "recordingNotice"),
  };
}

const issueText = (t: StudioText, issue: string) => t.t(`webinars.issue.${issue}` as StudioKey);

function wordingState(
  t: StudioText,
  findings: WordingFinding[],
): Pick<FormState, "errors" | "warnings"> {
  return {
    errors: findings.filter((f) => f.severity === "error").map((f) => wordingText(t, f)),
    warnings: findings.filter((f) => f.severity === "warning").map((f) => wordingText(t, f)),
  };
}

export async function createWebinarAction(_: FormState, formData: FormData): Promise<FormState> {
  const { tenant, viewer } = await requireCapability("courses.edit", "/studio/webinars");
  const t = await getStudioText();
  // The rest of the setup comes later; the address is made from the title.
  const checked = validateSetup(
    {
      ...setupInput(formData),
      slug: "draft",
      description: "",
      capacity: "",
      joinUrl: "",
      courseId: "",
      recorded: false,
      recordingNotice: "",
    },
    { locales: tenant.settings.locales },
  );
  if (!checked.ok) return { errors: checked.issues.map((issue) => issueText(t, issue)) };
  const id = await createWebinar(getDb(), tenant.id, {
    title: checked.setup.title,
    locale: checked.setup.locale,
    startsAt: checked.setup.startsAt,
    timeZone: checked.setup.timeZone,
    durationMinutes: checked.setup.durationMinutes,
    createdBy: viewer.userId,
  });
  redirect(`/studio/webinars/${id}/setup?created=1`);
}

export async function updateSetupAction(_: FormState, formData: FormData): Promise<FormState> {
  const webinarId = webinarIdOf(formData);
  const { tenant } = await requireCapability("courses.edit", `/studio/webinars/${webinarId}`);
  const t = await getStudioText();
  const checked = validateSetup(setupInput(formData), { locales: tenant.settings.locales });
  if (!checked.ok) return { errors: checked.issues.map((issue) => issueText(t, issue)) };
  const result = await updateWebinarSetup(getDb(), tenant, webinarId, checked.setup);
  if (!result.ok) {
    return result.error === "wording"
      ? wordingState(t, result.findings)
      : { errors: [t.t(`webinars.error.${result.error}`)] };
  }
  revalidatePath(`/studio/webinars/${webinarId}`, "layout");
  const message = [
    t.t(result.rescheduled ? "webinars.savedRescheduled" : "webinars.saved"),
    ...(result.promoted > 0 ? [t.n("webinars.savedPromoted", result.promoted)] : []),
  ].join(" ");
  return { ok: true, message, ...wordingState(t, result.findings) };
}

async function saveContent(
  formData: FormData,
  field: "blocks" | "presenters" | "form",
): Promise<FormState> {
  const webinarId = webinarIdOf(formData);
  const { tenant } = await requireCapability("courses.edit", `/studio/webinars/${webinarId}`);
  const t = await getStudioText();
  let raw: unknown;
  try {
    raw = JSON.parse(text(formData, field));
  } catch {
    raw = null;
  }
  const invalid: Record<typeof field, StudioKey> = {
    blocks: "webinars.page.invalid",
    presenters: "webinars.presenters.invalid",
    form: "webinars.form.invalid",
  };
  let update;
  if (field === "blocks") {
    const parsed = landingBlocksSchema.safeParse(raw);
    if (!parsed.success) {
      const known = parsed.error.issues
        .map((issue) => issue.message)
        .filter((message) => message === "hero_first" || message === "register_missing");
      return {
        errors: known.length
          ? known.map((message) => t.t(`webinars.page.error.${message}` as StudioKey))
          : [t.t(invalid.blocks)],
      };
    }
    update = { blocks: parsed.data };
  } else if (field === "presenters") {
    const parsed = presentersSchema.safeParse(raw);
    if (!parsed.success) return { errors: [t.t(invalid.presenters)] };
    update = { presenters: parsed.data };
  } else {
    const parsed = registrationFormSchema.safeParse(raw);
    if (!parsed.success) return { errors: [t.t(invalid.form)] };
    update = { form: parsed.data };
  }
  const result = await updateWebinarContent(getDb(), tenant.id, webinarId, update);
  if (!result.ok) {
    return result.error === "wording"
      ? wordingState(t, result.findings)
      : { errors: [t.t(`webinars.error.${result.error}`)] };
  }
  revalidatePath(`/studio/webinars/${webinarId}`, "layout");
  return { ok: true, message: t.t("webinars.saved"), ...wordingState(t, result.findings) };
}

export async function saveLandingAction(_: FormState, formData: FormData): Promise<FormState> {
  return saveContent(formData, "blocks");
}

export async function savePresentersAction(_: FormState, formData: FormData): Promise<FormState> {
  return saveContent(formData, "presenters");
}

export async function saveFormAction(_: FormState, formData: FormData): Promise<FormState> {
  return saveContent(formData, "form");
}

export async function publishWebinarAction(formData: FormData): Promise<void> {
  const webinarId = webinarIdOf(formData);
  const { tenant } = await requireCapability("courses.publish", `/studio/webinars/${webinarId}`);
  await publishWebinar(getDb(), tenant, webinarId);
  revalidatePath(`/studio/webinars/${webinarId}`, "layout");
}

export async function cancelWebinarAction(formData: FormData): Promise<void> {
  const webinarId = webinarIdOf(formData);
  const { tenant } = await requireCapability("courses.publish", `/studio/webinars/${webinarId}`);
  await cancelWebinar(getDb(), tenant, webinarId);
  revalidatePath(`/studio/webinars/${webinarId}`, "layout");
}

export async function deleteWebinarAction(formData: FormData): Promise<void> {
  const webinarId = webinarIdOf(formData);
  const { tenant } = await requireCapability("courses.edit", `/studio/webinars/${webinarId}`);
  await deleteDraftWebinar(getDb(), tenant.id, webinarId);
  redirect("/studio/webinars");
}

export async function setAttendanceAction(formData: FormData): Promise<void> {
  const webinarId = webinarIdOf(formData);
  const { tenant } = await requireCapability(
    "courses.edit",
    `/studio/webinars/${webinarId}/registrants`,
  );
  const registrationId = text(formData, "registrationId");
  if (UUID.test(registrationId)) {
    await setAttendance(
      getDb(),
      tenant,
      webinarId,
      registrationId,
      formData.get("attended") === "1",
    );
  }
  revalidatePath(`/studio/webinars/${webinarId}/registrants`);
}

const recordingPath = (webinarId: string) => `/studio/webinars/${webinarId}/recording`;

function recordingSaved(webinarId: string) {
  revalidatePath(`/studio/webinars/${webinarId}`, "layout");
  // Studio → Videos shows whose recording a video is and its access.
  revalidatePath("/studio/videos", "layout");
}

/** A video of the library becomes the webinar's recording (webinar brief §2.4). */
export async function attachRecordingAction(_: FormState, formData: FormData): Promise<FormState> {
  const webinarId = webinarIdOf(formData);
  const { tenant } = await requireCapability("courses.edit", recordingPath(webinarId));
  const t = await getStudioText();
  const result = await attachRecording(getDb(), tenant.id, webinarId, text(formData, "assetId"));
  if (!result.ok) return { errors: [t.t(`webinars.recording.error.${result.issue}`)] };
  recordingSaved(webinarId);
  // The picker may have no video left to offer: the page says it instead of the form.
  redirect(`${recordingPath(webinarId)}?attached=1`);
}

/** Uploads a video, makes one of a course recording or embeds one, as the webinar's recording. */
export async function addRecordingAction(_: FormState, formData: FormData): Promise<FormState> {
  const webinarId = webinarIdOf(formData);
  const { tenant, viewer } = await requireCapability("courses.edit", recordingPath(webinarId));
  const t = await getStudioText();
  const loaded = await loadStudioWebinar(getDb(), tenant.id, webinarId);
  if (!loaded) return { errors: [t.t("webinars.recording.error.not_found")] };
  // Checked before the video is made, so none is left behind in the library.
  if (loaded.webinar.status === "cancelled") {
    return { errors: [t.t("webinars.recording.error.cancelled")] };
  }
  const added = await addVideoFromForm(tenant, viewer.userId, t, formData);
  if (!added.ok) return { errors: [added.error] };
  const attached = await attachRecording(getDb(), tenant.id, webinarId, added.id);
  recordingSaved(webinarId);
  if (!attached.ok) return { errors: [t.t(`webinars.recording.error.${attached.issue}`)] };
  return {
    ok: true,
    message: t.t(
      added.kind === "embed" ? "webinars.recording.addedEmbed" : "webinars.recording.added",
    ),
    warnings: wording(t, [[added.title, "lesson_text"]]).warnings,
  };
}

export async function removeRecordingAction(formData: FormData): Promise<void> {
  const webinarId = webinarIdOf(formData);
  const { tenant } = await requireCapability("courses.edit", recordingPath(webinarId));
  await detachRecording(getDb(), tenant.id, webinarId);
  recordingSaved(webinarId);
  redirect(`${recordingPath(webinarId)}?removed=1`);
}

/** Who may watch: widening needs the confirmation ticked, and records who and when. */
export async function saveReliveAccessAction(_: FormState, formData: FormData): Promise<FormState> {
  const webinarId = webinarIdOf(formData);
  const { tenant, viewer } = await requireCapability("courses.edit", recordingPath(webinarId));
  const t = await getStudioText();
  const access = text(formData, "access");
  if (!isReliveAccess(access)) return { errors: [t.t("webinars.recording.error.not_found")] };
  const result = await setReliveAccess(getDb(), tenant.id, webinarId, access, {
    confirmed: formData.get("confirm") === "on",
    userId: viewer.userId,
  });
  if (!result.ok) return { errors: [t.t(`webinars.recording.error.${result.issue}`)] };
  recordingSaved(webinarId);
  return { ok: true, message: t.t("webinars.recording.saved") };
}

export type AttendanceFileState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "preview"; preview: AttendancePreview; format: AttendanceFormat }
  | { status: "imported"; message: string };

/** Attendance from a tool's export: "check" shows what matches, "import" saves it. */
export async function attendanceFileAction(
  _: AttendanceFileState,
  formData: FormData,
): Promise<AttendanceFileState> {
  const webinarId = webinarIdOf(formData);
  const { tenant } = await requireCapability(
    "courses.edit",
    `/studio/webinars/${webinarId}/registrants`,
  );
  const t = await getStudioText();
  const file = formData.get("file");
  const loaded = await loadStudioWebinar(getDb(), tenant.id, webinarId);
  if (!loaded) redirect("/studio/webinars");
  if (!(file instanceof File) || file.size === 0 || file.size > 2 * 1024 * 1024) {
    return { status: "error", message: t.t("webinars.import.unreadable") };
  }
  let parse;
  try {
    parse = parseAttendanceCsv(decodeAttendanceFile(new Uint8Array(await file.arrayBuffer())), {
      timeZone: loaded.webinar.timeZone,
    });
  } catch {
    return { status: "error", message: t.t("webinars.import.unreadable") };
  }
  if (parse.rows.length === 0) return { status: "error", message: t.t("webinars.import.empty") };
  if (formData.get("intent") === "import") {
    const result = await importAttendance(getDb(), tenant, webinarId, parse);
    revalidatePath(`/studio/webinars/${webinarId}`, "layout");
    return {
      status: "imported",
      message: t.t("webinars.import.done", {
        added: result?.added ?? 0,
        updated: result?.updated ?? 0,
      }),
    };
  }
  return {
    status: "preview",
    preview: await previewAttendance(getDb(), tenant.id, webinarId, parse),
    format: parse.format,
  };
}

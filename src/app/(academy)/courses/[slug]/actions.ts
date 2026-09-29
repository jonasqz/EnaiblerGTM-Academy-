"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { CheckInState } from "@/app/(academy)/webinars/[slug]/actions";
import { requiresWork, type CompletionPart } from "@/core/courses/completion";
import { localize } from "@/core/i18n/locales";
import { TEST_ATTEMPTS_PER_HOUR } from "@/core/questions/quiz";
import { getDb } from "@/db/client";
import { requireViewer } from "@/server/access";
import { enqueue } from "@/server/jobs/producer";
import {
  completeLesson,
  submitAssignment,
  submitTest,
  type TestSubmitError,
} from "@/server/learning";
import { rateLimit } from "@/server/rate-limit";
import { getTranslator } from "@/server/request";
import { checkIn } from "@/server/webinars/registration";
import { registerForSession } from "@/server/webinars/series";

const HOUR = 60 * 60_000;

export async function completeLessonAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "");
  const key = String(formData.get("key") ?? "");
  const { tenant, viewer } = await requireViewer(`/courses/${slug}`);
  const result = await completeLesson(getDb(), tenant, viewer.userId, { courseSlug: slug, key });
  if (!result) redirect(`/courses/${slug}`);
  revalidatePath(`/courses/${slug}`);
  redirect(
    result.nextKey
      ? `/courses/${slug}/learn/${result.nextKey}`
      : requiresWork(result.completionMode)
        ? `/courses/${slug}/assignment`
        : `/courses/${slug}/test`,
  );
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The check-in code of a session, entered in its lesson; the course catches up at once. */
export async function sessionCheckInAction(
  _previous: CheckInState,
  formData: FormData,
): Promise<CheckInState> {
  const webinar = String(formData.get("slug") ?? "");
  const course = String(formData.get("course") ?? "");
  if (!SLUG.test(webinar) || !SLUG.test(course)) return { status: "closed" };
  const { tenant, viewer } = await requireViewer(`/courses/${course}`);
  const result = await checkIn(getDb(), tenant, {
    slug: webinar,
    userId: viewer.userId,
    code: String(formData.get("code") ?? ""),
  });
  if (result === "done") revalidatePath(`/courses/${course}`, "layout");
  return { status: result };
}

/** A seat in one session of the series again (after cancelling it, or one added later). */
export async function registerForSessionAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "");
  const key = String(formData.get("key") ?? "");
  const webinarId = String(formData.get("webinar") ?? "");
  if (!SLUG.test(slug) || !UUID.test(webinarId)) redirect("/");
  const { tenant, viewer } = await requireViewer(`/courses/${slug}`);
  const result = await registerForSession(getDb(), tenant, {
    userId: viewer.userId,
    courseSlug: slug,
    webinarId,
  });
  revalidatePath(`/courses/${slug}`, "layout");
  redirect(`/courses/${slug}/learn/${encodeURIComponent(key)}?session=${result}`);
}

export type SubmitState =
  | { status: "idle" }
  | {
      status: "error";
      error: "empty" | "not_allowed" | "invalid" | "not_enrolled" | "late";
      fieldErrors?: Record<string, string>;
    };

export async function submitAssignmentAction(
  _previous: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const slug = String(formData.get("slug") ?? "");
  const { tenant, viewer } = await requireViewer(`/courses/${slug}/assignment`);
  const form: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("field.") && typeof value === "string") form[key.slice(6)] = value;
  }
  const result = await submitAssignment(
    getDb(),
    tenant,
    viewer.userId,
    slug,
    {
      text: typeof formData.get("text") === "string" ? String(formData.get("text")) : undefined,
      url: typeof formData.get("url") === "string" ? String(formData.get("url")) : undefined,
      form: Object.keys(form).length > 0 ? form : undefined,
      fileIds: formData
        .getAll("files")
        .filter((value): value is string => typeof value === "string"),
    },
    enqueue,
  );
  if (!result.ok) return { status: "error", error: result.error, fieldErrors: result.fieldErrors };
  revalidatePath(`/courses/${slug}/assignment`);
  // A new address, not just a new #hash: a hash-only redirect keeps the old page on screen.
  redirect(`/courses/${slug}/assignment?attempt=${result.attemptNo}#attempts`);
}

export type TestState =
  | { status: "idle" }
  | { status: "error"; error: TestSubmitError | "too_many"; unanswered: string[] }
  | {
      status: "graded";
      attemptNo: number;
      correct: number;
      total: number;
      percent: number;
      passed: boolean;
      passPercent: number;
      /** Only where the course shows mistakes. */
      wrong: string[] | null;
      /** Null without a limit on attempts. */
      attemptsLeft: number | null;
      /** Issued with this pass; the level it reached comes in words. */
      credential: { publicId: string; levelLine: string | null } | null;
      /** What the credential still waits for after a pass. */
      missing: CompletionPart[];
    };

export async function submitTestAction(
  _previous: TestState,
  formData: FormData,
): Promise<TestState> {
  const slug = String(formData.get("slug") ?? "");
  const { tenant, viewer } = await requireViewer(`/courses/${slug}/test`);
  // Retakes, limited or not, never at machine speed: guessing by script stays impractical.
  if (!rateLimit(`test:${tenant.id}:${viewer.userId}:${slug}`, TEST_ATTEMPTS_PER_HOUR, HOUR)) {
    return { status: "error", error: "too_many", unanswered: [] };
  }
  const version = String(formData.get("version") ?? "");
  const attempt = String(formData.get("attempt") ?? "");
  const result = await submitTest(getDb(), tenant, viewer.userId, slug, {
    entries: formData.entries(),
    version: /^\d+$/.test(version) ? Number(version) : undefined,
    attempt: /^\d+$/.test(attempt) ? Number(attempt) : undefined,
  });
  if (!result.ok) {
    // The page catches up: an edited test shows its current questions (choices
    // on the others stay), a pass from another tab shows as passed.
    if (["changed", "passed", "completed", "no_attempts_left"].includes(result.error)) {
      revalidatePath(`/courses/${slug}/test`);
    }
    return { status: "error", error: result.error, unanswered: result.unanswered ?? [] };
  }
  revalidatePath(`/courses/${slug}/test`);
  const t = await getTranslator();
  const completion = result.completion;
  const level = completion?.issued ? completion.levelUp : null;
  return {
    status: "graded",
    attemptNo: result.attemptNo,
    correct: result.correct,
    total: result.total,
    percent: result.percent,
    passed: result.passed,
    passPercent: result.passPercent,
    wrong: result.wrong,
    attemptsLeft: result.attemptsLeft,
    credential: completion?.issued
      ? {
          publicId: completion.publicId,
          levelLine: level
            ? t.t("test.levelUp", {
                n: level.n,
                name: localize(level.name, t.locale, [tenant.settings.default_locale]),
              })
            : null,
        }
      : null,
    missing: completion && !completion.issued ? completion.missing : [],
  };
}

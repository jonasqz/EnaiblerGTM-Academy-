"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { continueUrl } from "@/components/entry-links";
import { decodeEntryContext } from "@/core/entry/context";
import type { AnswerIssue } from "@/core/webinars/landing";
import { getDb } from "@/db/client";
import { requireViewer } from "@/server/access";
import { authFor, getViewer } from "@/server/auth";
import { startNewsOptIn } from "@/server/consent";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { getTenant, getTranslator } from "@/server/request";
import { cancelKeyValid } from "@/server/webinars/links";
import { joinSeriesAfterSeat } from "@/server/webinars/series";
import {
  cancelRegistration,
  checkIn,
  registerSignedIn,
  startRegistration,
  type CheckInResult,
  type RegistrationRequest,
} from "@/server/webinars/registration";

export type RegisterState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message?: string; fields?: Record<string, string> };

const TEN_MINUTES = 10 * 60_000;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function slugOf(formData: FormData): string | null {
  const slug = text(formData, "slug");
  return SLUG.test(slug) && slug.length <= 64 ? slug : null;
}

/** Name and custom fields as typed ("field.<id>" in the form). */
function answersOf(formData: FormData): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (key === "name") answers.name = value;
    else if (key.startsWith("field.")) answers[key.slice(6)] = value.slice(0, 4000);
  }
  return answers;
}

/**
 * The registration form, on the page and in the embed. Signed in, it
 * registers at once; otherwise the answers wait for the magic link, which is
 * the one mail this sends.
 */
export async function registerAction(
  _previous: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const tenant = await getTenant();
  const t = await getTranslator();
  const failure: RegisterState = { status: "error", message: t.t("webinar.form.error") };
  const slug = slugOf(formData);
  if (!slug) return failure;
  const typed = text(formData, "email").toLowerCase();

  // Bots fill every field; people never see this one.
  if (text(formData, "website")) return { status: "sent", email: typed };

  const requestHeaders = await headers();
  if (!rateLimit(`webinar-ip:${clientIp(requestHeaders)}`, 20, TEN_MINUTES)) return failure;

  const request: RegistrationRequest = {
    answers: answersOf(formData),
    marketing: formData.get("marketing") === "on",
    leadHandoff: formData.get("leadHandoff") === "on",
    locale: t.locale,
    entry: decodeEntryContext(text(formData, "ctx")) ?? {},
  };
  const answerErrors = (issues: AnswerIssue[]): RegisterState => ({
    status: "error",
    fields: Object.fromEntries(
      issues.map((issue) => [
        issue.field,
        t.t(
          issue.code === "required"
            ? "webinar.form.errorRequired"
            : issue.code === "too_long"
              ? "webinar.form.errorTooLong"
              : "webinar.form.errorOption",
        ),
      ]),
    ),
  });

  // Embedded on another site the session cookie never arrives; the form is the way in.
  const viewer = formData.get("embedded") === "1" ? null : await getViewer(tenant);
  if (viewer) {
    // A session of a series enrolls in the whole series (server/webinars/series).
    const result = await registerSignedIn(
      getDb(),
      tenant,
      { slug, userId: viewer.userId, email: viewer.email, request, t },
      { afterSeat: joinSeriesAfterSeat(tenant) },
    );
    if (!result.ok) {
      if (result.error === "answers") return answerErrors(result.issues);
      return result.error === "closed"
        ? { status: "error", message: t.t("webinar.registrationClosed") }
        : failure;
    }
    if (result.marketing && !result.already) await startNewsOptIn(getDb(), tenant, viewer, t);
    redirect(`/webinars/${slug}?confirmed=${result.status}#register`);
  }

  const email = z.email().safeParse(typed);
  if (!email.success) {
    return { status: "error", fields: { email: t.t("webinar.form.errorEmail") } };
  }
  if (!rateLimit(`webinar:${tenant.id}:${email.data}`, 5, TEN_MINUTES)) return failure;
  const started = await startRegistration(getDb(), tenant, {
    slug,
    email: email.data,
    request,
    t,
  });
  if (!started.ok) {
    if (started.error === "answers") return answerErrors(started.issues);
    return started.error === "closed"
      ? { status: "error", message: t.t("webinar.registrationClosed") }
      : failure;
  }
  try {
    await authFor(tenant).api.signInMagicLink({
      body: {
        email: email.data,
        callbackURL: continueUrl(request.entry, `/webinars/${slug}/confirm?token=${started.token}`),
        errorCallbackURL: `/webinars/${slug}?confirm=invalid`,
        metadata: { locale: t.locale, webinarRegistration: started.registrationId },
      },
      headers: requestHeaders,
    });
  } catch (error) {
    console.error("[webinars] magic link failed", error);
    return failure;
  }
  return { status: "sent", email: email.data };
}

/** Cancelling on the page or in "My learning" (signed in, one's own registration). */
export async function cancelRegistrationAction(formData: FormData): Promise<void> {
  const slug = slugOf(formData);
  const registrationId = text(formData, "registration");
  if (!slug || !UUID.test(registrationId)) redirect("/webinars");
  const { tenant, viewer } = await requireViewer(`/webinars/${slug}`);
  await cancelRegistration(getDb(), tenant, { registrationId, userId: viewer.userId });
  if (formData.get("back") === "me") {
    revalidatePath("/me");
    redirect("/me#webinars");
  }
  redirect(`/webinars/${slug}?cancelled=1#register`);
}

/** The link in every mail: its key opens this one registration, signed in or not. */
export async function cancelByLinkAction(formData: FormData): Promise<void> {
  const tenant = await getTenant();
  const slug = slugOf(formData);
  const registrationId = text(formData, "r");
  const key = text(formData, "k");
  if (!slug || !UUID.test(registrationId) || !cancelKeyValid(tenant.id, registrationId, key)) {
    redirect(`/webinars/${slug ?? ""}`);
  }
  const result = await cancelRegistration(getDb(), tenant, { registrationId });
  redirect(`/webinars/${slug}/cancel?${result.ok ? "done=1" : "invalid=1"}`);
}

export type CheckInState = { status: "idle" } | { status: CheckInResult };

export async function checkInAction(
  _previous: CheckInState,
  formData: FormData,
): Promise<CheckInState> {
  const slug = slugOf(formData);
  if (!slug) return { status: "closed" };
  const { tenant, viewer } = await requireViewer(`/webinars/${slug}`);
  const result = await checkIn(getDb(), tenant, {
    slug,
    userId: viewer.userId,
    code: text(formData, "code"),
  });
  if (result === "done") revalidatePath(`/webinars/${slug}`);
  return { status: result };
}

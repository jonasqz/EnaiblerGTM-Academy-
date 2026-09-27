"use server";

import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { requireViewer } from "@/server/access";
import { joinCohort } from "@/server/cohorts";
import { getTranslator } from "@/server/request";

export async function joinCohortAction(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").toLowerCase();
  const { tenant, viewer } = await requireViewer(`/join/${code}`);
  const t = await getTranslator();
  const result = await joinCohort(getDb(), tenant, viewer.userId, {
    code,
    locale: t.locale,
    entry: {},
  });
  redirect(result.ok ? `/courses/${result.courseSlug}` : `/join/${code}`);
}

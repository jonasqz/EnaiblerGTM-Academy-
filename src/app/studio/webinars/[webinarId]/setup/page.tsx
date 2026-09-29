import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getStudioWebinar } from "@/app/studio/webinars/[webinarId]/load";
import { SetupForm } from "@/app/studio/webinars/[webinarId]/setup/setup-form";
import { Notice } from "@/components/ui/notice";
import { localize } from "@/core/i18n/locales";
import { languageName } from "@/core/i18n/studio/helpers";
import { timeZoneOptions, utcToZonedInput } from "@/core/webinars/time";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { getStudioText } from "@/server/studio-text";
import { courseOptions } from "@/server/webinars/studio";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("webinars.tab.setup") };
}

export default async function WebinarSetupPage({
  params,
  searchParams,
}: PageProps<"/studio/webinars/[webinarId]/setup">) {
  const { webinarId } = await params;
  const { created } = await searchParams;
  const { tenant } = await requireCapability("courses.edit", `/studio/webinars/${webinarId}/setup`);
  const t = await getStudioText();
  const loaded = await getStudioWebinar(tenant.id, webinarId);
  if (!loaded) notFound();
  const { webinar } = loaded;
  const when = utcToZonedInput(webinar.startsAt, webinar.timeZone);
  const locale = tenant.settings.default_locale;
  const courses = await courseOptions(getDb(), tenant.id);

  return (
    <div className="space-y-6">
      {created === "1" && <Notice tone="good" title={t.t("webinars.created")} />}
      {webinar.status === "cancelled" && (
        <Notice tone="warning" title={t.t("webinars.error.cancelled")} />
      )}
      <SetupForm
        values={{
          webinarId: webinar.id,
          slug: webinar.slug,
          slugLocked: webinar.status !== "draft",
          locale: webinar.locale,
          title: webinar.title,
          description: webinar.description,
          date: when.date,
          time: when.time,
          timeZone: webinar.timeZone,
          durationMinutes: webinar.durationMinutes,
          capacity: webinar.capacity,
          joinUrl: webinar.joinUrl ?? "",
          courseId: webinar.courseId ?? "",
          recorded: webinar.recorded,
          recordingNotice: webinar.recordingNotice ?? "",
        }}
        languages={tenant.settings.locales.map((code) => ({ code, label: languageName(t, code) }))}
        courses={courses.map((course) => ({
          id: course.id,
          label: `${localize(course.title, locale)}${course.status === "published" ? "" : ` (${t.t("common.courseStatus.draft")})`}`,
        }))}
        timeZones={timeZoneOptions()}
      />
    </div>
  );
}

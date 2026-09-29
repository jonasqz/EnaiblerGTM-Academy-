import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FormBuilder } from "@/app/studio/webinars/[webinarId]/form/form-builder";
import { getStudioWebinar } from "@/app/studio/webinars/[webinarId]/load";
import { requireCapability } from "@/server/access";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("webinars.form.title") };
}

export default async function WebinarFormPage({
  params,
}: PageProps<"/studio/webinars/[webinarId]/form">) {
  const { webinarId } = await params;
  const { tenant } = await requireCapability("courses.edit", `/studio/webinars/${webinarId}/form`);
  const loaded = await getStudioWebinar(tenant.id, webinarId);
  if (!loaded) notFound();
  return (
    <FormBuilder
      webinarId={loaded.webinar.id}
      form={loaded.webinar.form}
      academy={tenant.settings.author_display_name}
    />
  );
}

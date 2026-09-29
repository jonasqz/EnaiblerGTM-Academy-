import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { LandingEditor } from "@/app/studio/webinars/[webinarId]/landing/landing-editor";
import { getStudioWebinar } from "@/app/studio/webinars/[webinarId]/load";
import { landingView } from "@/components/webinars/view";
import { isLocale } from "@/core/i18n/locales";
import { languageName } from "@/core/i18n/studio/helpers";
import { themeToCssVariables } from "@/core/theme/css";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { getStudioText } from "@/server/studio-text";
import { loadWebinarPage } from "@/server/webinars/public";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("webinars.page.title") };
}

/** The landing page's blocks and presenters, previewed in the academy's own theme. */
export default async function WebinarLandingPage({
  params,
}: PageProps<"/studio/webinars/[webinarId]/landing">) {
  const { webinarId } = await params;
  const { tenant } = await requireCapability(
    "courses.edit",
    `/studio/webinars/${webinarId}/landing`,
  );
  const t = await getStudioText();
  const loaded = await getStudioWebinar(tenant.id, webinarId);
  if (!loaded) notFound();
  const page = await loadWebinarPage(getDb(), tenant.id, loaded.webinar.slug, { drafts: true });
  if (!page) notFound();
  const { webinar } = page;
  const view = landingView({
    webinar,
    course: page.course,
    taken: page.taken,
    fallback: tenant.settings.default_locale,
    now: new Date(),
  });
  // The preview's page chrome speaks the webinar's language where the academy offers it.
  const locale =
    isLocale(webinar.locale) && tenant.settings.locales.includes(webinar.locale)
      ? webinar.locale
      : tenant.settings.default_locale;
  // Blocks and presenters are the editor's own state; the rest of the view is fixed here.
  const rest: Partial<typeof view> = { ...view };
  delete rest.blocks;
  delete rest.presenters;
  return (
    <LandingEditor
      webinarId={webinar.id}
      blocks={webinar.blocks}
      presenters={webinar.presenters}
      languageName={languageName(t, webinar.locale)}
      preview={{
        view: rest as Omit<typeof view, "blocks" | "presenters">,
        form: webinar.form,
        recorded: webinar.recorded,
        recordingNotice: webinar.recordingNotice,
        brand: { name: tenant.settings.author_display_name, logo: tenant.theme.logo?.src },
        anonymity: tenant.settings.anonymity_mode,
        theme: themeToCssVariables(tenant.theme) as CSSProperties,
        locale,
        terms: tenant.terminology,
        strings: tenant.terminology.strings ?? {},
      }}
    />
  );
}

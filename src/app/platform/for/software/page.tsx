import type { Metadata } from "next";

import { AudiencePage } from "@/app/platform/_site/audience-page";
import { siteMetadata } from "@/app/platform/_site/metadata";
import { shot } from "@/app/platform/_site/shots";
import { SOFTWARE } from "@/core/i18n/site/audiences";
import { SITE_COMMON } from "@/core/i18n/site/common";
import { platformConfig } from "@/server/platform/config";
import { getLocale } from "@/server/request";

export async function generateMetadata(): Promise<Metadata> {
  return siteMetadata("software");
}

/** For B2B software companies: teach the field, win its buyers. */
export default async function ForSoftware() {
  const locale = await getLocale();
  return (
    <AudiencePage
      copy={SOFTWARE[locale]}
      common={SITE_COMMON[locale]}
      image={shot("landingDesktop", locale)}
      demo={platformConfig()?.links.demo}
    />
  );
}

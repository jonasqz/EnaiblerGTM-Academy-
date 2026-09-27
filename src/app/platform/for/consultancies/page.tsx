import type { Metadata } from "next";

import { AudiencePage } from "@/app/platform/_site/audience-page";
import { siteMetadata } from "@/app/platform/_site/metadata";
import { shot } from "@/app/platform/_site/shots";
import { CONSULTANCIES } from "@/core/i18n/site/audiences";
import { SITE_COMMON } from "@/core/i18n/site/common";
import { platformConfig } from "@/server/platform/config";
import { getLocale } from "@/server/request";

export async function generateMetadata(): Promise<Metadata> {
  return siteMetadata("consultancies");
}

/** For consultancies and agencies: the method as a course, finished work as proof. */
export default async function ForConsultancies() {
  const locale = await getLocale();
  return (
    <AudiencePage
      copy={CONSULTANCIES[locale]}
      common={SITE_COMMON[locale]}
      image={shot("feedback", locale)}
      demo={platformConfig()?.links.demo}
    />
  );
}

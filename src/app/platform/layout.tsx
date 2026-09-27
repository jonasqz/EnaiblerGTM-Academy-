import { SiteFooter, SiteHeader } from "@/app/platform/_site/chrome";
import { PageAnalytics } from "@/components/page-analytics";
import { SITE_COMMON } from "@/core/i18n/site/common";
import { pageAnalytics } from "@/server/analytics";
import { platformConfig } from "@/server/platform/config";
import { getLocale } from "@/server/request";

/**
 * enaibler's own website on PLATFORM_HOST, reached through the proxy's
 * rewrite, so "/" here is the home page, not an academy's. enaibler's brand
 * and theme; academies never see these pages.
 */
export default async function PlatformLayout({ children }: LayoutProps<"/platform">) {
  const locale = await getLocale();
  const copy = SITE_COMMON[locale];
  const links = platformConfig()?.links ?? {};
  const analytics = pageAnalytics();
  return (
    <>
      <SiteHeader locale={locale} copy={copy} />
      <main className="flex-1">{children}</main>
      <SiteFooter copy={copy} legal={links} />
      {analytics && <PageAnalytics config={analytics} />}
    </>
  );
}

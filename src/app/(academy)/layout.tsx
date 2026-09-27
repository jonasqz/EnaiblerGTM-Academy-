import { PageAnalytics } from "@/components/page-analytics";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ErrorTextProvider } from "@/components/ui/error-view";
import { can } from "@/core/access/roles";
import { getSession } from "@/server/access";
import { pageAnalytics } from "@/server/analytics";
import { platformOrigin } from "@/server/platform/config";
import { getOrigin, getTenant, getTranslator } from "@/server/request";

/** Learner chrome: the tenant's brand in front, "Powered by enaibler" at the bottom. */
export default async function AcademyLayout({ children }: LayoutProps<"/">) {
  const tenant = await getTenant();
  const t = await getTranslator();
  const session = await getSession();
  const analytics = pageAnalytics();
  const platform = platformOrigin();
  return (
    <>
      <SiteHeader
        academyName={tenant.settings.author_display_name}
        logo={tenant.theme.logo}
        t={t}
        locales={tenant.settings.locales}
        signedIn={session !== null}
        showStudio={session !== null && can(session.roles, "studio.view")}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12">
        <ErrorTextProvider
          text={{
            title: t.t("error.title"),
            body: t.t("error.body"),
            retry: t.t("error.retry"),
            home: t.t("error.home"),
          }}
        >
          {children}
        </ErrorTextProvider>
      </main>
      <SiteFooter
        tenant={tenant}
        t={t}
        report={platform ? { platformOrigin: platform, pageOrigin: await getOrigin() } : undefined}
      />
      {analytics && <PageAnalytics config={analytics} />}
    </>
  );
}

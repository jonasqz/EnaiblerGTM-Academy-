import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { requireCapability } from "@/server/access";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  // A plain string would drop the Studio's "%s · Studio" for the tabs below.
  return { title: { default: t.t("settings.title"), template: "%s · Studio" } };
}

export default async function SettingsLayout({ children }: LayoutProps<"/studio/settings">) {
  const { tenant } = await requireCapability("academy.manage", "/studio/settings");
  const t = await getStudioText();
  return (
    <div className="space-y-8">
      <PageHeader
        title={t.t("settings.title")}
        description={t.t("settings.description", { academy: tenant.settings.author_display_name })}
      />
      <Tabs
        label={t.t("settings.title")}
        items={[
          { href: "/studio/settings", label: t.t("settings.tab.academy"), exact: true },
          { href: "/studio/settings/team", label: t.t("team.members.tab") },
          { href: "/studio/settings/brand", label: t.t("settings.tab.brand") },
          { href: "/studio/settings/sharing", label: t.t("settings.tab.sharing") },
          { href: "/studio/settings/domains", label: t.t("settings.tab.domains") },
          { href: "/studio/settings/integrations", label: t.t("settings.tab.integrations") },
          { href: "/studio/settings/usage", label: t.t("settings.tab.usage") },
        ]}
      />
      {children}
    </div>
  );
}

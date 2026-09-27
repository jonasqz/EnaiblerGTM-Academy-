import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { requireCapability } from "@/server/access";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsLayout({ children }: LayoutProps<"/studio/settings">) {
  const { tenant } = await requireCapability("academy.manage", "/studio/settings");
  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description={`How ${tenant.settings.author_display_name} presents itself to learners.`}
      />
      <Tabs
        label="Settings"
        items={[
          { href: "/studio/settings", label: "Academy", exact: true },
          { href: "/studio/settings/brand", label: "Brand" },
          { href: "/studio/settings/domains", label: "Domains" },
        ]}
      />
      {children}
    </div>
  );
}

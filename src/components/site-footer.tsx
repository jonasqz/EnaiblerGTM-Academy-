import type { Translator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";

/** Tenant brand in front, enaibler behind: the only enaibler mark is "Powered by enaibler". */
export function SiteFooter(props: { tenant: TenantContext; t: Translator }) {
  const { tenant, t } = props;
  const links = tenant.settings.legal_links;
  return (
    <footer className="mt-16 border-t-outline border-line bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm">
        <p className="font-display">{tenant.settings.author_display_name}</p>
        <ul className="flex flex-wrap gap-4">
          {(
            [
              ["imprint", links.imprint],
              ["privacy", links.privacy],
              ["terms", links.terms],
            ] as const
          ).map(([key, href]) =>
            href ? (
              <li key={key}>
                <a href={href} className="underline-offset-4 hover:underline">
                  {t.t(`footer.${key}`)}
                </a>
              </li>
            ) : null,
          )}
        </ul>
        <p className="text-muted">{t.t("app.poweredBy")}</p>
      </div>
    </footer>
  );
}

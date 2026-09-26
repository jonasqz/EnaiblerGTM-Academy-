import type { Translator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";

/** Tenant brand in front, enaibler behind: the only enaibler mark is "Powered by enaibler". */
export function SiteFooter(props: { tenant: TenantContext; t: Translator }) {
  const { tenant, t } = props;
  const links = tenant.settings.legal_links;
  return (
    <footer className="mt-16 border-t-outline border-line">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm">
        <ul className="flex flex-wrap gap-4">
          <li>
            <a href={links.imprint} className="underline-offset-4 hover:underline">
              {t.t("footer.imprint")}
            </a>
          </li>
          <li>
            <a href={links.privacy} className="underline-offset-4 hover:underline">
              {t.t("footer.privacy")}
            </a>
          </li>
          <li>
            <a href={links.terms} className="underline-offset-4 hover:underline">
              {t.t("footer.terms")}
            </a>
          </li>
        </ul>
        <p className="opacity-70">{t.t("app.poweredBy")}</p>
      </div>
    </footer>
  );
}

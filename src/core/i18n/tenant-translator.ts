import { isLocale } from "@/core/i18n/locales";
import { createTranslator, type Translator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";

/**
 * The academy's wording for one person (a mail, an export): the requested
 * locale if the academy offers it, else its default.
 */
export function tenantTranslator(tenant: TenantContext, requested?: string | null): Translator {
  const locale =
    isLocale(requested) && tenant.settings.locales.includes(requested)
      ? requested
      : tenant.settings.default_locale;
  return createTranslator({
    locale,
    termOverrides: tenant.terminology,
    messageOverrides: tenant.terminology.strings,
  });
}

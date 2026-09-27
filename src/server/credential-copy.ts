import { earnedText, proofLine } from "@/core/credentials/proof";
import { formatPublicId } from "@/core/credentials/public-id";
import { localize, type Locale } from "@/core/i18n/locales";
import type { Translator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";
import type { CredentialView } from "@/server/credentials";

/** All texts shown on a credential (page, image, LinkedIn), in one place. */
export function credentialCopy(
  tenant: TenantContext,
  credential: CredentialView,
  t: Translator,
  origin: string,
) {
  const fallback: Locale[] = [tenant.settings.default_locale];
  const courseTitle = localize(credential.courseTitle, t.locale, fallback);
  const levelName = credential.level?.name
    ? localize(credential.level.name, t.locale, fallback)
    : null;
  const dateFormat = new Intl.DateTimeFormat(t.locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "long",
    timeZone: "Europe/Berlin",
  });
  return {
    academy: tenant.settings.author_display_name,
    credentialTerm: t.term("credential"),
    courseTitle,
    /** What was done for it: the work, the final test, or both. */
    proofLine: proofLine(t, credential),
    earned: earnedText(t, credential.basis),
    levelLine:
      tenant.settings.features.levels && credential.level && levelName
        ? t.t("verify.level", { n: credential.level.n, name: levelName })
        : null,
    pathTitle: credential.path ? localize(credential.path.title, t.locale, fallback) : null,
    displayName: credential.displayName,
    issuedOn: dateFormat.format(credential.issuedAt),
    credentialId: formatPublicId(credential.publicId),
    verificationUrl: `${origin}/verify/${credential.publicId}`,
    /** Name for LinkedIn's certification form: says what it is, never "certified". */
    linkedInName: `${courseTitle} – ${t.term("credential")}`,
  };
}

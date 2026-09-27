import { Palette, Target, UserCheck } from "lucide-react";
import type { Metadata } from "next";

import { SignupForm } from "@/app/platform/signup-form";
import { SUPPORTED_LOCALES, type Locale } from "@/core/i18n/locales";
import { platformText } from "@/core/i18n/platform-messages";
import { academyOrigin, platformConfig, signupOpen } from "@/server/platform/config";
import { getLocale } from "@/server/request";

const LANGUAGE_NAMES: Record<Locale, Record<Locale, string>> = {
  en: { de: "German", en: "English" },
  de: { de: "Deutsch", en: "Englisch" },
};

export async function generateMetadata(): Promise<Metadata> {
  const t = platformText(await getLocale());
  return { title: { absolute: `enaibler · ${t("form.title")}` } };
}

/** Self-serve: anyone creates an academy here and starts in its Studio right away. */
export default async function PlatformHome() {
  const locale = await getLocale();
  const t = platformText(locale);
  const config = platformConfig();
  const open = signupOpen(config);
  // Show the address the way it will be: https://<slug>.academies.example
  const sample = config ? academyOrigin(`slug.${config.academyDomain}`).origin : "";
  const [prefix, suffix] = sample.split("slug");

  const points = [
    { icon: Palette, title: t("point.brand.title"), body: t("point.brand.body") },
    { icon: Target, title: t("point.outcome.title"), body: t("point.outcome.body") },
    { icon: UserCheck, title: t("point.review.title"), body: t("point.review.body") },
  ];

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-start">
      <section className="space-y-8 lg:pt-6">
        <div className="space-y-4">
          <p className="eyebrow">{t("hero.eyebrow")}</p>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">{t("hero.title")}</h1>
          <p className="max-w-xl text-lg text-muted">{t("hero.body")}</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {points.map((point) => (
            <li key={point.title} className="flex gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-control bg-primary-soft">
                <point.icon aria-hidden size={20} />
              </span>
              <span>
                <span className="block font-semibold">{point.title}</span>
                <span className="text-sm text-muted">{point.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="signup-heading" className="card p-6 sm:p-8">
        <h2 id="signup-heading" className="mb-6 font-display text-2xl">
          {t("form.title")}
        </h2>
        {open ? (
          <SignupForm
            labels={{
              name: t("form.name"),
              nameHint: t("form.nameHint"),
              slug: t("form.slug"),
              slugHint: t("form.slugHint"),
              email: t("form.email"),
              emailHint: t("form.emailHint"),
              language: t("form.language"),
              alsoOffer: t("form.alsoOffer"),
              website: t("form.website"),
              websiteHint: t("form.websiteHint"),
              accept: t("form.accept"),
              termsLink: t("form.termsLink"),
              dpaLink: t("form.dpaLink"),
              submit: t("form.submit"),
              submitting: t("form.submitting"),
              sentTitle: t("sent.title"),
              sentBody: t("sent.body"),
              sentNext: t("sent.next"),
            }}
            languages={SUPPORTED_LOCALES.map((value) => ({
              value,
              name: LANGUAGE_NAMES[locale][value],
            }))}
            defaultLanguage={locale}
            address={{ prefix: prefix ?? "", suffix: suffix ?? "" }}
            links={{ terms: config?.links.terms, dpa: config?.links.dpa }}
          />
        ) : (
          <p className="text-muted">{t("unavailable")}</p>
        )}
      </section>
    </div>
  );
}

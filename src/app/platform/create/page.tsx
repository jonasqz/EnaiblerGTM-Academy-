import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";

import { siteMetadata } from "@/app/platform/_site/metadata";
import { Container, Eyebrow } from "@/app/platform/_site/ui";
import { SignupForm } from "@/app/platform/signup-form";
import { SUPPORTED_LOCALES, type Locale } from "@/core/i18n/locales";
import { platformText } from "@/core/i18n/platform-messages";
import { CREATE } from "@/core/i18n/site/create";
import { academyOrigin, platformConfig, signupOpen } from "@/server/platform/config";
import { getLocale } from "@/server/request";

const LANGUAGE_NAMES: Record<Locale, Record<Locale, string>> = {
  en: { de: "German", en: "English" },
  de: { de: "Deutsch", en: "Englisch" },
};

export async function generateMetadata(): Promise<Metadata> {
  return siteMetadata("create");
}

/** Self-serve: anyone creates an academy here and starts in its Studio right away. */
export default async function CreateAcademy() {
  const locale = await getLocale();
  const t = platformText(locale);
  const copy = CREATE[locale];
  const config = platformConfig();
  const open = signupOpen(config);
  // Show the address the way it will be: https://<slug>.academies.example
  const sample = config ? academyOrigin(`slug.${config.academyDomain}`).origin : "";
  const [prefix, suffix] = sample.split("slug");

  return (
    <Container className="grid gap-12 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-start">
      <section aria-labelledby="create-heading" className="space-y-8 lg:pt-6">
        <div className="space-y-5">
          <Eyebrow>{copy.eyebrow}</Eyebrow>
          <h1
            id="create-heading"
            className="font-display text-4xl leading-tight font-semibold tracking-tight sm:text-5xl"
          >
            {copy.title}
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted">{copy.body}</p>
        </div>
        <div className="space-y-4">
          <h2 className="font-semibold">{copy.next.title}</h2>
          <ol className="space-y-3">
            {copy.next.steps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                  {index + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          {copy.points.map((point) => (
            <li key={point} className="flex items-center gap-2">
              <CircleCheck aria-hidden size={16} className="text-primary" />
              {point}
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
    </Container>
  );
}

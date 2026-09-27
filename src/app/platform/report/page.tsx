import type { Metadata } from "next";

import { siteMetadata } from "@/app/platform/_site/metadata";
import { Container, Eyebrow } from "@/app/platform/_site/ui";
import { ReportForm } from "@/app/platform/report/report-form";
import { Notice } from "@/components/ui/notice";
import { REPORT } from "@/core/i18n/site/report";
import { legalHref } from "@/core/platform/legal";
import { prefilledContentUrl } from "@/core/platform/report";
import { platformConfig } from "@/server/platform/config";
import { getLocale } from "@/server/request";

export async function generateMetadata(): Promise<Metadata> {
  return siteMetadata("report");
}

/**
 * Notice and action (DSA Art. 16) for everything enaibler hosts: academies'
 * pages link here with their address filled in (`?url=`).
 */
export default async function ReportContent({ searchParams }: PageProps<"/platform/report">) {
  const locale = await getLocale();
  const copy = REPORT[locale];
  const config = platformConfig();
  const links = config?.links ?? {};
  const open = Boolean(config?.abuseEmail);
  const [beforeLink, afterLink] = copy.byEmail.body.split("{imprint}");

  return (
    <Container className="grid gap-12 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:items-start">
      <section aria-labelledby="report-heading" className="space-y-5 lg:pt-6">
        <Eyebrow>{copy.eyebrow}</Eyebrow>
        <h1
          id="report-heading"
          className="font-display text-4xl leading-tight font-semibold tracking-tight sm:text-5xl"
        >
          {copy.title}
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-muted">{copy.body}</p>
        <p className="max-w-xl text-muted">{copy.support}</p>
      </section>

      <section aria-labelledby="report-form-heading" className="card space-y-6 p-6 sm:p-8">
        <h2 id="report-form-heading" className="font-display text-2xl">
          {copy.form.title}
        </h2>
        {!open && (
          <Notice tone="info" title={copy.byEmail.title}>
            {beforeLink}
            <a href={legalHref("imprint", links)} className="underline">
              {copy.byEmail.imprint}
            </a>
            {afterLink}
          </Notice>
        )}
        <ReportForm
          labels={copy.form}
          sent={copy.sent}
          url={prefilledContentUrl((await searchParams).url)}
          privacyHref={legalHref("privacy", links)}
          disabled={!open}
        />
      </section>
    </Container>
  );
}

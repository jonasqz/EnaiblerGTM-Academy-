import { notFound, redirect } from "next/navigation";

import { Container, Eyebrow } from "@/app/platform/_site/ui";
import { Markdown } from "@/components/ui/markdown";
import { Notice } from "@/components/ui/notice";
import { SITE_COMMON } from "@/core/i18n/site/common";
import { LEGAL } from "@/core/i18n/site/legal";
import type { LegalPage } from "@/core/platform/legal";
import { platformConfig } from "@/server/platform/config";
import { loadLegalDocument } from "@/server/platform/legal";
import { getLocale } from "@/server/request";

/**
 * One of enaibler's legal pages, rendered from content/legal. A draft says so
 * before anything else, so nobody mistakes it for the terms in force.
 */
export async function LegalDocumentPage(props: { page: LegalPage }) {
  const own = platformConfig()?.links[props.page];
  // The operator keeps this text elsewhere: old links to our page still find it.
  if (own) redirect(own);
  const locale = await getLocale();
  const document = await loadLegalDocument(props.page, locale);
  if (!document) notFound();
  const copy = LEGAL[locale];
  const updated = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${document.updated}T00:00:00Z`));

  return (
    <Container className="py-12 sm:py-16">
      <article aria-labelledby="legal-heading" className="mx-auto max-w-3xl space-y-8">
        {document.status === "draft" && (
          <Notice tone="warning" title={copy.draft.title}>
            {copy.draft.body}
          </Notice>
        )}
        <header className="space-y-4">
          <Eyebrow>{SITE_COMMON[locale].footer.legal}</Eyebrow>
          <h1
            id="legal-heading"
            className="font-display text-4xl leading-tight font-semibold tracking-tight sm:text-5xl"
          >
            {document.title}
          </h1>
          <p className="text-sm text-muted">{copy.updated.replace("{date}", updated)}</p>
        </header>
        <Markdown source={document.body} />
      </article>
    </Container>
  );
}

import { Award, ChartColumn, Code, Globe, Link2, Webhook } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { siteMetadata } from "@/app/platform/_site/metadata";
import { shot } from "@/app/platform/_site/shots";
import {
  BrowserFrame,
  ButtonLink,
  CheckList,
  CloseCta,
  Container,
  Eyebrow,
  ItemGrid,
  LinkPreview,
  PhoneFrame,
  ScreensNote,
  Section,
  SectionHeading,
} from "@/app/platform/_site/ui";
import type { Locale } from "@/core/i18n/locales";
import { SITE_PATHS } from "@/core/i18n/site";
import { SITE_COMMON } from "@/core/i18n/site/common";
import { HOW, type HowCopy } from "@/core/i18n/site/how";
import { getLocale } from "@/server/request";

export async function generateMetadata(): Promise<Metadata> {
  return siteMetadata("how");
}

type Chapter = HowCopy["chapters"][number];

/** The screens of a stage: the main one in a browser, a second one on top where it helps. */
function Media(props: { chapter: Chapter; locale: Locale; alts: HowCopy["alts"] }): ReactNode {
  const { chapter, locale, alts } = props;
  const sizes = "(min-width: 1024px) 560px, 100vw";
  switch (chapter.key) {
    case "build":
      return <BrowserFrame image={shot("studioOutcome", locale)} alt={chapter.alt} sizes={sizes} />;
    case "learn":
      return (
        <div className="relative pb-6 lg:pb-0">
          <BrowserFrame image={shot("feedback", locale)} alt={chapter.alt} sizes={sizes} />
          <PhoneFrame
            image={shot("lessonPhone", locale)}
            alt={alts.lesson}
            className="relative z-10 -mt-20 ml-auto w-[36%] max-w-[180px] sm:-mt-28 lg:absolute lg:-right-10 lg:-bottom-20"
          />
        </div>
      );
    case "share":
      return (
        <div className="relative">
          <BrowserFrame image={shot("shareKit", locale)} alt={chapter.alt} sizes={sizes} />
          <LinkPreview
            image={shot("shareImage", locale)}
            alt={alts.preview}
            caption={alts.previewCaption}
            className="relative z-10 -mt-12 w-[70%] max-w-[300px] sm:-mt-20 lg:absolute lg:-bottom-10 lg:-left-8"
          />
        </div>
      );
    default:
      return (
        <div className="relative pb-6 lg:pb-0">
          <BrowserFrame image={shot("studioLeads", locale)} alt={chapter.alt} sizes={sizes} />
          <PhoneFrame
            image={shot("landingPhone", locale)}
            alt={alts.landing}
            className="relative z-10 -mt-20 w-[36%] max-w-[180px] sm:-mt-28 lg:absolute lg:-bottom-20 lg:-left-12"
          />
        </div>
      );
  }
}

/** How it works: the loop in four stages, each with the screens behind it. */
export default async function HowItWorks() {
  const locale = await getLocale();
  const copy = HOW[locale];
  const common = SITE_COMMON[locale];

  return (
    <>
      <section aria-labelledby="how-heading" className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-48 left-[-15%] -z-10 size-[34rem] rounded-full bg-primary-soft blur-3xl"
        />
        <Container className="space-y-8 pt-14 pb-12 sm:pt-20">
          <div className="max-w-3xl space-y-6">
            <Eyebrow>{copy.hero.eyebrow}</Eyebrow>
            <h1
              id="how-heading"
              className="font-display text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-6xl"
            >
              {copy.hero.title}
            </h1>
            <p className="text-lg leading-relaxed text-muted sm:text-xl">{copy.hero.body}</p>
          </div>
          <nav aria-labelledby="how-heading">
            <ol className="flex flex-wrap gap-2">
              {copy.chapters.map((chapter) => (
                <li key={chapter.key}>
                  <a
                    href={`#${chapter.key}`}
                    className="inline-flex rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold hover:border-primary hover:text-primary"
                  >
                    {chapter.eyebrow}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <ScreensNote>{common.shots}</ScreensNote>
        </Container>
      </section>

      {copy.chapters.map((chapter, index) => (
        <Section
          key={chapter.key}
          id={chapter.key}
          tone={index % 2 === 0 ? "card" : "plain"}
          labelledBy={`${chapter.key}-heading`}
          className="overflow-hidden"
        >
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className={index % 2 === 0 ? "space-y-6" : "space-y-6 lg:order-2"}>
              <Eyebrow>{chapter.eyebrow}</Eyebrow>
              <h2
                id={`${chapter.key}-heading`}
                className="font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl"
              >
                {chapter.title}
              </h2>
              <p className="text-lg leading-relaxed text-muted">{chapter.body}</p>
              <CheckList items={chapter.points} />
            </div>
            <Media chapter={chapter} locale={locale} alts={copy.alts} />
          </div>
        </Section>
      ))}

      <Section tone="dark" labelledBy="connect-heading">
        <SectionHeading
          id="connect-heading"
          eyebrow={copy.connect.eyebrow}
          title={copy.connect.title}
          tone="dark"
        />
        <div className="mt-12">
          <ItemGrid
            items={copy.connect.items}
            icons={[Link2, Code, Webhook, Globe, Award, ChartColumn]}
            tone="dark"
          />
        </div>
        <div className="mt-12">
          <ButtonLink href={SITE_PATHS.create} variant="inverse">
            {common.cta.create}
          </ButtonLink>
        </div>
      </Section>

      <CloseCta
        title={common.close.title}
        body={common.close.body}
        button={common.cta.create}
        href={SITE_PATHS.create}
      />
    </>
  );
}

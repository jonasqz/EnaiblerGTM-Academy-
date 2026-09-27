import {
  ArrowRight,
  Briefcase,
  Building2,
  ChartColumn,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Globe,
  Hammer,
  Languages,
  Lock,
  MessageSquareText,
  Palette,
  RotateCcw,
  ScrollText,
  Server,
  Share2,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import type { Metadata } from "next";

import { siteMetadata } from "@/app/platform/_site/metadata";
import { shot } from "@/app/platform/_site/shots";
import {
  BrowserFrame,
  ButtonLink,
  CloseCta,
  Container,
  Eyebrow,
  Faq,
  ItemGrid,
  LinkPreview,
  PhoneFrame,
  ScreensNote,
  Section,
  SectionHeading,
  Steps,
} from "@/app/platform/_site/ui";
import { SITE_PATHS } from "@/core/i18n/site";
import { SITE_COMMON } from "@/core/i18n/site/common";
import { HOME } from "@/core/i18n/site/home";
import { platformConfig } from "@/server/platform/config";
import { getLocale } from "@/server/request";

export async function generateMetadata(): Promise<Metadata> {
  return siteMetadata("home");
}

const LOOP_ICONS = [Globe, ScrollText, Hammer, MessageSquareText, ClipboardCheck, Share2, Users];
const AUDIENCE_ICONS = { consultancies: Briefcase, software: Building2 } as const;

/** The home page: expertise → an academy → a go-to-market stream (brief §1, §2). */
export default async function PlatformHome() {
  const locale = await getLocale();
  const copy = HOME[locale];
  const common = SITE_COMMON[locale];
  const demo = platformConfig()?.links.demo;

  return (
    <>
      <section aria-labelledby="hero-heading" className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-40 right-[-10%] -z-10 size-[36rem] rounded-full bg-primary-soft blur-3xl"
        />
        <Container className="grid items-center gap-14 pt-12 pb-10 sm:pt-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:pt-24">
          <div className="space-y-7">
            <Eyebrow>{copy.hero.eyebrow}</Eyebrow>
            <h1
              id="hero-heading"
              className="font-display text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-6xl"
            >
              {copy.hero.title}{" "}
              <span className="text-primary underline decoration-accent-3 decoration-[0.14em] underline-offset-[0.16em]">
                {copy.hero.highlight}
              </span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
              {copy.hero.body}
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href={SITE_PATHS.create}>{common.cta.create}</ButtonLink>
              <ButtonLink href={SITE_PATHS.how} variant="secondary">
                {common.cta.how}
              </ButtonLink>
              {demo && (
                <ButtonLink href={demo} variant="secondary" external={{ label: common.opens }}>
                  {common.cta.demo}
                </ButtonLink>
              )}
            </div>
          </div>

          <figure className="relative mx-auto w-full max-w-sm lg:max-w-none">
            <PhoneFrame
              image={shot("landingPhone", locale)}
              alt={copy.hero.phoneAlt}
              priority
              className="mx-auto w-[min(66vw,280px)]"
            />
            <LinkPreview
              image={shot("shareImage", locale)}
              alt={copy.hero.previewAlt}
              caption={copy.hero.preview}
              className="relative z-10 mx-auto -mt-20 w-[min(84vw,320px)] lg:absolute lg:bottom-16 lg:-left-6 lg:mx-0 lg:mt-0 xl:-left-14"
            />
            <figcaption className="mx-auto mt-5 max-w-xs text-center text-sm text-muted">
              {copy.hero.caption}
            </figcaption>
          </figure>
        </Container>

        <Container className="pb-16 sm:pb-20">
          <ul className="grid gap-8 border-t border-line pt-10 sm:grid-cols-3">
            {copy.highlights.map((item) => (
              <li key={item.title} className="flex gap-3">
                <CircleCheck aria-hidden size={22} className="mt-0.5 shrink-0 text-primary" />
                <span>
                  <span className="block font-semibold">{item.title}</span>
                  <span className="text-muted">{item.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <Section tone="dark" labelledBy="loop-heading">
        <SectionHeading
          id="loop-heading"
          eyebrow={copy.loop.eyebrow}
          title={copy.loop.title}
          intro={copy.loop.intro}
          tone="dark"
        />
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {copy.loop.steps.map((step, index) => {
            const Icon = LOOP_ICONS[index] ?? Globe;
            return (
              <li
                key={step.title}
                className="space-y-3 rounded-card border border-surface/15 bg-surface/5 p-5"
              >
                <div className="flex items-center justify-between">
                  <span className="grid size-9 place-items-center rounded-full bg-accent-1 font-semibold text-ink">
                    {index + 1}
                  </span>
                  <Icon aria-hidden size={22} className="text-accent-1" />
                </div>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-surface/75">{step.body}</p>
              </li>
            );
          })}
          <li className="flex items-center gap-3 rounded-card border border-dashed border-accent-1/60 p-5 font-semibold text-accent-1">
            <RotateCcw aria-hidden size={24} className="shrink-0" />
            {copy.loop.again}
          </li>
        </ol>
        <div className="mt-6 grid gap-5 rounded-card bg-card p-6 text-ink sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-8">
          <span className="grid size-12 place-items-center rounded-control bg-primary-soft text-primary">
            <UserPlus aria-hidden size={24} />
          </span>
          <div className="space-y-1">
            <h3 className="text-xl font-semibold">{copy.loop.leadTitle}</h3>
            <p className="text-muted">{copy.loop.leadBody}</p>
          </div>
        </div>
      </Section>

      <Section labelledBy="why-heading">
        <SectionHeading
          id="why-heading"
          eyebrow={copy.why.eyebrow}
          title={copy.why.title}
          intro={copy.why.intro}
        />
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="card-flat space-y-5 p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-muted">{copy.why.badge.title}</h3>
            <ul className="space-y-3 text-muted">
              {copy.why.badge.points.map((point) => (
                <li key={point} className="flex gap-3">
                  <CircleX aria-hidden size={20} className="mt-0.5 shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="card space-y-5 p-6 ring-2 ring-primary sm:p-8">
            <h3 className="text-lg font-semibold">{copy.why.proof.title}</h3>
            <ul className="space-y-3">
              {copy.why.proof.points.map((point) => (
                <li key={point} className="flex gap-3">
                  <CircleCheck aria-hidden size={20} className="mt-0.5 shrink-0 text-primary" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section tone="card" labelledBy="features-heading">
        <SectionHeading
          id="features-heading"
          eyebrow={copy.features.eyebrow}
          title={copy.features.title}
        />
        <div className="mt-12">
          <ItemGrid
            items={copy.features.items}
            icons={[Palette, Sparkles, ClipboardCheck, Share2, UserPlus, ChartColumn]}
          />
        </div>
      </Section>

      <Section labelledBy="studio-heading">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-6">
            <SectionHeading
              id="studio-heading"
              eyebrow={copy.studio.eyebrow}
              title={copy.studio.title}
              intro={copy.studio.body}
            />
            <ButtonLink href={SITE_PATHS.how} variant="secondary">
              {common.cta.how}
            </ButtonLink>
          </div>
          <div className="space-y-3">
            <BrowserFrame
              image={shot("studioOverview", locale)}
              alt={copy.studio.overviewAlt}
              sizes="(min-width: 1024px) 680px, 100vw"
            />
            <BrowserFrame
              image={shot("studioLeads", locale)}
              alt={copy.studio.leadsAlt}
              sizes="(min-width: 1024px) 580px, 90vw"
              className="relative z-10 -mt-10 ml-auto w-[88%] sm:-mt-16"
            />
            <ScreensNote>{common.shots}</ScreensNote>
          </div>
        </div>
      </Section>

      <Section tone="card" labelledBy="audiences-heading">
        <SectionHeading
          id="audiences-heading"
          eyebrow={copy.audiences.eyebrow}
          title={copy.audiences.title}
        />
        <ul className="mt-12 grid gap-6 md:grid-cols-2">
          {copy.audiences.items.map((item) => {
            const key = item.key as keyof typeof AUDIENCE_ICONS;
            const Icon = AUDIENCE_ICONS[key];
            return (
              <li key={item.key}>
                <a
                  href={SITE_PATHS[key]}
                  className="card card-interactive group flex h-full flex-col gap-4 p-6 sm:p-8"
                >
                  <span className="grid size-12 place-items-center rounded-control bg-primary-soft text-primary">
                    <Icon aria-hidden size={24} />
                  </span>
                  <span className="font-display text-2xl font-semibold tracking-tight">
                    {item.title}
                  </span>
                  <span className="text-muted">{item.body}</span>
                  <span className="mt-auto inline-flex items-center gap-2 font-semibold text-primary">
                    {item.link}
                    <ArrowRight
                      aria-hidden
                      size={18}
                      className="transition-transform group-hover:translate-x-1"
                    />
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
        <p className="mt-8 text-lg text-muted">{copy.audiences.generic}</p>
      </Section>

      <Section labelledBy="trust-heading">
        <SectionHeading id="trust-heading" eyebrow={copy.trust.eyebrow} title={copy.trust.title} />
        <div className="mt-12">
          <ItemGrid
            items={copy.trust.items}
            icons={[Server, Lock, ScrollText, Languages]}
            columns={4}
          />
        </div>
      </Section>

      <Section tone="card" labelledBy="start-heading">
        <SectionHeading id="start-heading" eyebrow={copy.start.eyebrow} title={copy.start.title} />
        <div className="mt-12 space-y-10">
          <Steps steps={copy.start.steps} />
          <ButtonLink href={SITE_PATHS.create}>{common.cta.create}</ButtonLink>
        </div>
      </Section>

      <Section labelledBy="faq-heading">
        <Faq id="faq-heading" title={common.faq} items={copy.faq} />
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

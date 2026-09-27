import {
  Lightbulb,
  MessageSquareText,
  Rocket,
  Target,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import type { StaticImageData } from "next/image";

import {
  BrowserFrame,
  ButtonLink,
  CheckList,
  CloseCta,
  Container,
  Eyebrow,
  Faq,
  ItemGrid,
  ScreensNote,
  Section,
  SectionHeading,
  Steps,
} from "@/app/platform/_site/ui";
import { SITE_PATHS } from "@/core/i18n/site";
import type { AudienceCopy } from "@/core/i18n/site/audiences";
import type { SiteCommonCopy } from "@/core/i18n/site/common";

/**
 * A landing page for one kind of customer: the problem they have with the
 * usual marketing, what an academy changes, how it fits, an illustrative
 * course and what it brings.
 */
export function AudiencePage(props: {
  copy: AudienceCopy;
  common: SiteCommonCopy;
  image: StaticImageData;
  demo?: string;
}) {
  const { copy, common } = props;
  return (
    <>
      <section aria-labelledby="audience-heading" className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-40 right-[-10%] -z-10 size-[34rem] rounded-full bg-primary-soft blur-3xl"
        />
        <Container className="grid items-center gap-12 pt-14 pb-16 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:pb-24">
          <div className="space-y-7">
            <Eyebrow>{copy.hero.eyebrow}</Eyebrow>
            <h1
              id="audience-heading"
              className="font-display text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-6xl"
            >
              {copy.hero.title}
            </h1>
            <p className="text-lg leading-relaxed text-muted sm:text-xl">{copy.hero.body}</p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href={SITE_PATHS.create}>{common.cta.create}</ButtonLink>
              <ButtonLink href={SITE_PATHS.how} variant="secondary">
                {common.cta.how}
              </ButtonLink>
              {props.demo && (
                <ButtonLink
                  href={props.demo}
                  variant="secondary"
                  external={{ label: common.opens }}
                >
                  {common.cta.demo}
                </ButtonLink>
              )}
            </div>
          </div>
          <div className="space-y-3">
            <BrowserFrame
              image={props.image}
              alt={copy.hero.alt}
              sizes="(min-width: 1024px) 560px, 100vw"
              priority
            />
            <ScreensNote>{common.shots}</ScreensNote>
          </div>
        </Container>
      </section>

      <Section tone="card" labelledBy="problems-heading">
        <SectionHeading id="problems-heading" title={copy.problems.title} />
        <ul className="mt-10 grid gap-6 md:grid-cols-3">
          {copy.problems.items.map((item) => (
            <li key={item.title} className="card-flat space-y-2 p-6">
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="text-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="dark" labelledBy="shift-heading">
        <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start">
          <span className="grid size-14 place-items-center rounded-card bg-surface/10 text-accent-1">
            <Lightbulb aria-hidden size={28} />
          </span>
          <div className="max-w-3xl space-y-5">
            <h2
              id="shift-heading"
              className="font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl"
            >
              {copy.shift.title}
            </h2>
            <p className="text-lg leading-relaxed text-surface/80 sm:text-xl">{copy.shift.body}</p>
          </div>
        </div>
      </Section>

      <Section labelledBy="how-heading">
        <SectionHeading id="how-heading" title={copy.how.title} />
        <div className="mt-10">
          <Steps steps={copy.how.steps} columns={4} />
        </div>
      </Section>

      <Section tone="card" labelledBy="example-heading">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            <h2
              id="example-heading"
              className="font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl"
            >
              {copy.example.title}
            </h2>
            <p className="text-muted">{copy.example.intro}</p>
            <p className="text-lg leading-relaxed">{copy.example.note}</p>
          </div>
          <article
            aria-labelledby="example-course"
            className="card space-y-6 p-6 ring-1 ring-primary/30 sm:p-8"
          >
            <span className="badge" data-tone="info">
              {common.example}
            </span>
            <h3
              id="example-course"
              className="font-display text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              {copy.example.course}
            </h3>
            <dl className="space-y-5">
              <div className="space-y-1">
                <dt className="eyebrow">{copy.example.artifactLabel}</dt>
                <dd className="text-lg font-semibold">{copy.example.artifact}</dd>
              </div>
              <div className="space-y-3">
                <dt className="eyebrow">{copy.example.criteriaLabel}</dt>
                <dd>
                  <CheckList items={copy.example.criteria} />
                </dd>
              </div>
            </dl>
          </article>
        </div>
      </Section>

      <Section labelledBy="outcomes-heading">
        <SectionHeading id="outcomes-heading" title={copy.outcomes.title} />
        <div className="mt-12">
          <ItemGrid
            items={copy.outcomes.items}
            icons={[UserPlus, Target, Users, TrendingUp, MessageSquareText, Rocket]}
            columns={4}
          />
        </div>
      </Section>

      <Section tone="card" labelledBy="faq-heading">
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

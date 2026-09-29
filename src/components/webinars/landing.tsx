import {
  CalendarDays,
  CircleCheck,
  Clapperboard,
  Hammer,
  Languages,
  Radio,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { LocalTime } from "@/components/webinars/local-time";
import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/core/i18n/locales";
import type { Translator } from "@/core/i18n/translator";
import { clockTime } from "@/core/media/captions";
import type { CapacityState } from "@/core/webinars/capacity";
import { shownPresenters, type LandingBlock, type Presenter } from "@/core/webinars/landing";
import type { WebinarPhase, WebinarStatus } from "@/core/webinars/phase";
import type { ReliveState } from "@/core/webinars/relive";
import { formatClock, formatWebinarDate, formatWebinarTime } from "@/core/webinars/time";

/** What the landing page shows of a webinar: nothing the public must not see. */
export interface LandingView {
  title: string;
  description: string;
  /** The webinar's language: its own texts are marked up with it. */
  locale: Locale;
  startsAt: string;
  durationMinutes: number;
  timeZone: string;
  blocks: LandingBlock[];
  presenters: Presenter[];
  /** The linked course and what learners build there. */
  course: { title: string; artifact: string | null } | null;
  seats: { state: CapacityState; left: number | null };
  phase: WebinarPhase;
  status: WebinarStatus;
  /** Over, with a recording: labelled as recorded, with the day it was held, never "live". */
  relive: ReliveState;
}

function Meta(props: { icon: LucideIcon; children: ReactNode }) {
  const Icon = props.icon;
  return (
    <div className="flex items-start gap-3">
      <Icon aria-hidden size={20} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{props.children}</div>
    </div>
  );
}

function Paragraphs(props: { text: string; lang: string; className?: string }) {
  return props.text
    .split(/\n{2,}/)
    .filter((part) => part.trim())
    .map((part, index) => (
      <p key={index} lang={props.lang} className={`whitespace-pre-line ${props.className ?? ""}`}>
        {part}
      </p>
    ));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** How many seats are left, in words. */
export function seatsLine(t: Translator, seats: LandingView["seats"]): string | null {
  if (seats.state === "full") return t.t("webinar.full");
  if (seats.state === "few_left" && seats.left !== null) {
    return seats.left === 1 ? t.t("webinar.seatLeft") : t.t("webinar.seatsLeft", { n: seats.left });
  }
  return null;
}

/**
 * A webinar's landing page from its blocks, in the academy's theme (webinar
 * brief §2.2). Presentational only, so the Studio's preview renders the same
 * page from unsaved blocks; `register` is what the page puts where the form
 * goes (the form, the registrant's status, the recording, or a preview of
 * it). After the end with a recording it is an evergreen page (brief §3):
 * labelled as recorded, with the day it was held.
 */
export function WebinarLanding(props: {
  view: LandingView;
  t: Translator;
  brand: { name: string; logo?: string };
  anonymity: boolean;
  register: ReactNode;
  /** Replaces the register block's heading once there is nothing to register for. */
  registerHeading?: string;
  /** A notice above everything (draft, cancelled, just registered). */
  notice?: ReactNode;
  /** The button in the time box that leads to the form. */
  cta?: string | null;
}) {
  const { view, t } = props;
  const start = new Date(view.startsAt);
  const time = formatWebinarTime(start, view.durationMinutes, view.timeZone, t.locale);
  const recorded = view.relive !== "none";
  // Seats only matter while there is a session to take part in.
  const seats = view.phase === "ended" ? null : seatsLine(t, view.seats);
  const own = (heading: string | undefined) => (heading ? view.locale : undefined);

  const block = (item: LandingBlock, index: number): ReactNode => {
    switch (item.type) {
      case "hero":
        return null;
      case "learn":
        return (
          <section key={index} className="space-y-4" aria-labelledby={`block-${index}`}>
            <h2 id={`block-${index}`} lang={own(item.heading)} className="font-display text-2xl">
              {item.heading ?? t.t("webinar.block.learn")}
            </h2>
            <ul className="grid gap-3 @xl:grid-cols-2">
              {item.items.map((entry, position) => (
                <li key={position} className="card-flat flex gap-3 p-4" lang={view.locale}>
                  <CircleCheck aria-hidden size={20} className="mt-0.5 shrink-0" />
                  {entry}
                </li>
              ))}
            </ul>
          </section>
        );
      case "build": {
        const artifact = view.course?.artifact;
        if (!artifact && !item.body) return null;
        return (
          <section key={index} className="card space-y-3 p-6" aria-labelledby={`block-${index}`}>
            <p id={`block-${index}`} lang={own(item.heading)} className="eyebrow">
              {item.heading ?? t.t("webinar.block.build")}
            </p>
            {artifact && view.course && (
              <>
                <p className="flex items-center gap-2 font-display text-2xl">
                  <Hammer aria-hidden size={22} className="shrink-0" /> {artifact}
                </p>
                <p className="text-muted">
                  {t.t("webinar.build.artifact", { course: view.course.title, artifact })}
                </p>
              </>
            )}
            {item.body && <Paragraphs text={item.body} lang={view.locale} />}
          </section>
        );
      }
      case "agenda":
        return (
          <section key={index} className="space-y-4" aria-labelledby={`block-${index}`}>
            <h2 id={`block-${index}`} lang={own(item.heading)} className="font-display text-2xl">
              {item.heading ?? t.t("webinar.block.agenda")}
            </h2>
            <ol className="card-flat divide-y divide-line">
              {item.items.map((entry, position) => (
                <li key={position} className="flex gap-4 p-4">
                  {entry.minute !== undefined &&
                    (recorded ? (
                      // Where it is in the recording, not a time of day to be there.
                      <span className="w-14 shrink-0 font-semibold tabular-nums">
                        {clockTime(entry.minute * 60)}
                      </span>
                    ) : (
                      <time
                        className="w-14 shrink-0 font-semibold tabular-nums"
                        dateTime={new Date(start.getTime() + entry.minute * 60_000).toISOString()}
                      >
                        {formatClock(
                          new Date(start.getTime() + entry.minute * 60_000),
                          view.timeZone,
                          t.locale,
                        )}
                      </time>
                    ))}
                  <span lang={view.locale}>{entry.title}</span>
                </li>
              ))}
            </ol>
          </section>
        );
      case "presenters": {
        const shown = shownPresenters(view.presenters, props.anonymity);
        return (
          <section key={index} className="space-y-4" aria-labelledby={`block-${index}`}>
            <h2 id={`block-${index}`} lang={own(item.heading)} className="font-display text-2xl">
              {item.heading ?? t.t("webinar.block.presenters")}
            </h2>
            {shown.kind === "brand" ? (
              // Anonymity mode: the academy presents, never a person.
              <div className="card-flat flex items-center gap-4 p-4">
                {props.brand.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded logo, any size
                  <img
                    src={props.brand.logo}
                    alt=""
                    className="h-12 w-auto max-w-40 object-contain"
                  />
                ) : (
                  <span className="grid size-12 place-items-center rounded-card bg-primary-soft">
                    <Users aria-hidden size={22} />
                  </span>
                )}
                <p className="font-semibold">
                  {t.t("webinar.brandPresenter", { academy: props.brand.name })}
                </p>
              </div>
            ) : (
              <ul className="grid gap-4 @xl:grid-cols-2">
                {shown.people.map((person, position) => (
                  <li key={position} className="card-flat flex items-center gap-4 p-4">
                    {person.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- uploaded photo
                      <img
                        src={person.photo}
                        alt=""
                        className="size-16 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="grid size-16 shrink-0 place-items-center rounded-full bg-primary-soft font-display text-xl"
                      >
                        {initials(person.name)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold">{person.name}</p>
                      {person.role && (
                        <p className="text-sm text-muted" lang={view.locale}>
                          {person.role}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      }
      case "faq":
        return (
          <section key={index} className="space-y-4" aria-labelledby={`block-${index}`}>
            <h2 id={`block-${index}`} lang={own(item.heading)} className="font-display text-2xl">
              {item.heading ?? t.t("webinar.block.faq")}
            </h2>
            <div className="space-y-2">
              {item.items.map((entry, position) => (
                <details key={position} className="card-flat p-4" lang={view.locale}>
                  <summary className="cursor-pointer font-semibold">{entry.question}</summary>
                  <div className="mt-2 space-y-2 text-muted">
                    <Paragraphs text={entry.answer} lang={view.locale} />
                  </div>
                </details>
              ))}
            </div>
          </section>
        );
      case "register":
        return (
          <section
            key={index}
            id="register"
            className="card scroll-mt-8 space-y-4 p-5 @xl:p-6"
            aria-labelledby={`block-${index}`}
          >
            {props.registerHeading ? (
              <h2 id={`block-${index}`} className="font-display text-2xl">
                {props.registerHeading}
              </h2>
            ) : (
              <h2 id={`block-${index}`} lang={own(item.heading)} className="font-display text-2xl">
                {item.heading ?? t.t("webinar.block.register")}
              </h2>
            )}
            {props.register}
          </section>
        );
    }
  };

  return (
    // Sized by its container, not the window: the Studio previews it in a narrow column.
    <article className="@container mx-auto max-w-4xl space-y-10 @xl:space-y-12">
      {props.notice}
      <header className="grid items-start gap-6 @2xl:grid-cols-[1.6fr_1fr] @2xl:gap-8">
        <div className="min-w-0 space-y-4">
          <p className="eyebrow flex flex-wrap items-center gap-2">
            {view.status === "cancelled" ? (
              <Badge tone="critical">{t.t("webinar.cancelledBadge")}</Badge>
            ) : recorded ? (
              <Badge tone="info" icon={Clapperboard}>
                {t.t("webinar.recordingBadge")}
              </Badge>
            ) : view.phase === "ended" ? (
              <Badge>{t.t("webinar.endedBadge")}</Badge>
            ) : (
              view.phase === "live" &&
              view.status === "published" && (
                <Badge tone="critical" icon={Radio}>
                  {t.t("webinar.live")}
                </Badge>
              )
            )}
            {props.brand.name}
          </p>
          <h1
            lang={view.locale}
            className="font-display text-3xl leading-tight [overflow-wrap:anywhere] @2xl:text-5xl"
          >
            {view.title}
          </h1>
          {view.description && (
            <div className="max-w-2xl space-y-3 text-lg text-muted">
              <Paragraphs text={view.description} lang={view.locale} />
            </div>
          )}
        </div>
        <aside className="card space-y-4 p-5">
          {recorded ? (
            // A recording: the day it was held, and no time to be there.
            <Meta icon={Clapperboard}>
              <time dateTime={view.startsAt} className="block font-semibold">
                {t.t("webinar.recordedOn", {
                  date: formatWebinarDate(start, view.timeZone, t.locale),
                })}
              </time>
            </Meta>
          ) : (
            <Meta icon={CalendarDays}>
              <time dateTime={view.startsAt} className="block font-semibold">
                {time}
              </time>
              <LocalTime
                startsAt={view.startsAt}
                durationMinutes={view.durationMinutes}
                timeZone={view.timeZone}
                locale={t.locale}
                label={t.t("webinar.yourTime", { time: "{time}" })}
              />
            </Meta>
          )}
          <Meta icon={Timer}>{t.t("webinar.minutes", { minutes: view.durationMinutes })}</Meta>
          <Meta icon={Languages}>
            {t.t("webinar.heldIn", {
              language: t.t(view.locale === "de" ? "webinar.language.de" : "webinar.language.en"),
            })}
          </Meta>
          {seats && (
            <p>
              <Badge tone={view.seats.state === "full" ? "warning" : "info"} icon={Users}>
                {seats}
              </Badge>
            </p>
          )}
          {props.cta && (
            <a href="#register" className="btn btn-primary w-full">
              {props.cta}
            </a>
          )}
        </aside>
      </header>
      {view.blocks.map(block)}
    </article>
  );
}

import { localize, type Locale, type LocalizedText } from "@/core/i18n/locales";
import { capacityState, seatsLeft } from "@/core/webinars/capacity";
import type { LandingBlock, Presenter } from "@/core/webinars/landing";
import { webinarPhase, type WebinarStatus } from "@/core/webinars/phase";
import type { LandingView } from "@/components/webinars/landing";

/** The landing page's view of a webinar, from what the page (or the Studio's preview) has. */
export function landingView(input: {
  webinar: {
    title: string;
    description: string;
    locale: string;
    startsAt: Date;
    durationMinutes: number;
    timeZone: string;
    blocks: LandingBlock[];
    presenters: Presenter[];
    capacity: number | null;
    status: WebinarStatus;
  };
  course: { title: LocalizedText; artifactName: LocalizedText | null } | null;
  taken: number;
  fallback: Locale;
  now: Date;
}): LandingView {
  const { webinar } = input;
  // The course is named in the webinar's language, like the rest of its page.
  const courseLocale = (webinar.locale === "de" ? "de" : "en") as Locale;
  return {
    title: webinar.title,
    description: webinar.description,
    locale: courseLocale,
    startsAt: webinar.startsAt.toISOString(),
    durationMinutes: webinar.durationMinutes,
    timeZone: webinar.timeZone,
    blocks: webinar.blocks,
    presenters: webinar.presenters,
    course: input.course
      ? {
          title: localize(input.course.title, courseLocale, [input.fallback]),
          artifact: input.course.artifactName
            ? localize(input.course.artifactName, courseLocale, [input.fallback])
            : null,
        }
      : null,
    seats: {
      state: capacityState(webinar.capacity, input.taken),
      left: seatsLeft(webinar.capacity, input.taken),
    },
    phase: webinarPhase(webinar, input.now),
    status: webinar.status,
  };
}

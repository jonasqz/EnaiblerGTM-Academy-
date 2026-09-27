import { Gift, Hammer, ListChecks, Timer } from "lucide-react";
import Link from "next/link";

import { requiresTest } from "@/core/courses/completion";
import { localize, type Locale } from "@/core/i18n/locales";
import type { Translator } from "@/core/i18n/translator";
import type { LandingCourse } from "@/server/credentials/landing";

/**
 * For visitors, below the credential: the course behind it and the academy's
 * call to action (brief §2 step 8: every shared credential is a way in).
 * Only course facts; nothing about the learner beyond the credential itself.
 * A course that is no longer published keeps just the ways in.
 */
export function AboutCourse(props: {
  course: LandingCourse | null;
  cta: { href: string; label: string };
  t: Translator;
  fallback: Locale[];
}) {
  const { course, t } = props;
  const actions = (
    <div className="flex flex-wrap gap-3">
      <a href={props.cta.href} className="btn btn-primary">
        {props.cta.label}
      </a>
      <Link href="/#courses" className="btn btn-secondary">
        {t.t("home.browse")}
      </Link>
    </div>
  );
  if (!course) return actions;

  const summary = course.summary ? localize(course.summary, t.locale, props.fallback) : null;
  const artifact = course.artifactName
    ? localize(course.artifactName, t.locale, props.fallback)
    : null;
  const withTest = requiresTest(course.completionMode);
  const ending = artifact
    ? t.t(withTest ? "share.endsWorkAndTest" : "share.endsWork", { artifact })
    : withTest
      ? t.t("course.test.endsWith")
      : null;
  const EndingIcon = artifact ? Hammer : ListChecks;

  return (
    <section aria-labelledby="about-course-heading" className="card space-y-5 p-6 sm:p-10">
      <div className="space-y-2">
        <h2 id="about-course-heading" className="font-display text-2xl">
          {t.t("share.aboutTitle")}
        </h2>
        {summary && <p className="text-muted">{summary}</p>}
      </div>
      <ul className="space-y-2 text-sm">
        {ending && (
          <li className="flex items-start gap-2">
            <EndingIcon aria-hidden size={16} className="mt-0.5 shrink-0" /> {ending}
          </li>
        )}
        {course.estMinutes && (
          <li className="flex items-start gap-2">
            <Timer aria-hidden size={16} className="mt-0.5 shrink-0" />{" "}
            {t.t("home.minutes", { minutes: course.estMinutes })}
          </li>
        )}
        {course.free && (
          <li className="flex items-start gap-2">
            <Gift aria-hidden size={16} className="mt-0.5 shrink-0" /> {t.t("share.free")}
          </li>
        )}
      </ul>
      {actions}
    </section>
  );
}

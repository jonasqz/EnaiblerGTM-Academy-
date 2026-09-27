import { TriangleAlert, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { joinCohortAction } from "@/app/(academy)/join/[code]/actions";
import { cohortDateLine } from "@/components/cohort-dates";
import { localize } from "@/core/i18n/locales";
import { getDb } from "@/db/client";
import { getSession } from "@/server/access";
import { cohortByCode } from "@/server/cohorts";
import { getTenant, getTranslator } from "@/server/request";

export const metadata: Metadata = { robots: { index: false } };

/** A cohort's join link (/join/<code>): sign in, join, start the course. */
export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  const tenant = await getTenant();
  const t = await getTranslator();
  const session = await getSession();
  const found = await cohortByCode(getDb(), tenant.id, code.toLowerCase());
  const usable =
    found !== null &&
    tenant.settings.features.cohorts &&
    found.cohort.status === "open" &&
    found.course.status === "published";

  if (!usable) {
    return (
      <div className="card mx-auto max-w-lg space-y-3 p-6 sm:p-8">
        <TriangleAlert aria-hidden size={32} style={{ color: "var(--status-warning)" }} />
        <h1 className="font-display text-2xl">{t.t("cohort.invalid")}</h1>
        <p className="text-muted">{t.t("cohort.invalidBody")}</p>
      </div>
    );
  }
  const course = localize(found.course.title, t.locale, [tenant.settings.default_locale]);
  const dates = cohortDateLine(t, found.cohort.startsOn, found.cohort.endsOn);
  return (
    <div className="card mx-auto max-w-lg space-y-4 p-6 sm:p-8">
      <UsersRound aria-hidden size={32} />
      <p className="eyebrow">{course}</p>
      <h1 className="font-display text-3xl">
        {t.t("cohort.joinTitle", { cohort: found.cohort.name })}
      </h1>
      {dates && <p className="font-semibold">{dates}</p>}
      <p className="text-muted">{t.t("cohort.joinBody", { course })}</p>
      {session ? (
        <form action={joinCohortAction}>
          <input type="hidden" name="code" value={code.toLowerCase()} />
          <button type="submit" className="btn btn-primary">
            {t.t("cohort.join")}
          </button>
        </form>
      ) : (
        <Link
          href={`/sign-in?next=${encodeURIComponent(`/join/${code.toLowerCase()}`)}`}
          className="btn btn-primary"
        >
          {t.t("cohort.signInToJoin")}
        </Link>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { StatTile } from "@/components/ui/stat-tile";
import type { StudioText } from "@/core/i18n/studio/translator";
import {
  AI_USAGE_GROUPS,
  midMonth,
  recentMonths,
  usageMonth,
  type KindUsage,
} from "@/core/usage/ai-usage";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { studioUsage } from "@/server/studio/usage";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("settings.tab.usage") };
}

const PICKER_MONTHS = 12;

/** Everything but reviews: the team's authoring in the order of the groups, then the setup. */
const TEAM_KINDS = [...AI_USAGE_GROUPS.authoring, ...AI_USAGE_GROUPS.setup];

/** Transcription is measured in audio and the search index in text; the rest in requests. */
const REQUEST_KINDS = TEAM_KINDS.filter((kind) => kind !== "transcription" && kind !== "embedding");

const audioMinutes = (seconds: number) => Math.round(seconds / 6) / 10;

function amount(t: StudioText, usage: KindUsage): string {
  if (usage.kind === "transcription") {
    return t.n("settings.usage.minutes", audioMinutes(usage.audioSeconds));
  }
  if (usage.kind === "embedding") return t.n("settings.usage.tokens", usage.tokensIn);
  return t.n("settings.usage.requests", usage.calls);
}

/** One bar per month in one hue; the numbers are written out, so the list is its own table. */
function MonthlyBars(props: {
  t: StudioText;
  rows: Array<{ month: string; label: string; reviews: number }>;
  selected: string;
  caption: string;
}) {
  const { t } = props;
  const max = Math.max(1, ...props.rows.map((row) => row.reviews));
  return (
    <figure>
      <figcaption className="sr-only">{props.caption}</figcaption>
      <ol className="space-y-3">
        {props.rows.map((row) => (
          <li
            key={row.month}
            className="grid grid-cols-[minmax(7rem,9rem)_1fr] items-center gap-3"
            title={`${row.label}: ${t.n("settings.usage.reviews", row.reviews)}`}
          >
            <span
              className={`truncate text-sm ${row.month === props.selected ? "font-semibold" : ""}`}
            >
              {row.label}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              {row.reviews > 0 && (
                <span className="bar" style={{ width: `${(row.reviews / max) * 80}%` }} />
              )}
              <span className="text-sm font-semibold tabular-nums">{t.number(row.reviews)}</span>
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/**
 * How much the academy used the AI in a month. Amounts only, never what the
 * calls cost: provider costs are enaibler's own, and what an academy pays for
 * AI review will be priced separately (brief §15, decision 6).
 */
export default async function UsagePage({ searchParams }: PageProps<"/studio/settings/usage">) {
  const { tenant } = await requireCapability("academy.manage", "/studio/settings/usage");
  const t = await getStudioText();
  const months = recentMonths(usageMonth(new Date()), PICKER_MONTHS);
  const { month: requested } = await searchParams;
  const month = months.find((candidate) => candidate === requested) ?? months[0]!;
  const usage = await studioUsage(getDb(), tenant, month);
  const monthName = (value: string) => t.date(midMonth(value), "month");
  const selected = monthName(month);
  const requests = REQUEST_KINDS.reduce((sum, kind) => sum + usage.kinds[kind].calls, 0);

  return (
    <div className="max-w-4xl space-y-6">
      <section aria-labelledby="usage-heading" className="card-flat space-y-4 p-5 sm:p-6">
        <div className="space-y-1">
          <h2 id="usage-heading" className="text-lg font-semibold">
            {t.t("settings.usage.heading")}
          </h2>
          <p className="text-sm text-muted">{t.t("settings.usage.intro")}</p>
          <p className="text-sm text-muted">{t.t("settings.usage.amounts")}</p>
        </div>
        <Form action="/studio/settings/usage" className="flex flex-wrap items-end gap-2">
          <div className="field">
            <label htmlFor="usage-month" className="label">
              {t.t("settings.usage.month")}
            </label>
            {/* Keyed by the month shown, so going back never leaves another month selected. */}
            <select
              key={month}
              id="usage-month"
              name="month"
              defaultValue={month}
              className="select w-auto"
            >
              {months.map((value) => (
                <option key={value} value={value}>
                  {monthName(value)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-secondary">
            {t.t("settings.usage.show")}
          </button>
        </Form>
      </section>

      {/* A visible month: the picker may already show another one before "Show" is pressed. */}
      <section aria-labelledby="totals-heading" className="space-y-3">
        <h2 id="totals-heading" className="text-lg font-semibold">
          {t.t("settings.usage.totals", { month: selected })}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            locale={t.locale}
            label={t.t("settings.usage.stat.reviews")}
            value={usage.kinds.review.items}
            hint={t.t("settings.usage.stat.reviewsHint")}
          />
          <StatTile
            locale={t.locale}
            label={t.t("settings.usage.team")}
            value={requests}
            hint={t.t("settings.usage.stat.teamHint")}
          />
          <StatTile
            locale={t.locale}
            label={t.t("settings.usage.stat.audio")}
            value={audioMinutes(usage.kinds.transcription.audioSeconds)}
            hint={t.t("settings.usage.stat.audioHint")}
          />
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="courses-heading" className="card-flat space-y-3 p-5">
          <div>
            <h2 id="courses-heading" className="text-lg font-semibold">
              {t.t("settings.usage.byCourse")}
            </h2>
            <p className="text-sm text-muted">{t.t("settings.usage.byCourseIntro")}</p>
          </div>
          {usage.byCourse.length === 0 ? (
            <p className="text-sm text-muted">
              {t.t("settings.usage.noReviews", { month: selected })}
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">
                  {t.t("settings.usage.byCourseCaption", { month: selected })}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{t.t("settings.usage.column.course")}</th>
                    <th scope="col" className="num">
                      {t.t("settings.usage.column.reviews")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {usage.byCourse.map((row) => (
                    <tr key={row.courseId ?? "deleted"}>
                      <td>
                        {row.courseId ? (
                          <Link
                            href={`/studio/courses/${row.courseId}`}
                            className="font-semibold hover:underline"
                          >
                            {row.title}
                          </Link>
                        ) : (
                          <span className="text-muted">{t.t("settings.usage.deletedCourse")}</span>
                        )}
                      </td>
                      <td className="num">{t.number(row.reviews)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="history-heading" className="card-flat space-y-4 p-5">
          <h2 id="history-heading" className="text-lg font-semibold">
            {t.t("settings.usage.history")}
          </h2>
          <MonthlyBars
            t={t}
            selected={month}
            caption={t.t("settings.usage.historyCaption", {
              from: monthName(usage.history[0]!.month),
              to: selected,
            })}
            rows={usage.history.map((row) => ({ ...row, label: monthName(row.month) }))}
          />
        </section>
      </div>

      <section aria-labelledby="team-heading" className="card-flat space-y-3 p-5 sm:p-6">
        <div>
          <h2 id="team-heading" className="text-lg font-semibold">
            {t.t("settings.usage.team")}
          </h2>
          <p className="text-sm text-muted">{t.t("settings.usage.teamIntro")}</p>
        </div>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">
              {t.t("settings.usage.teamCaption", { month: selected })}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t.t("settings.usage.column.use")}</th>
                <th scope="col" className="num">
                  {t.t("settings.usage.column.amount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {TEAM_KINDS.map((kind) => {
                const used = usage.kinds[kind];
                return (
                  <tr key={kind}>
                    <td>{t.t(`settings.usage.kind.${kind}`)}</td>
                    <td className={`num whitespace-nowrap ${used.calls === 0 ? "text-muted" : ""}`}>
                      {amount(t, used)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

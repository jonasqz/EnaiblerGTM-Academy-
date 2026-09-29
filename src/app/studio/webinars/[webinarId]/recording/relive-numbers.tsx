import { ChartLine, Film } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import type { StudioText } from "@/core/i18n/studio/translator";
import type { CatchUp } from "@/core/webinars/relive";
import type { ReliveNumbers } from "@/server/webinars/recording";

/** The catch-up rate as a tile: a share, or a dash while nobody missed it. */
function CatchUpTile(props: { t: StudioText; catchUp: CatchUp }) {
  const { t, catchUp } = props;
  return (
    <div className="card-flat p-4">
      <p className="text-sm text-muted">{t.t("webinars.recording.catchUp")}</p>
      <p className="mt-1 font-body text-3xl font-semibold">
        {catchUp.rate === null ? "–" : t.number(catchUp.rate / 100, { style: "percent" })}
      </p>
      <p className="mt-1 text-sm text-muted">
        {catchUp.missed === 0
          ? t.t("webinars.recording.catchUpNone")
          : t.t("webinars.recording.catchUpHint", {
              caughtUp: catchUp.caughtUp,
              missed: catchUp.missed,
            })}
      </p>
    </div>
  );
}

/**
 * Who watched the recording and the no-show catch-up rate (webinar brief
 * §3, §8), with the way to the video's drop-off by minute. On the Recording
 * tab and the webinar's overview.
 */
export function ReliveNumbersView(props: {
  t: StudioText;
  numbers: ReliveNumbers;
  percent: number;
  /** Studio → Videos and the Recording tab are for those who edit courses. */
  editor: boolean;
  /** The Recording tab, linked from the overview. */
  settings?: string;
}) {
  const { t, numbers } = props;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card-flat p-4">
          <p className="text-sm text-muted">{t.t("webinars.recording.watched")}</p>
          <p className="mt-1 font-body text-3xl font-semibold">{t.number(numbers.watched)}</p>
          <p className="mt-1 text-sm text-muted">
            {t.t("webinars.recording.watchedHint", { percent: props.percent })}
          </p>
        </div>
        <CatchUpTile t={t} catchUp={numbers.catchUp} />
      </div>
      {props.editor && (
        <p className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link
            href={`/studio/videos/${numbers.assetId}#retention-heading` as Route}
            className="inline-flex items-center gap-1.5 font-semibold underline-offset-4 hover:underline"
          >
            <ChartLine aria-hidden size={16} /> {t.t("webinars.recording.dropOff")}
          </Link>
          {props.settings && (
            <Link
              href={props.settings as Route}
              className="inline-flex items-center gap-1.5 font-semibold underline-offset-4 hover:underline"
            >
              <Film aria-hidden size={16} /> {t.t("webinars.recording.settings")}
            </Link>
          )}
        </p>
      )}
    </>
  );
}

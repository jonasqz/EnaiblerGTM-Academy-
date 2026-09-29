import { CircleCheck, Clock, Hammer } from "lucide-react";
import type { ReactNode } from "react";

import { MediaBlock } from "@/components/media/media-block";
import type { WatchResult } from "@/components/media/use-watch-reporting";
import type { Translator } from "@/core/i18n/translator";
import { canWatch, type MediaViewer } from "@/core/media/access";
import type { ReliveState } from "@/core/webinars/relive";
import type { MediaAsset } from "@/server/media/library";

/**
 * Where the form was, once the webinar is over and has a recording (webinar
 * brief §3, evergreen pages: "watch the recording and build the artifact").
 * Those who may watch get the player with chapters, captions and the
 * transcript; a registrant waits for it while it is being prepared; anyone
 * else registers to get it. The course follows as the next step.
 */
export function RecordingBlock(props: {
  t: Translator;
  slug: string;
  relive: Exclude<ReliveState, "none">;
  recording: MediaAsset;
  viewer: MediaViewer | null;
  progress: (WatchResult & { positionSec: number | null }) | null;
  /** They registered (a seat or the waitlist). */
  registered: boolean;
  attended: boolean;
  signedIn: boolean;
  /** The registration form, worded for the recording. */
  form: ReactNode;
  checkIn?: ReactNode;
  course: { href: string; title: string; artifact: string | null } | null;
}) {
  const { t, relive, recording } = props;
  const watchable = relive === "ready" && canWatch(recording.access, props.viewer);
  let main: ReactNode;
  if (watchable) {
    main = <MediaBlock asset={recording} t={t} viewer={props.viewer} progress={props.progress} />;
  } else if (props.registered) {
    main = (
      <p className="flex gap-3 rounded-card bg-primary-soft p-4">
        <Clock aria-hidden size={22} className="mt-0.5 shrink-0" />
        {t.t("webinar.relive.coming")}
      </p>
    );
  } else {
    main = (
      <div className="space-y-4">
        <p>
          {t.t(relive === "ready" ? "webinar.relive.register" : "webinar.relive.registerComing")}
        </p>
        {props.form}
        {!props.signedIn && (
          <p className="text-sm">
            <a
              href={`/sign-in?next=${encodeURIComponent(`/webinars/${props.slug}#recording`)}`}
              className="underline underline-offset-2"
            >
              {t.t("webinar.relive.signIn")}
            </a>
          </p>
        )}
      </div>
    );
  }
  return (
    <div id="recording" className="scroll-mt-24 space-y-5">
      {props.attended && (
        <p className="flex items-center gap-2">
          <CircleCheck aria-hidden size={18} /> {t.t("webinar.status.attended")}
        </p>
      )}
      {props.checkIn}
      {main}
      {props.course && (
        <div className="space-y-3 border-t border-line pt-5">
          <p className="flex gap-2">
            {props.course.artifact && <Hammer aria-hidden size={20} className="mt-0.5 shrink-0" />}
            {props.course.artifact
              ? t.t("webinar.relive.build", {
                  artifact: props.course.artifact,
                  course: props.course.title,
                })
              : t.t("webinar.endedCourse", { course: props.course.title })}
          </p>
          <a href={props.course.href} className="btn btn-primary">
            {t.t(props.course.artifact ? "webinar.relive.buildCta" : "webinar.courseCta")}
          </a>
        </div>
      )}
    </div>
  );
}

import { ExternalLink, Film, Trash2 } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getStudioWebinar } from "@/app/studio/webinars/[webinarId]/load";
import {
  AttachRecordingForm,
  ReliveAccessForm,
} from "@/app/studio/webinars/[webinarId]/recording/recording-forms";
import { ReliveNumbersView } from "@/app/studio/webinars/[webinarId]/recording/relive-numbers";
import { addRecordingAction, removeRecordingAction } from "@/app/studio/webinars/actions";
import { AddVideo } from "@/app/studio/videos/add-video";
import { VideoStatusBadge, videoError, videoKind } from "@/app/studio/videos/video-labels";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { localize } from "@/core/i18n/locales";
import { clockTime } from "@/core/media/captions";
import { PROVIDER_NAMES } from "@/core/media/embeds";
import { webinarPhase } from "@/core/webinars/phase";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { lessonsShowing, loadVideo, recordingsForLibrary } from "@/server/media/library";
import { getStudioText } from "@/server/studio-text";
import { attachableVideos, confirmerOf, reliveNumbers } from "@/server/webinars/recording";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("webinars.recording.title") };
}

/**
 * The webinar's recording (webinar brief §2.4, §3, §5): which video it is,
 * who may watch it (wider than registrants only with the host's
 * confirmation), and who watched. The video's own access follows from here.
 */
export default async function WebinarRecordingPage({
  params,
  searchParams,
}: PageProps<"/studio/webinars/[webinarId]/recording">) {
  const { webinarId } = await params;
  const { removed, attached } = await searchParams;
  const { tenant } = await requireCapability(
    "courses.edit",
    `/studio/webinars/${webinarId}/recording`,
  );
  const t = await getStudioText();
  const loaded = await getStudioWebinar(tenant.id, webinarId);
  if (!loaded) notFound();
  const { webinar } = loaded;
  const [video, videos, recordings, numbers, confirmer] = await Promise.all([
    webinar.recordingAssetId ? loadVideo(getDb(), tenant.id, webinar.recordingAssetId) : null,
    attachableVideos(getDb(), tenant.id, webinar.id),
    recordingsForLibrary(getDb(), tenant.id),
    reliveNumbers(getDb(), tenant, webinar.id),
    confirmerOf(getDb(), webinar),
  ]);
  const lessons = video ? await lessonsShowing(getDb(), tenant.id, video.id) : [];
  const choices = videos.filter((row) => row.id !== video?.id);
  const phase = webinarPhase(webinar, new Date());
  const cancelled = webinar.status === "cancelled";
  const percent = tenant.settings.video.watched_percent;
  const hidden = <input type="hidden" name="webinarId" value={webinar.id} />;

  return (
    <div className="space-y-8">
      <AutoRefresh active={video?.status === "processing"} everyMs={5_000} />
      {removed === "1" && <Notice tone="good" title={t.t("webinars.recording.removed")} />}
      {attached === "1" && video && (
        <Notice tone="good" title={t.t("webinars.recording.attached")} />
      )}
      {cancelled && <Notice tone="warning" title={t.t("webinars.recording.cancelled")} />}

      <section className="space-y-4" aria-labelledby="recording-heading">
        <div className="space-y-1">
          <h2 id="recording-heading" className="text-lg font-semibold">
            {t.t("webinars.recording.title")}
          </h2>
          <p className="max-w-3xl text-sm text-muted">{t.t("webinars.recording.intro")}</p>
        </div>
        {!video ? (
          <EmptyState
            icon={Film}
            title={t.t("webinars.recording.none")}
            body={t.t("webinars.recording.noneBody")}
          />
        ) : (
          <div className="card space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <p className="font-semibold [overflow-wrap:anywhere]">{video.title}</p>
                <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                  <VideoStatusBadge t={t} status={video.status} />
                  <span>{videoKind(t, video)}</span>
                  {video.durationSec ? (
                    <span className="tabular-nums">{clockTime(video.durationSec)}</span>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/studio/videos/${video.id}` as Route}
                  className="btn btn-secondary btn-sm"
                >
                  <ExternalLink aria-hidden size={14} /> {t.t("webinars.recording.open")}
                </Link>
                <form action={removeRecordingAction}>
                  {hidden}
                  <SubmitButton
                    className="btn btn-ghost btn-sm"
                    confirm={t.t("webinars.recording.removeConfirm")}
                  >
                    <Trash2 aria-hidden size={14} /> {t.t("webinars.recording.remove")}
                  </SubmitButton>
                </form>
              </div>
            </div>
            <p className="text-sm">
              {t.t(`webinars.recording.status.${video.status}`)}{" "}
              {video.status === "failed" && videoError(t, video.error)}
            </p>
            {!cancelled && phase !== "ended" && (
              <p className="text-sm text-muted">{t.t("webinars.recording.upcoming")}</p>
            )}
            <p className="text-sm text-muted">{t.t("webinars.recording.mails")}</p>
            {numbers && numbers.mailed > 0 && (
              <p className="text-sm">{t.n("webinars.recording.mailed", numbers.mailed)}</p>
            )}
          </div>
        )}
      </section>

      {video && !cancelled && (
        <section className="card-flat space-y-4 p-5 sm:p-6" aria-labelledby="access-heading">
          <h2 id="access-heading" className="text-lg font-semibold">
            {t.t("webinars.recording.access")}
          </h2>
          {video.kind === "external_embed" && video.embed && (
            <Notice
              tone="warning"
              title={t.t("webinars.recording.embedNote", {
                provider: PROVIDER_NAMES[video.embed.provider],
              })}
            />
          )}
          {webinar.reliveAccess === "registrants" && lessons.length > 0 && (
            <Notice tone="info" title={t.n("webinars.recording.lessons", lessons.length)} />
          )}
          {webinar.reliveConfirmedAt && (
            <p className="text-sm">
              {confirmer
                ? t.t("webinars.recording.confirmed", {
                    date: t.date(webinar.reliveConfirmedAt, "dateTime"),
                    who: confirmer,
                  })
                : t.t("webinars.recording.confirmedOn", {
                    date: t.date(webinar.reliveConfirmedAt, "dateTime"),
                  })}
            </p>
          )}
          <ReliveAccessForm webinarId={webinar.id} current={webinar.reliveAccess} />
        </section>
      )}

      {numbers && (
        <section className="space-y-4" aria-labelledby="numbers-heading">
          <div className="space-y-1">
            <h2 id="numbers-heading" className="text-lg font-semibold">
              {t.t("webinars.recording.numbers")}
            </h2>
            <p className="text-sm text-muted">
              {t.t("webinars.recording.numbersIntro", { percent })}
            </p>
          </div>
          <ReliveNumbersView t={t} numbers={numbers} percent={percent} editor />
        </section>
      )}

      {!cancelled && (
        <>
          {choices.length > 0 && (
            <section className="card-flat space-y-4 p-5 sm:p-6" aria-labelledby="choose-heading">
              <div className="space-y-1">
                <h2 id="choose-heading" className="text-lg font-semibold">
                  {t.t(video ? "webinars.recording.replace" : "webinars.recording.choose")}
                </h2>
                {video && (
                  <p className="text-sm text-muted">{t.t("webinars.recording.replaceHint")}</p>
                )}
              </div>
              <AttachRecordingForm
                webinarId={webinar.id}
                videos={choices.map((row) => ({
                  id: row.id,
                  title: row.title,
                  processing: row.status === "processing",
                }))}
              />
            </section>
          )}
          <AddVideo
            heading={t.t("webinars.recording.add")}
            action={addRecordingAction}
            hidden={{ webinarId: webinar.id }}
            locales={tenant.settings.locales}
            recordings={recordings.map((recording) => ({
              id: recording.id,
              title: recording.title,
              course: localize(recording.courseTitle, tenant.settings.default_locale),
              pending: recording.status === "pending" || recording.status === "processing",
            }))}
          />
        </>
      )}
    </div>
  );
}

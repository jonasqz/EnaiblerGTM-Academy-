import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { deleteVideoAction } from "@/app/studio/videos/actions";
import { RetentionChart } from "@/app/studio/videos/[assetId]/retention-chart";
import { VideoForm } from "@/app/studio/videos/[assetId]/video-form";
import {
  AccessLabel,
  VideoStatusBadge,
  videoError,
  videoKind,
} from "@/app/studio/videos/video-labels";
import { MediaBlock } from "@/components/media/media-block";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { Notice } from "@/components/ui/notice";
import { StatTile } from "@/components/ui/stat-tile";
import { SubmitButton } from "@/components/ui/submit-button";
import { isLocale } from "@/core/i18n/locales";
import { languageName } from "@/core/i18n/studio/helpers";
import type { StudioText } from "@/core/i18n/studio/translator";
import { tenantTranslator } from "@/core/i18n/tenant-translator";
import { clockTime } from "@/core/media/captions";
import { PROVIDER_NAMES, watchUrl } from "@/core/media/embeds";
import { viewersPerMinute, watchSummary } from "@/core/media/retention";
import { themeToCssVariables } from "@/core/theme/css";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { lessonsShowing, loadVideo, watchRows, type MediaAsset } from "@/server/media/library";
import { getStudioText } from "@/server/studio-text";
import { webinarShowing } from "@/server/webinars/recording";

export async function generateMetadata({
  params,
}: PageProps<"/studio/videos/[assetId]">): Promise<Metadata> {
  const { assetId } = await params;
  const { tenant } = await requireCapability("courses.edit", `/studio/videos/${assetId}`);
  const video = await loadVideo(getDb(), tenant.id, assetId);
  const t = await getStudioText();
  return { title: video?.title ?? t.t("media.title") };
}

function captionsText(t: StudioText, video: MediaAsset): string {
  if (video.kind === "external_embed" && video.embed) {
    return t.t("media.detail.captions.embed", { provider: PROVIDER_NAMES[video.embed.provider] });
  }
  switch (video.transcriptStatus) {
    case "processing":
      return t.t("media.detail.captions.processing");
    case "failed":
      return t.t("media.detail.captions.failed", {
        reason: videoError(t, video.transcriptError) ?? "",
      });
    case "ready":
      return video.transcript?.length && isLocale(video.locale)
        ? t.t("media.detail.captions.ready", {
            language: languageName(t, video.locale),
            lines: video.transcript.length,
          })
        : t.t("media.detail.captions.none");
    default:
      return t.t("media.detail.captions.none");
  }
}

/**
 * One video: a preview as learners see it, its details and chapters, where
 * lessons and a webinar show it, and who watched how far (drop-off by
 * minute, brief §3).
 */
export default async function VideoPage({ params }: PageProps<"/studio/videos/[assetId]">) {
  const { assetId } = await params;
  const { tenant } = await requireCapability("courses.edit", `/studio/videos/${assetId}`);
  const video = await loadVideo(getDb(), tenant.id, assetId);
  if (!video) notFound();
  const t = await getStudioText();
  const [rows, lessons, webinar] = await Promise.all([
    watchRows(getDb(), tenant.id, video.id),
    lessonsShowing(getDb(), tenant.id, video.id),
    webinarShowing(getDb(), tenant.id, video.id),
  ]);
  // An embed's length comes from its viewers' players.
  const duration = video.durationSec ?? Math.max(0, ...rows.map((row) => row.durationSec ?? 0));
  const counts = viewersPerMinute(
    rows.map((row) => row.ranges),
    duration,
  );
  const threshold = tenant.settings.video.watched_percent;
  const summary = watchSummary(rows, threshold);
  // The preview speaks a language the academy offers, like every learner preview in the Studio.
  const learner = tenantTranslator(tenant, t.locale);
  const busy = video.status === "processing" || video.transcriptStatus === "processing";

  return (
    <div className="space-y-8">
      <AutoRefresh active={busy} everyMs={5_000} />
      <Link
        href={"/studio/videos" as Route}
        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> {t.t("media.back")}
      </Link>

      <header className="space-y-2">
        <h1 className="font-display text-2xl leading-tight sm:text-3xl">{video.title}</h1>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <VideoStatusBadge t={t} status={video.status} />
          <span>{videoKind(t, video)}</span>
          {video.durationSec ? (
            <span className="tabular-nums">{clockTime(video.durationSec)}</span>
          ) : null}
          <AccessLabel t={t} access={video.access} />
          {video.embed && (
            <a
              href={watchUrl(video.embed)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2"
            >
              {t.t("media.detail.source", { provider: PROVIDER_NAMES[video.embed.provider] })}
              <ExternalLink aria-hidden size={14} />
            </a>
          )}
        </p>
      </header>

      {video.status === "processing" && (
        <Notice tone="info" title={t.t("media.detail.processing")}>
          {t.t("media.detail.processingBody")}
        </Notice>
      )}
      {video.status === "failed" && (
        <Notice tone="critical" title={t.t("media.detail.failed")}>
          {videoError(t, video.error)}
        </Notice>
      )}

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-8">
          {video.status === "ready" && (
            <section aria-labelledby="preview-heading" className="space-y-3">
              <div>
                <h2 id="preview-heading" className="text-lg font-semibold">
                  {t.t("media.detail.preview")}
                </h2>
                <p className="text-sm text-muted">{t.t("media.detail.previewHint")}</p>
              </div>
              {/* The academy's own theme, inside the Studio's. */}
              <div
                lang={learner.locale}
                data-theme-scope
                style={themeToCssVariables(tenant.theme) as CSSProperties}
                className="rounded-card bg-surface p-3 font-body text-ink sm:p-5"
              >
                <MediaBlock
                  asset={video}
                  t={learner}
                  viewer={{ member: true, canEditCourses: true }}
                  track={false}
                />
              </div>
            </section>
          )}

          <section aria-labelledby="watch-heading" className="space-y-4">
            <div>
              <h2 id="watch-heading" className="text-lg font-semibold">
                {t.t("media.watch.heading")}
              </h2>
              <p className="text-sm text-muted">{t.t("media.watch.intro")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile
                locale={t.locale}
                label={t.t("media.watch.viewers")}
                value={summary.viewers}
                hint={t.t("media.watch.viewersHint")}
              />
              <StatTile
                locale={t.locale}
                label={t.t("media.watch.watched")}
                value={summary.watched}
                hint={t.t("media.watch.watchedHint", { percent: threshold })}
              />
              <StatTile
                locale={t.locale}
                label={t.t("media.watch.average")}
                value={summary.averagePercent}
                hint={t.t("media.watch.averageHint")}
              />
            </div>
            <section aria-labelledby="retention-heading" className="card-flat space-y-4 p-5">
              <div>
                <h3 id="retention-heading" className="font-semibold">
                  {t.t("media.retention.heading")}
                </h3>
                <p className="text-sm text-muted">{t.t("media.retention.intro")}</p>
              </div>
              {rows.length === 0 ? (
                <p className="text-sm text-muted">{t.t("media.retention.empty")}</p>
              ) : counts.length === 0 ? (
                <p className="text-sm text-muted">{t.t("media.retention.noLength")}</p>
              ) : (
                <>
                  <p className="text-sm">
                    {t.t("media.retention.summary", {
                      first: t.n("media.retention.viewers", counts[0]!),
                      last: t.n("media.retention.viewers", counts.at(-1)!),
                    })}
                  </p>
                  <RetentionChart counts={counts} title={video.title} />
                </>
              )}
            </section>
          </section>
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="details-heading" className="card-flat space-y-4 p-5">
            <h2 id="details-heading" className="text-lg font-semibold">
              {t.t("media.detail.details")}
            </h2>
            <VideoForm
              assetId={video.id}
              title={video.title}
              access={video.access}
              chapters={video.chapters}
              webinar={webinar !== null}
            />
          </section>

          {webinar && (
            <section aria-labelledby="webinar-heading" className="card-flat space-y-2 p-5">
              <h2 id="webinar-heading" className="font-semibold">
                {t.t("media.webinar.heading")}
              </h2>
              <p className="text-sm text-muted">
                {t.t("media.webinar.body", {
                  webinar: webinar.title,
                  access: t.t(`webinars.recording.access.${webinar.reliveAccess}`),
                })}
              </p>
              <Link
                href={`/studio/webinars/${webinar.id}/recording` as Route}
                className="inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline"
              >
                {t.t("media.webinar.link")}
              </Link>
            </section>
          )}

          <section aria-labelledby="captions-heading" className="card-flat space-y-2 p-5">
            <h2 id="captions-heading" className="font-semibold">
              {t.t("media.detail.captions")}
            </h2>
            <p className="text-sm text-muted">{captionsText(t, video)}</p>
          </section>

          <section aria-labelledby="lessons-heading" className="card-flat space-y-2 p-5">
            <h2 id="lessons-heading" className="font-semibold">
              {t.t("media.usedIn.heading")}
            </h2>
            {lessons.length === 0 ? (
              <p className="text-sm text-muted">{t.t("media.usedIn.none")}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <Link
                      href={`/studio/courses/${lesson.courseId}/lessons/${lesson.id}` as Route}
                      className="underline-offset-4 hover:underline"
                    >
                      {lesson.title}
                    </Link>{" "}
                    <span className="text-muted">({languageName(t, lesson.locale)})</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <form action={deleteVideoAction}>
            <input type="hidden" name="assetId" value={video.id} />
            <SubmitButton
              className="btn btn-danger btn-sm"
              confirm={
                webinar
                  ? t.t("media.deleteConfirmWebinar", { webinar: webinar.title })
                  : t.t("media.deleteConfirm")
              }
              pendingLabel={t.t("common.saving")}
            >
              <Trash2 aria-hidden size={16} /> {t.t("media.delete")}
            </SubmitButton>
          </form>
        </aside>
      </div>
    </div>
  );
}

import { Film } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";

import { AddVideo } from "@/app/studio/videos/add-video";
import { AccessLabel, VideoStatusBadge, videoKind } from "@/app/studio/videos/video-labels";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { localize } from "@/core/i18n/locales";
import type { StudioText } from "@/core/i18n/studio/translator";
import { clockTime } from "@/core/media/captions";
import type { QuotaStatus } from "@/core/media/quota";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { listVideos, recordingsForLibrary } from "@/server/media/library";
import { mediaQuotaStatus } from "@/server/media/quota";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("media.title") };
}

/** The share of the academy's video storage in use; shown only when the operator set a quota. */
function StorageCard(props: { t: StudioText; quota: QuotaStatus }) {
  const { t, quota } = props;
  const percent = Math.min(quota.percentUsed ?? 0, 100);
  return (
    <section aria-labelledby="storage-heading" className="card-flat space-y-3 p-5">
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span id="storage-heading" className="font-semibold">
          {t.t("media.storage.heading")}
        </span>
        <span className="text-sm tabular-nums">{t.t("media.storage.used", { percent })}</span>
      </p>
      <Progress value={percent} label={t.t("media.storage.meter")} />
      {quota.level === "full" && <Notice tone="critical" title={t.t("media.storage.full")} />}
      {quota.level === "warning" && <Notice tone="warning" title={t.t("media.storage.warning")} />}
      <p className="text-sm text-muted">{t.t("media.storage.hint")}</p>
    </section>
  );
}

/**
 * The academy's videos (webinar brief §2.4): uploads, course recordings and
 * YouTube or Vimeo embeds, each with its status and how many learners
 * pressed play. Lessons pick from here.
 */
export default async function VideosPage({ searchParams }: PageProps<"/studio/videos">) {
  const { tenant } = await requireCapability("courses.edit", "/studio/videos");
  const t = await getStudioText();
  const { deleted } = await searchParams;
  const [videos, recordings, quota] = await Promise.all([
    listVideos(getDb(), tenant.id),
    recordingsForLibrary(getDb(), tenant.id),
    mediaQuotaStatus(getDb(), tenant.id),
  ]);
  const locale = tenant.settings.default_locale;
  const busy = videos.some((video) => video.status === "processing");

  return (
    <div className="space-y-8">
      <AutoRefresh active={busy} everyMs={5_000} />
      <PageHeader title={t.t("media.title")} description={t.t("media.description")} />
      {deleted === "1" && <Notice tone="good" title={t.t("media.deleted")} />}
      {quota.percentUsed !== null && <StorageCard t={t} quota={quota} />}

      <AddVideo
        locales={tenant.settings.locales}
        recordings={recordings.map((recording) => ({
          id: recording.id,
          title: recording.title,
          course: localize(recording.courseTitle, locale),
          pending: recording.status === "pending" || recording.status === "processing",
        }))}
      />

      <section aria-labelledby="library-heading" className="space-y-3">
        <h2 id="library-heading" className="text-lg font-semibold">
          {t.t("media.list.heading")}
        </h2>
        {videos.length === 0 ? (
          <EmptyState
            icon={Film}
            title={t.t("media.list.empty")}
            body={t.t("media.list.emptyBody")}
          />
        ) : (
          <div className="card-flat table-wrap">
            <table className="table">
              <caption className="sr-only">{t.t("media.list.caption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.t("media.column.video")}</th>
                  <th scope="col">{t.t("media.column.status")}</th>
                  <th scope="col" className="num">
                    {t.t("media.column.length")}
                  </th>
                  <th scope="col">{t.t("media.column.access")}</th>
                  <th scope="col" className="num">
                    {t.t("media.column.viewers")}
                  </th>
                  <th scope="col">{t.t("media.column.added")}</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((video) => (
                  <tr key={video.id}>
                    <td className="min-w-48">
                      <Link
                        href={`/studio/videos/${video.id}` as Route}
                        className="block font-semibold hover:underline"
                      >
                        {video.title}
                      </Link>
                      <span className="text-sm text-muted">{videoKind(t, video)}</span>
                    </td>
                    <td>
                      <VideoStatusBadge t={t} status={video.status} />
                    </td>
                    <td className="num">
                      {video.durationSec ? clockTime(video.durationSec) : "–"}
                    </td>
                    <td className="whitespace-nowrap">
                      <AccessLabel t={t} access={video.access} />
                    </td>
                    <td className="num">{t.number(video.viewers)}</td>
                    <td className="whitespace-nowrap text-sm text-muted">
                      {t.date(video.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

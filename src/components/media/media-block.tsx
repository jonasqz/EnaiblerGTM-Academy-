import { Clock, VideoOff } from "lucide-react";

import { ExternalVideo } from "@/components/media/external-video";
import { externalVideoLabels, videoPlayerLabels } from "@/components/media/player-labels";
import { VideoPlayer, type CaptionTrack } from "@/components/media/video-player";
import type { WatchResult } from "@/components/media/use-watch-reporting";
import { isLocale, SUPPORTED_LOCALES, type Locale } from "@/core/i18n/locales";
import type { Translator } from "@/core/i18n/translator";
import { canWatch, tracksViewer, type MediaViewer } from "@/core/media/access";
import { isExternalVideo } from "@/core/media/embeds";
import type { MediaAsset } from "@/server/media/library";

/** Caption languages go by their own names, as every player lists them. */
const AUTONYMS: Record<Locale, string> = { de: "Deutsch", en: "English" };

/** The video's caption tracks: its spoken language first, then translations. */
export function captionTracks(asset: MediaAsset, pageLocale: Locale): CaptionTrack[] {
  const locales = new Set<Locale>();
  if (asset.transcript?.length && isLocale(asset.locale)) locales.add(asset.locale);
  for (const locale of SUPPORTED_LOCALES) if (asset.captions[locale]?.length) locales.add(locale);
  // The page's language first: the transcript panel starts with it.
  return [...locales]
    .sort((a, b) => Number(b === pageLocale) - Number(a === pageLocale))
    .map((locale) => ({
      locale,
      label: AUTONYMS[locale],
      src: `/media/${asset.id}/captions/${locale}.vtt`,
    }));
}

/**
 * A video of the media library where learners meet it (lessons now, webinar
 * re-lives later): our own player for uploads, the two-click embed for
 * YouTube and Vimeo. The media route checks access again for every file.
 */
export function MediaBlock(props: {
  asset: MediaAsset | undefined;
  t: Translator;
  viewer: MediaViewer | null;
  progress?: (WatchResult & { positionSec: number | null }) | null;
  /** Report watching; off in the Studio's previews. */
  track?: boolean;
}) {
  const { asset, t } = props;
  if (!asset || !canWatch(asset.access, props.viewer) || asset.status === "failed") {
    return (
      <p className="flex items-center gap-2 rounded-card bg-subtle p-4 text-sm text-muted">
        <VideoOff aria-hidden size={18} /> {t.t("video.unavailable")}
      </p>
    );
  }
  if (asset.status !== "ready") {
    return (
      <p className="flex items-center gap-2 rounded-card bg-subtle p-4 text-sm text-muted">
        <Clock aria-hidden size={18} /> {t.t("video.preparing")}
      </p>
    );
  }
  const track = (props.track ?? true) && tracksViewer(props.viewer);
  const progress = props.progress
    ? { percent: props.progress.percent, watched: props.progress.watched }
    : null;
  // Checked again here: the id ends up in the address of a third-party frame.
  if (asset.kind === "external_embed" && isExternalVideo(asset.embed)) {
    return (
      <ExternalVideo
        assetId={asset.id}
        title={asset.title}
        embed={asset.embed}
        track={track}
        progress={progress}
        labels={externalVideoLabels(t, asset.title)}
      />
    );
  }
  if (!asset.hlsRun) return null;
  const base = `/media/${asset.id}/${asset.hlsRun}`;
  return (
    <VideoPlayer
      assetId={asset.id}
      title={asset.title}
      src={`${base}/master.m3u8`}
      poster={`${base}/poster.jpg`}
      chapters={asset.chapters}
      captions={captionTracks(asset, t.locale)}
      track={track}
      resumeAt={props.progress?.positionSec ?? null}
      progress={progress}
      labels={videoPlayerLabels(t, asset.title)}
    />
  );
}

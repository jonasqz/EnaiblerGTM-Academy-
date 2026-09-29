import type { ExternalVideoLabels } from "@/components/media/external-video";
import type { VideoPlayerLabels } from "@/components/media/video-player";
import type { Translator } from "@/core/i18n/translator";

/*
 * Learner-facing words of the players in the page's language. Placeholders
 * the translator is not given ({time}, {n}, {percent}, {provider}, {query})
 * stay in: the players fill them in as the video plays.
 */

export function videoPlayerLabels(t: Translator, title: string): VideoPlayerLabels {
  return {
    label: t.t("video.label", { title }),
    speed: t.t("video.speed"),
    captions: t.t("video.captions"),
    captionsOff: t.t("video.captionsOff"),
    quality: t.t("video.quality"),
    qualityAuto: t.t("video.qualityAuto"),
    chapters: t.t("video.chapters"),
    chapterN: t.t("video.chapterN"),
    transcript: t.t("video.transcript"),
    transcriptPanel: {
      search: t.t("video.search"),
      matches: t.t("video.matches"),
      noMatches: t.t("video.noMatches"),
      loading: t.t("video.transcriptLoading"),
      missing: t.t("video.transcriptMissing"),
      jumpTo: t.t("video.jumpTo"),
    },
    resume: t.t("video.resume"),
    progress: t.t("video.progress"),
    watched: t.t("video.watched"),
    error: t.t("video.error"),
    retry: t.t("video.retry"),
  };
}

export function externalVideoLabels(t: Translator, title: string): ExternalVideoLabels {
  return {
    label: t.t("video.label", { title }),
    notice: t.t("video.embed.notice"),
    load: t.t("video.embed.load"),
    privacy: t.t("video.embed.privacy"),
    progress: t.t("video.progress"),
    watched: t.t("video.watched"),
  };
}

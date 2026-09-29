"use client";

import type HlsType from "hls.js";
import {
  Captions,
  CircleCheck,
  Gauge,
  ListVideo,
  RotateCcw,
  ScrollText,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { TranscriptPanel, type TranscriptLabels } from "@/components/media/transcript-panel";
import { useWatchReporting, type WatchResult } from "@/components/media/use-watch-reporting";
import { clockTime } from "@/core/media/captions";
import { chapterAt, type Chapter } from "@/core/media/chapters";

/** Learner-facing words in the page's language (see ./player-labels). */
export interface VideoPlayerLabels {
  /** With {title}. */
  label: string;
  speed: string;
  captions: string;
  captionsOff: string;
  quality: string;
  qualityAuto: string;
  chapters: string;
  /** With {n}. */
  chapterN: string;
  transcript: string;
  transcriptPanel: TranscriptLabels;
  /** With {time}. */
  resume: string;
  /** With {percent}. */
  progress: string;
  watched: string;
  error: string;
  retry: string;
}

export interface CaptionTrack {
  locale: string;
  /** The language's own name ("Deutsch"). */
  label: string;
  src: string;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

type Panel = "chapters" | "transcript" | null;

/**
 * The re-live player (webinar brief §2.4): our own HLS renditions through
 * hls.js (loaded only with the player), or the browser's own HLS where it
 * has no Media Source Extensions (older iPhones). The browser's controls do
 * play, seek, volume and fullscreen with the keyboard; around them come speed,
 * captions, quality, chapters and the transcript. Signed-in viewers' watching
 * is reported as played ranges.
 */
export function VideoPlayer(props: {
  assetId: string;
  title: string;
  src: string;
  poster: string | null;
  chapters: readonly Chapter[];
  captions: readonly CaptionTrack[];
  /** Report watching: only for signed-in members of the academy. */
  track: boolean;
  /** Where this viewer stopped last time, offered as "continue at". */
  resumeAt: number | null;
  progress: WatchResult | null;
  labels: VideoPlayerLabels;
}) {
  const { labels } = props;
  const video = useRef<HTMLVideoElement>(null);
  const hls = useRef<HlsType | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [time, setTime] = useState(0);
  const [played, setPlayed] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [captionLocale, setCaptionLocale] = useState("");
  const [levels, setLevels] = useState<Array<{ index: number; height: number }>>([]);
  const [level, setLevel] = useState(-1);
  const [panel, setPanel] = useState<Panel>(null);
  const [progress, setProgress] = useState<WatchResult | null>(props.progress);
  const uid = useId();
  const watch = useWatchReporting({
    assetId: props.assetId,
    enabled: props.track,
    onRecorded: setProgress,
  });

  // hls.js where the browser has Media Source Extensions, the browser's own HLS otherwise.
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let cancelled = false;
    let instance: HlsType | null = null;
    void import("hls.js/light").then(({ default: Hls }) => {
      if (cancelled) return;
      if (Hls.isSupported()) {
        instance = new Hls({ capLevelToPlayerSize: true });
        let recovered = false;
        instance.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          setLevels(
            data.levels
              .map((entry, index) => ({ index, height: entry.height }))
              .sort((a, b) => b.height - a.height),
          );
        });
        instance.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || !instance) return;
          // One recovery attempt, as hls.js recommends; then the viewer decides.
          if (!recovered && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            recovered = true;
            instance.recoverMediaError();
          } else if (!recovered && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            recovered = true;
            instance.startLoad();
          } else {
            setFailed(true);
          }
        });
        instance.loadSource(props.src);
        instance.attachMedia(element);
        hls.current = instance;
      } else if (element.canPlayType("application/vnd.apple.mpegurl")) {
        element.src = props.src;
      } else {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
      instance?.destroy();
      hls.current = null;
    };
  }, [props.src, attempt]);

  // Playback and tracking: ranges grow while playing, a seek starts a new one.
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const onTime = () => {
      setTime(element.currentTime);
      watch.at(element.currentTime);
      if (!element.paused && !element.seeking)
        watch.tracker.tick(element.currentTime, element.playbackRate);
    };
    const onSeeking = () => watch.tracker.jump(null);
    const onSeeked = () => watch.tracker.jump(element.currentTime);
    const onPlaying = () => {
      setPlayed(true);
      watch.started();
    };
    const onPause = () => watch.flush();
    const onError = () => {
      if (!hls.current) setFailed(true);
    };
    const onRate = () => setSpeed(element.playbackRate);
    // The browser's own captions menu and ours stay in step.
    const onTracks = () => {
      const showing = Array.from(element.textTracks).find((track) => track.mode === "showing");
      setCaptionLocale(showing?.language ?? "");
    };
    element.addEventListener("timeupdate", onTime);
    element.addEventListener("seeking", onSeeking);
    element.addEventListener("seeked", onSeeked);
    element.addEventListener("playing", onPlaying);
    element.addEventListener("pause", onPause);
    element.addEventListener("ended", onPause);
    element.addEventListener("error", onError);
    element.addEventListener("ratechange", onRate);
    element.textTracks.addEventListener("change", onTracks);
    return () => {
      element.removeEventListener("timeupdate", onTime);
      element.removeEventListener("seeking", onSeeking);
      element.removeEventListener("seeked", onSeeked);
      element.removeEventListener("playing", onPlaying);
      element.removeEventListener("pause", onPause);
      element.removeEventListener("ended", onPause);
      element.removeEventListener("error", onError);
      element.removeEventListener("ratechange", onRate);
      element.textTracks.removeEventListener("change", onTracks);
    };
  }, [watch]);

  const seek = useCallback((seconds: number) => {
    const element = video.current;
    if (!element) return;
    element.currentTime = seconds;
    void element.play().catch(() => undefined);
  }, []);

  const chooseCaptions = (locale: string) => {
    const element = video.current;
    if (!element) return;
    for (const track of Array.from(element.textTracks)) {
      track.mode = track.language === locale ? "showing" : "disabled";
    }
    setCaptionLocale(locale);
  };

  const chapterIndex = chapterAt(props.chapters, time);
  const chapterTitle = (index: number) =>
    props.chapters[index]?.title || labels.chapterN.replace("{n}", String(index + 1));
  const transcriptTrack =
    props.captions.find((track) => track.locale === captionLocale) ?? props.captions[0] ?? null;
  const canResume =
    !played && props.resumeAt !== null && props.resumeAt > 10 && !(progress?.percent === 100);

  return (
    <figure
      aria-label={labels.label.replace("{title}", props.title)}
      className="overflow-hidden rounded-card border-outline border-line bg-card"
    >
      <div className="relative bg-black">
        {/* Captions come as tracks below; the browser shows them. */}
        <video
          ref={video}
          className="block aspect-video w-full"
          controls
          playsInline
          preload="metadata"
          poster={props.poster ?? undefined}
        >
          {props.captions.map((track) => (
            <track
              key={track.locale}
              kind="captions"
              src={track.src}
              srcLang={track.locale}
              label={track.label}
            />
          ))}
        </video>
        {failed && (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center text-sm text-white"
          >
            <p>{labels.error}</p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setFailed(false);
                setAttempt((value) => value + 1);
              }}
            >
              <RotateCcw aria-hidden size={16} /> {labels.retry}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3 pt-2 text-sm">
        <p className="min-w-0 flex-1 truncate font-semibold">
          {chapterIndex >= 0 ? chapterTitle(chapterIndex) : props.title}
        </p>
        {canResume && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => seek(props.resumeAt!)}
          >
            {labels.resume.replace("{time}", clockTime(props.resumeAt!))}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3 pt-1 pb-2 text-sm">
        <Control icon={<Gauge aria-hidden size={16} />} label={labels.speed}>
          <select
            className="select min-h-9 w-auto py-1 text-sm"
            value={speed}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (video.current) video.current.playbackRate = value;
              setSpeed(value);
            }}
          >
            {SPEEDS.map((value) => (
              <option key={value} value={value}>
                {`${value}×`}
              </option>
            ))}
          </select>
        </Control>
        {props.captions.length > 0 && (
          <Control icon={<Captions aria-hidden size={16} />} label={labels.captions}>
            <select
              className="select min-h-9 w-auto py-1 text-sm"
              value={captionLocale}
              onChange={(event) => chooseCaptions(event.target.value)}
            >
              <option value="">{labels.captionsOff}</option>
              {props.captions.map((track) => (
                <option key={track.locale} value={track.locale}>
                  {track.label}
                </option>
              ))}
            </select>
          </Control>
        )}
        {levels.length > 1 && (
          <Control icon={<SlidersHorizontal aria-hidden size={16} />} label={labels.quality}>
            <select
              className="select min-h-9 w-auto py-1 text-sm"
              value={level}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (hls.current) hls.current.currentLevel = value;
                setLevel(value);
              }}
            >
              <option value={-1}>{labels.qualityAuto}</option>
              {levels.map((entry) => (
                <option key={entry.index} value={entry.index}>
                  {`${entry.height}p`}
                </option>
              ))}
            </select>
          </Control>
        )}
        {/* Pushed to the end of the row where there is room. */}
        <span aria-hidden className="hidden flex-1 sm:block" />
        {props.chapters.length > 0 && (
          <PanelToggle
            icon={<ListVideo aria-hidden size={16} />}
            label={labels.chapters}
            open={panel === "chapters"}
            controls={`${uid}-chapters`}
            onToggle={() => setPanel(panel === "chapters" ? null : "chapters")}
          />
        )}
        {props.captions.length > 0 && (
          <PanelToggle
            icon={<ScrollText aria-hidden size={16} />}
            label={labels.transcript}
            open={panel === "transcript"}
            controls={`${uid}-transcript`}
            onToggle={() => setPanel(panel === "transcript" ? null : "transcript")}
          />
        )}
      </div>

      {panel === "chapters" && (
        <ol
          id={`${uid}-chapters`}
          className="max-h-80 space-y-0.5 overflow-y-auto border-t border-line p-3"
        >
          {props.chapters.map((chapter, index) => (
            <li key={chapter.startSec}>
              <button
                type="button"
                onClick={() => seek(chapter.startSec)}
                aria-current={index === chapterIndex ? "true" : undefined}
                className={`flex w-full gap-3 rounded-control px-2 py-2 text-left text-sm ${
                  index === chapterIndex ? "bg-primary-soft font-semibold" : "hover:bg-subtle"
                }`}
              >
                <span className="w-12 shrink-0 text-muted tabular-nums">
                  {clockTime(chapter.startSec)}
                </span>
                <span className="min-w-0">{chapterTitle(index)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {panel === "transcript" && (
        <div className="border-t border-line">
          <TranscriptPanel
            id={`${uid}-transcript`}
            src={transcriptTrack?.src ?? null}
            time={time}
            labels={labels.transcriptPanel}
            onSeek={seek}
          />
        </div>
      )}

      {props.track && progress && progress.percent > 0 && (
        <figcaption className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2 text-sm text-muted">
          {progress.watched && (
            <span className="badge" data-tone="good">
              <CircleCheck aria-hidden size={14} /> {labels.watched}
            </span>
          )}
          {labels.progress.replace("{percent}", String(progress.percent))}
        </figcaption>
      )}
    </figure>
  );
}

function Control(props: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <label className="inline-flex items-center gap-1.5" title={props.label}>
      <span className="text-muted">{props.icon}</span>
      <span className="sr-only">{props.label}</span>
      {props.children}
    </label>
  );
}

function PanelToggle(props: {
  icon: ReactNode;
  label: string;
  open: boolean;
  controls: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`btn btn-sm ${props.open ? "btn-secondary bg-primary-soft" : "btn-ghost"}`}
      aria-expanded={props.open}
      aria-controls={props.controls}
      onClick={props.onToggle}
    >
      {props.icon} {props.label}
    </button>
  );
}

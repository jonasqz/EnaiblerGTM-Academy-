"use client";

import { CircleCheck, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useWatchReporting, type WatchResult } from "@/components/media/use-watch-reporting";
import {
  embedUrl,
  playerSubscriptions,
  PROVIDER_NAMES,
  PROVIDER_PRIVACY,
  providerOrigin,
  readPlayerMessage,
  type ExternalVideo as Embed,
} from "@/core/media/embeds";

export interface ExternalVideoLabels {
  /** With {title}. */
  label: string;
  /** With {provider}. */
  notice: string;
  /** With {provider}. */
  load: string;
  /** With {provider}. */
  privacy: string;
  /** With {percent}. */
  progress: string;
  watched: string;
}

/**
 * A video the academy hosts on YouTube or Vimeo, as a two-click embed
 * (webinar brief §5): until the viewer clicks, the page loads nothing from
 * the provider, not even a thumbnail. After the click the provider's player
 * runs in privacy-enhanced mode and reports its position by postMessage,
 * which feeds the same watch tracking as our own player.
 */
export function ExternalVideo(props: {
  assetId: string;
  title: string;
  embed: Embed;
  track: boolean;
  progress: WatchResult | null;
  labels: ExternalVideoLabels;
}) {
  const { embed, labels } = props;
  const provider = PROVIDER_NAMES[embed.provider];
  const [loaded, setLoaded] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [progress, setProgress] = useState<WatchResult | null>(props.progress);
  const frame = useRef<HTMLIFrameElement>(null);
  const watch = useWatchReporting({
    assetId: props.assetId,
    enabled: props.track,
    onRecorded: setProgress,
  });

  // The player's messages: position, length, playing or not.
  useEffect(() => {
    if (!loaded) return;
    const origin = providerOrigin(embed.provider);
    const player = { playing: false, rate: 1, time: 0 };
    const subscribe = () => {
      for (const message of playerSubscriptions(embed.provider)) {
        frame.current?.contentWindow?.postMessage(message, origin);
      }
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow) return;
      const state = readPlayerMessage(embed.provider, event.data);
      if (!state) return;
      if (state.ready) subscribe();
      if (state.rate) player.rate = state.rate;
      if (state.jumped) watch.tracker.jump(state.time ?? null);
      if (state.playing !== undefined) {
        if (state.playing && !player.playing) watch.started();
        if (!state.playing && player.playing) {
          watch.tracker.jump(null);
          watch.flush();
        }
        player.playing = state.playing;
      }
      if (state.time !== undefined) {
        player.time = state.time;
        watch.at(state.time, state.duration);
        // A jump the player did not call a seek is too long a step: the tracker skips it.
        if (player.playing) watch.tracker.tick(state.time, player.rate);
      } else if (state.duration) {
        watch.at(player.time, state.duration);
      }
    };
    window.addEventListener("message", onMessage);
    const node = frame.current;
    node?.addEventListener("load", subscribe);
    // YouTube answers only once asked: ask again until it listens.
    const retry = window.setInterval(subscribe, 1_000);
    const stop = window.setTimeout(() => window.clearInterval(retry), 10_000);
    return () => {
      window.removeEventListener("message", onMessage);
      node?.removeEventListener("load", subscribe);
      window.clearInterval(retry);
      window.clearTimeout(stop);
    };
  }, [loaded, embed.provider, watch]);

  return (
    <figure
      aria-label={labels.label.replace("{title}", props.title)}
      className="overflow-hidden rounded-card border-outline border-line bg-card"
    >
      {loaded && src ? (
        <iframe
          ref={frame}
          src={src}
          title={props.title}
          className="block aspect-video w-full"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 bg-subtle p-5 text-center sm:p-8">
          <p className="max-w-lg text-sm text-muted">
            {labels.notice.replaceAll("{provider}", provider)}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setSrc(embedUrl(embed, window.location.origin));
              setLoaded(true);
            }}
          >
            <Play aria-hidden size={18} /> {labels.load.replace("{provider}", provider)}
          </button>
          <a
            href={PROVIDER_PRIVACY[embed.provider]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted underline underline-offset-2"
          >
            {labels.privacy.replace("{provider}", provider)}
          </a>
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

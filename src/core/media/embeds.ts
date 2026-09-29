/**
 * Videos an academy already hosts on YouTube or Vimeo (webinar brief §2.4).
 * They are embedded in privacy-enhanced mode only (youtube-nocookie.com,
 * Vimeo with dnt=1) and only after the viewer asked for them (two-click
 * embed, brief §5): until then the page requests nothing from the provider,
 * not even a thumbnail.
 */
export const EMBED_PROVIDERS = ["youtube", "vimeo"] as const;
export type EmbedProvider = (typeof EMBED_PROVIDERS)[number];

export interface ExternalVideo {
  provider: EmbedProvider;
  /** YouTube's 11-character id, or Vimeo's number. */
  id: string;
  /** Vimeo's hash of an unlisted video: without it the player refuses. */
  hash?: string;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{5,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,20}$/i;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

function youtube(url: URL): ExternalVideo | null {
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  let id: string | null | undefined;
  if (host === "youtu.be") id = parts[0];
  else if (YOUTUBE_HOSTS.has(host)) {
    if (parts[0] === "watch") id = url.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "")) id = parts[1];
  } else return null;
  return id && YOUTUBE_ID.test(id) ? { provider: "youtube", id } : null;
}

function vimeo(url: URL): ExternalVideo | null {
  const host = url.hostname.toLowerCase();
  if (!VIMEO_HOSTS.has(host)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  let id: string | undefined;
  let hash: string | null | undefined = url.searchParams.get("h");
  if (host === "player.vimeo.com") {
    if (parts[0] === "video") id = parts[1];
  } else {
    // vimeo.com/<id>[/<hash>], …/channels/<name>/<id>, …/groups/<name>/videos/<id>, …/showcase/<n>/video/<id>
    const index = parts.findIndex((part) => VIMEO_ID.test(part));
    if (index >= 0) {
      id = parts[index];
      hash ??= parts[index + 1];
    }
  }
  if (!id || !VIMEO_ID.test(id)) return null;
  return hash && VIMEO_HASH.test(hash)
    ? { provider: "vimeo", id, hash }
    : { provider: "vimeo", id };
}

/** A YouTube or Vimeo link as the provider and video id; null for anything else. */
export function parseVideoUrl(input: string): ExternalVideo | null {
  let url: URL;
  try {
    const trimmed = input.trim();
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return youtube(url) ?? vimeo(url);
}

export function isExternalVideo(value: unknown): value is ExternalVideo {
  if (!value || typeof value !== "object") return false;
  const video = value as Partial<ExternalVideo>;
  if (video.provider === "youtube") return YOUTUBE_ID.test(video.id ?? "");
  if (video.provider === "vimeo") {
    return (
      VIMEO_ID.test(video.id ?? "") && (video.hash === undefined || VIMEO_HASH.test(video.hash))
    );
  }
  return false;
}

/**
 * The provider's player in privacy-enhanced mode, loaded after the viewer's
 * click: it starts playing right away, and reports its position to the page
 * (YouTube's JS API, Vimeo's postMessage API) for watch tracking.
 */
export function embedUrl(video: ExternalVideo, pageOrigin: string): string {
  if (video.provider === "youtube") {
    const params = new URLSearchParams({
      autoplay: "1",
      enablejsapi: "1",
      origin: pageOrigin,
      playsinline: "1",
      rel: "0",
    });
    return `https://www.youtube-nocookie.com/embed/${video.id}?${params.toString()}`;
  }
  const params = new URLSearchParams({ autoplay: "1", dnt: "1", playsinline: "1" });
  if (video.hash) params.set("h", video.hash);
  return `https://player.vimeo.com/video/${video.id}?${params.toString()}`;
}

/** The video's own page, for the Studio. */
export function watchUrl(video: ExternalVideo): string {
  return video.provider === "youtube"
    ? `https://www.youtube.com/watch?v=${video.id}`
    : `https://vimeo.com/${video.id}${video.hash ? `/${video.hash}` : ""}`;
}

/** Where the provider's player posts its messages from. */
export function providerOrigin(provider: EmbedProvider): string {
  return provider === "youtube" ? "https://www.youtube-nocookie.com" : "https://player.vimeo.com";
}

export const PROVIDER_NAMES: Record<EmbedProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
};

import { describe, expect, it } from "vitest";

import {
  embedUrl,
  isExternalVideo,
  parseVideoUrl,
  playerSubscriptions,
  providerOrigin,
  readPlayerMessage,
  watchUrl,
} from "@/core/media/embeds";

describe("external videos", () => {
  it("reads every common YouTube link", () => {
    const video = { provider: "youtube", id: "dQw4w9WgXcQ" };
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "youtu.be/dQw4w9WgXcQ?si=abc",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ?feature=share",
    ]) {
      expect(parseVideoUrl(url), url).toEqual(video);
    }
  });

  it("reads Vimeo links, keeping the hash of unlisted videos", () => {
    expect(parseVideoUrl("https://vimeo.com/76979871")).toEqual({
      provider: "vimeo",
      id: "76979871",
    });
    expect(parseVideoUrl("https://vimeo.com/76979871/8272103f6e")).toEqual({
      provider: "vimeo",
      id: "76979871",
      hash: "8272103f6e",
    });
    expect(parseVideoUrl("https://player.vimeo.com/video/76979871?h=8272103f6e&badge=0")).toEqual({
      provider: "vimeo",
      id: "76979871",
      hash: "8272103f6e",
    });
    expect(parseVideoUrl("https://vimeo.com/channels/staffpicks/76979871")).toMatchObject({
      id: "76979871",
    });
    expect(parseVideoUrl("https://vimeo.com/groups/motion/videos/76979871")).toMatchObject({
      id: "76979871",
    });
  });

  it("refuses anything that is not a video on either site", () => {
    for (const url of [
      "",
      "not a url",
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/@channel",
      "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
      "https://vimeo.com/about",
      "https://example.com/video.mp4",
      "javascript:alert(1)",
      "ftp://youtu.be/dQw4w9WgXcQ",
    ]) {
      expect(parseVideoUrl(url), url).toBeNull();
    }
  });

  it("embeds in privacy-enhanced mode only", () => {
    const youtube = new URL(
      embedUrl({ provider: "youtube", id: "dQw4w9WgXcQ" }, "https://academy.example.com"),
    );
    expect(youtube.origin).toBe("https://www.youtube-nocookie.com");
    expect(youtube.pathname).toBe("/embed/dQw4w9WgXcQ");
    expect(youtube.searchParams.get("enablejsapi")).toBe("1");
    expect(youtube.searchParams.get("origin")).toBe("https://academy.example.com");

    const vimeo = new URL(
      embedUrl({ provider: "vimeo", id: "76979871", hash: "8272103f6e" }, "https://a.example"),
    );
    expect(vimeo.origin).toBe(providerOrigin("vimeo"));
    expect(vimeo.searchParams.get("dnt")).toBe("1");
    expect(vimeo.searchParams.get("h")).toBe("8272103f6e");
  });

  it("links the video's own page and checks stored values", () => {
    expect(watchUrl({ provider: "youtube", id: "dQw4w9WgXcQ" })).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(watchUrl({ provider: "vimeo", id: "76979871", hash: "8272103f6e" })).toBe(
      "https://vimeo.com/76979871/8272103f6e",
    );
    expect(isExternalVideo({ provider: "youtube", id: "dQw4w9WgXcQ" })).toBe(true);
    expect(isExternalVideo({ provider: "youtube", id: "x" })).toBe(false);
    expect(isExternalVideo({ provider: "vimeo", id: "76979871", hash: "../x" })).toBe(false);
    expect(isExternalVideo(null)).toBe(false);
  });
});

describe("provider player messages", () => {
  it("subscribes without loading a provider script", () => {
    expect(playerSubscriptions("youtube").map((message) => JSON.parse(message).event)).toEqual([
      "listening",
      "command",
    ]);
    expect(playerSubscriptions("vimeo").map((message) => JSON.parse(message).value)).toContain(
      "timeupdate",
    );
  });

  it("reads YouTube's position, length, state and speed", () => {
    expect(
      readPlayerMessage(
        "youtube",
        JSON.stringify({
          event: "infoDelivery",
          info: { currentTime: 12.5, duration: 300, playerState: 1, playbackRate: 1.5 },
        }),
      ),
    ).toEqual({ time: 12.5, duration: 300, playing: true, rate: 1.5 });
    // Partial updates carry only what changed.
    expect(
      readPlayerMessage(
        "youtube",
        JSON.stringify({ event: "infoDelivery", info: { playerState: 2 } }),
      ),
    ).toEqual({ playing: false });
    expect(readPlayerMessage("youtube", { event: "onStateChange", info: 1 })).toEqual({
      playing: true,
    });
    expect(
      readPlayerMessage("youtube", JSON.stringify({ event: "infoDelivery", info: { volume: 50 } })),
    ).toBeNull();
    expect(readPlayerMessage("youtube", "not json")).toBeNull();
  });

  it("reads Vimeo's events", () => {
    expect(readPlayerMessage("vimeo", '{"event":"ready","player_id":"x"}')).toEqual({
      ready: true,
    });
    expect(
      readPlayerMessage("vimeo", {
        event: "timeupdate",
        data: { seconds: 61.2, percent: 0.2, duration: 306 },
      }),
    ).toEqual({ time: 61.2, duration: 306 });
    expect(readPlayerMessage("vimeo", { event: "seeked", data: { seconds: 5 } })).toMatchObject({
      jumped: true,
      time: 5,
    });
    expect(readPlayerMessage("vimeo", { event: "pause", data: { seconds: 70 } })).toMatchObject({
      playing: false,
    });
    expect(
      readPlayerMessage("vimeo", { event: "playbackratechange", data: { playbackRate: 2 } }),
    ).toEqual({ rate: 2 });
    expect(readPlayerMessage("vimeo", { event: "volumechange", data: {} })).toBeNull();
  });
});

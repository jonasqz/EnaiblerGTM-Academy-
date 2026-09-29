import { describe, expect, it } from "vitest";

import {
  embedUrl,
  isExternalVideo,
  parseVideoUrl,
  providerOrigin,
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

import { describe, expect, it } from "vitest";

import {
  hlsContentType,
  isHlsPath,
  parseProbe,
  posterTime,
  renditionLadder,
  transcodeArgs,
} from "@/core/media/transcode";

const LANDSCAPE = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'sample.mp4':
  Metadata:
    major_brand     : isom
  Duration: 00:01:03.50, start: 0.000000, bitrate: 3120 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1280x720 [SAR 1:1 DAR 16:9], 3037 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
      Metadata:
        handler_name    : VideoHandler
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, mono, fltp, 69 kb/s (default)
At least one output file must be specified`;

const ROTATED = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'phone.mov':
  Metadata:
    major_brand     : qt
  Duration: 00:00:02.00, start: 0.000000, bitrate: 743 kb/s
  Stream #0:0[0x1]: Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 737 kb/s, 25 fps, 25 tbr, 12800 tbn (default)
      Side data:
        displaymatrix: rotation of -90.00 degrees
At least one output file must be specified`;

const AUDIO_WITH_COVER = `Input #0, mp3, from 'talk.mp3':
  Duration: 00:10:00.00, start: 0.025057, bitrate: 128 kb/s
  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 128 kb/s
  Stream #0:1: Video: mjpeg (Baseline), yuvj420p(pc, bt470bg/unknown/unknown), 600x600 [SAR 1:1 DAR 1:1], 90k tbr, 90k tbn (attached pic)`;

describe("probing uploads", () => {
  it("reads length, size and sound from ffmpeg's description", () => {
    expect(parseProbe(LANDSCAPE)).toEqual({
      durationSec: 63.5,
      width: 1280,
      height: 720,
      hasAudio: true,
    });
  });

  it("measures phone recordings upright", () => {
    expect(parseProbe(ROTATED)).toMatchObject({ width: 1080, height: 1920, hasAudio: false });
  });

  it("does not take cover art or garbage for a video", () => {
    expect(parseProbe(AUDIO_WITH_COVER)).toBeNull();
    expect(parseProbe("moov atom not found")).toBeNull();
  });
});

describe("renditions", () => {
  it("offers every rung up to the source, never above it", () => {
    expect(renditionLadder(1920, 1080).map((r) => r.name)).toEqual(["360p", "720p", "1080p"]);
    expect(renditionLadder(1280, 720).map((r) => r.name)).toEqual(["360p", "720p"]);
    expect(renditionLadder(3840, 2160).map((r) => r.name)).toEqual(["360p", "720p", "1080p"]);
    expect(renditionLadder(1280, 720)[0]).toMatchObject({ width: 640, height: 360 });
  });

  it("keeps small and portrait sources in their own shape", () => {
    expect(renditionLadder(426, 240)).toEqual([
      { name: "240p", width: 426, height: 240, videoKbps: 800, audioKbps: 96 },
    ]);
    const portrait = renditionLadder(1080, 1920);
    expect(portrait.map((r) => [r.width, r.height])).toEqual([
      [360, 640],
      [720, 1280],
      [1080, 1920],
    ]);
    // Odd sizes become even: the encoder needs them.
    expect(renditionLadder(1000, 563)[0]).toMatchObject({ width: 640, height: 360 });
  });

  it("encodes all renditions in one run with aligned six-second segments", () => {
    const args = transcodeArgs({
      source: "/tmp/in.mov",
      outputDir: "/tmp/out",
      renditions: renditionLadder(1280, 720),
      hasAudio: true,
    });
    const line = args.join(" ");
    expect(line).toContain("[0:v]split=2[v0][v1]");
    expect(line).toContain("[v1]scale=1280:720:flags=bicubic,format=yuv420p[v1out]");
    expect(line).toContain("-b:v:1 2800k");
    expect(line).toContain("-force_key_frames expr:gte(t,n_forced*6)");
    expect(line).toContain("-hls_time 6");
    expect(line).toContain("-hls_segment_type fmp4");
    expect(line).toContain("/tmp/out/%v/seg-%05d.m4s");
    expect(args[args.indexOf("-var_stream_map") + 1]).toBe("v:0,a:0,name:360p v:1,a:1,name:720p");
    expect(args.at(-1)).toBe("/tmp/out/%v/index.m3u8");

    const silent = transcodeArgs({
      source: "/tmp/in.mp4",
      outputDir: "/tmp/out",
      renditions: renditionLadder(640, 360),
      hasAudio: false,
    });
    expect(silent).not.toContain("0:a:0");
    expect(silent[silent.indexOf("-var_stream_map") + 1]).toBe("v:0,name:360p");
  });

  it("takes the poster a tenth in, at most half a minute", () => {
    expect(posterTime(60)).toBe(6);
    expect(posterTime(3600)).toBe(30);
    expect(posterTime(0)).toBe(0);
  });
});

describe("serving", () => {
  it("serves only the files a transcode writes", () => {
    for (const path of [
      "master.m3u8",
      "poster.jpg",
      "720p/index.m3u8",
      "720p/init_1.mp4",
      "360p/init.mp4",
      "1080p/seg-00012.m4s",
    ]) {
      expect(isHlsPath(path), path).toBe(true);
    }
    for (const path of ["../master.m3u8", "720p/../../x", "720p/seg-1.m4s", "x.mp4", ""]) {
      expect(isHlsPath(path), path).toBe(false);
    }
    expect(hlsContentType("720p/index.m3u8")).toBe("application/vnd.apple.mpegurl");
    expect(hlsContentType("720p/seg-00001.m4s")).toBe("video/iso.segment");
    expect(hlsContentType("720p/init_1.mp4")).toBe("video/mp4");
    expect(hlsContentType("poster.jpg")).toBe("image/jpeg");
  });
});

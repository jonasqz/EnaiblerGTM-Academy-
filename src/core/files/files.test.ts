import { describe, expect, it } from "vitest";

import { canReadFile, inlineAllowed, safeFileName, uploadIssue } from "@/core/files/policy";
import { refineTextType, sniffFileType } from "@/core/files/sniff";
import { svgIssue } from "@/core/files/svg";

const bytes = (...values: Array<number | string>) =>
  new Uint8Array(
    values.flatMap((value) =>
      typeof value === "string" ? [...value].map((char) => char.charCodeAt(0)) : [value],
    ),
  );

describe("file type sniffing", () => {
  it("recognises files by content, not by name", () => {
    expect(sniffFileType(bytes("%PDF-1.7\n"))?.mime).toBe("application/pdf");
    expect(sniffFileType(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe("image/png");
    expect(sniffFileType(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe("image/jpeg");
    expect(sniffFileType(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))?.mime).toBe("image/webp");
    expect(sniffFileType(bytes(0, 0, 0, 0x20, "ftypisom", 0, 0))?.mime).toBe("video/mp4");
    expect(sniffFileType(bytes(0, 0, 0, 0x20, "ftypM4A ", 0, 0))?.family).toBe("audio");
    expect(sniffFileType(bytes(0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84, "webm"))?.mime).toBe(
      "video/webm",
    );
    expect(sniffFileType(bytes("wOF2", 0, 1))?.mime).toBe("font/woff2");
    expect(sniffFileType(bytes('<?xml version="1.0"?>\n<svg xmlns="x">'))?.family).toBe("svg");
    expect(
      sniffFileType(new TextEncoder().encode("# My brief\n\nÄrger über Umlaute"))?.family,
    ).toBe("text");
  });

  it("refuses what it cannot identify, including HEIC photos and binary noise", () => {
    expect(sniffFileType(bytes(0, 0, 0, 0x18, "ftypheic", 0, 0))).toBeNull();
    expect(sniffFileType(bytes(0x4d, 0x5a, 0x90, 0x00, 0x03))).toBeNull();
    expect(sniffFileType(new Uint8Array())).toBeNull();
  });

  it("labels Markdown by its name once the content is plain text", () => {
    const text = sniffFileType(bytes("hello"))!;
    expect(refineTextType(text, "brief.md").mime).toBe("text/markdown");
    expect(refineTextType(text, "brief.txt").mime).toBe("text/plain");
  });

  it("tolerates a multi-byte character cut off by the sniff window", () => {
    const umlaut = new TextEncoder().encode("Größe");
    expect(sniffFileType(umlaut.subarray(0, 3))?.family).toBe("text");
  });
});

describe("upload rules", () => {
  const pdf = { mime: "application/pdf", ext: "pdf", family: "pdf" as const };
  const video = { mime: "video/mp4", ext: "mp4", family: "video" as const };

  it("checks type and size per purpose", () => {
    expect(uploadIssue("submission", pdf, 1_000)).toBeNull();
    expect(uploadIssue("submission", video, 1_000)).toBe("type_not_allowed");
    expect(uploadIssue("submission", pdf, 60 * 1024 * 1024)).toBe("too_large");
    // An assignment can allow less than the purpose's maximum.
    expect(uploadIssue("submission", pdf, 6 * 1024 * 1024, 5 * 1024 * 1024)).toBe("too_large");
    expect(uploadIssue("source", video, 1_000)).toBeNull();
    expect(uploadIssue("brand_logo", null, 10)).toBe("unknown_type");
  });

  it("makes download names safe", () => {
    expect(safeFileName("../../etc/passwd", "txt")).toBe("etcpasswd.txt");
    expect(safeFileName('Mein "Brief" (final).PDF', "pdf")).toBe("Mein Brief final.pdf");
    expect(safeFileName("", "png")).toBe("file.png");
  });

  it("only shows media inline", () => {
    expect(inlineAllowed("image")).toBe(true);
    expect(inlineAllowed("svg")).toBe(false);
    expect(inlineAllowed("pdf")).toBe(false);
  });
});

describe("SVG uploads", () => {
  it("accepts plain drawings with internal references and embedded images", () => {
    expect(
      svgIssue(
        '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/><image href="data:image/png;base64,iVBORw0KGgo="/></svg>',
      ),
    ).toBeNull();
  });

  it("refuses scripts, handlers, entities and external references", () => {
    for (const source of [
      "<svg><script>alert(1)</script></svg>",
      '<svg onload="alert(1)"></svg>',
      '<svg><a href="javascript:alert(1)">x</a></svg>',
      '<!DOCTYPE svg [<!ENTITY x "y">]><svg></svg>',
      '<svg><image href="https://tracker.example/p.png"/></svg>',
      '<svg><image xlink:href="file:///etc/passwd"/></svg>',
      "<svg><style>@import url(https://x.example/a.css);</style></svg>",
      "<svg><foreignObject><div/></foreignObject></svg>",
    ]) {
      expect(svgIssue(source), source).not.toBeNull();
    }
  });
});

describe("file read access", () => {
  const learner = { userId: "u1", canReview: false, canEditCourses: false };
  const other = { userId: "u2", canReview: false, canEditCourses: false };
  const reviewer = { userId: "r1", canReview: true, canEditCourses: false };
  const author = { userId: "a1", canReview: true, canEditCourses: true };
  const handIn = { purpose: "submission" as const, status: "attached" as const, ownerUserId: "u1" };

  it("keeps hand-ins between the learner and the review team", () => {
    expect(canReadFile(handIn, learner)).toBe(true);
    expect(canReadFile(handIn, reviewer)).toBe(true);
    expect(canReadFile(handIn, other)).toBe(false);
    expect(canReadFile(handIn, null)).toBe(false);
  });

  it("shows a pending upload only to the person who uploaded it", () => {
    expect(canReadFile({ ...handIn, status: "pending" }, learner)).toBe(true);
    expect(canReadFile({ ...handIn, status: "pending" }, reviewer)).toBe(false);
  });

  it("serves lesson media and brand assets to anyone, sources only to authors", () => {
    const media = {
      purpose: "lesson_media" as const,
      status: "attached" as const,
      ownerUserId: null,
    };
    const source = { purpose: "source" as const, status: "attached" as const, ownerUserId: null };
    expect(canReadFile(media, null)).toBe(true);
    expect(canReadFile(source, reviewer)).toBe(false);
    expect(canReadFile(source, author)).toBe(true);
  });
});

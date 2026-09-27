import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { zipStream } from "@/server/zip-stream";

function chunked(bytes: Uint8Array, size: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + size));
      offset += size;
    },
  });
}

describe("zip export", () => {
  it("writes JSON and streamed files into one archive", async () => {
    const photo = new Uint8Array(300_000).map((_, index) => index % 251);
    const archive = new Uint8Array(
      await new Response(
        zipStream([
          { path: "my-data.json", text: JSON.stringify({ name: "Ada" }) },
          { path: "files/1234-photo.jpg", open: async () => chunked(photo, 7_000) },
          {
            path: "files/5678-brief.md",
            open: async () => chunked(new TextEncoder().encode("# Brief"), 3),
          },
        ]),
      ).arrayBuffer(),
    );
    const entries = unzipSync(archive);
    expect(Object.keys(entries)).toEqual([
      "my-data.json",
      "files/1234-photo.jpg",
      "files/5678-brief.md",
    ]);
    expect(JSON.parse(new TextDecoder().decode(entries["my-data.json"]))).toEqual({ name: "Ada" });
    expect(entries["files/1234-photo.jpg"]).toEqual(photo);
    expect(new TextDecoder().decode(entries["files/5678-brief.md"])).toBe("# Brief");
  });

  it("fails the download instead of writing a broken archive when a file cannot be read", async () => {
    const stream = zipStream([
      { path: "a.json", text: "{}" },
      {
        path: "files/missing.pdf",
        open: async () => {
          throw new Error("gone");
        },
      },
    ]);
    await expect(new Response(stream).arrayBuffer()).rejects.toThrow();
  });
});

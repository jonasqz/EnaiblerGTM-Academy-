import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { UsageAmount } from "@/server/ai-usage";
import { embed, transcribe } from "@/server/authoring/speech";

describe("speech and embeddings report what each request used", () => {
  let server: Server;
  let baseUrl: string;
  let transcription: Record<string, unknown> = {};
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "enaibler-speech-"));
    server = createServer((request, response) => {
      const body: Buffer[] = [];
      request.on("data", (chunk: Buffer) => body.push(chunk));
      request.on("end", () => {
        if (request.url === "/embeddings") {
          const { input } = JSON.parse(Buffer.concat(body).toString()) as { input: string[] };
          response.writeHead(200, {
            "content-type": "application/json",
            "x-litellm-response-cost": "0.0005",
          });
          response.end(
            JSON.stringify({
              model: "embed-small",
              data: input.map((_, index) => ({ index, embedding: [0.1, 0.2, 0.3] })),
              usage: { prompt_tokens: 7 * input.length, total_tokens: 7 * input.length },
            }),
          );
          return;
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(transcription));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("meters embeddings per batch, with the gateway's tokens and price", async () => {
    const used: UsageAmount[] = [];
    const texts = Array.from({ length: 70 }, (_, index) => `passage ${index}`);
    const vectors = await embed({ baseUrl, model: "embed" }, texts, 3, async (amount) => {
      used.push(amount);
    });
    expect(vectors).toHaveLength(70);
    expect(used).toEqual([
      { model: "embed-small", tokensIn: 448, cost: 0.0005 },
      { model: "embed-small", tokensIn: 42, cost: 0.0005 },
    ]);

    // Vectors of a size the database cannot store were still paid for.
    used.length = 0;
    expect(
      await embed({ baseUrl, model: "embed" }, ["one"], 1024, async (amount) => {
        used.push(amount);
      }),
    ).toBeNull();
    expect(used).toHaveLength(1);
  });

  it("meters transcription by the audio's length, at no price", async () => {
    const audio = join(dir, "audio.mp3");
    writeFileSync(audio, "stand-in for audio");
    const used: UsageAmount[] = [];
    const onUsage = async (amount: UsageAmount) => {
      used.push(amount);
    };
    const segments = [
      { start: 0, end: 6, text: "Here is my invoice list." },
      { start: 6, end: 11.2, text: "Then I chase the late ones." },
    ];
    transcription = { duration: 12.5, segments };
    await transcribe({ baseUrl, model: "whisper-small" }, audio, "en", onUsage);
    // Without a duration the last segment's end stands in for it.
    transcription = { segments };
    await transcribe({ baseUrl, model: "whisper-small" }, audio, "en", onUsage);
    expect(used).toEqual([
      { model: "whisper-small", audioSeconds: 12.5, cost: 0 },
      { model: "whisper-small", audioSeconds: 11.2, cost: 0 },
    ]);
  });
});

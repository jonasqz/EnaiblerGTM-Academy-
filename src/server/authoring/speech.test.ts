import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AiAllowanceUsedUp } from "@/core/usage/allowance";
import type { UsageAmount, UsageMeter } from "@/server/ai-usage";
import { embed, transcribe } from "@/server/authoring/speech";

/** Notes each admission and what each request used, in order; `refuse` plays a used-up allowance. */
function recordingMeter(refuse = false) {
  const events: Array<"admit" | UsageAmount> = [];
  const meter: UsageMeter = {
    admit: async () => {
      events.push("admit");
      if (refuse) throw new AiAllowanceUsedUp();
    },
    record: async (amount) => {
      events.push(amount);
    },
  };
  return { meter, events };
}

describe("speech and embeddings report what each request used", () => {
  let server: Server;
  let baseUrl: string;
  let transcription: Record<string, unknown> = {};
  let requests = 0;
  let dir: string;
  let audio: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "enaibler-speech-"));
    audio = join(dir, "audio.mp3");
    writeFileSync(audio, "stand-in for audio");
    server = createServer((request, response) => {
      requests++;
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
    const { meter, events } = recordingMeter();
    const texts = Array.from({ length: 70 }, (_, index) => `passage ${index}`);
    const vectors = await embed({ baseUrl, model: "embed" }, texts, 3, meter);
    expect(vectors).toHaveLength(70);
    // Each batch is admitted before it goes out.
    expect(events).toEqual([
      "admit",
      { model: "embed-small", tokensIn: 448, cost: 0.0005 },
      "admit",
      { model: "embed-small", tokensIn: 42, cost: 0.0005 },
    ]);

    // Vectors of a size the database cannot store were still paid for.
    const wrongSize = recordingMeter();
    expect(await embed({ baseUrl, model: "embed" }, ["one"], 1024, wrongSize.meter)).toBeNull();
    expect(wrongSize.events).toEqual(["admit", expect.objectContaining({ tokensIn: 7 })]);
  });

  it("meters transcription by the audio's length, at no price", async () => {
    const { meter, events } = recordingMeter();
    const segments = [
      { start: 0, end: 6, text: "Here is my invoice list." },
      { start: 6, end: 11.2, text: "Then I chase the late ones." },
    ];
    transcription = { duration: 12.5, segments };
    await transcribe({ baseUrl, model: "whisper-small" }, audio, "en", meter);
    // Without a duration the last segment's end stands in for it.
    transcription = { segments };
    await transcribe({ baseUrl, model: "whisper-small" }, audio, "en", meter);
    expect(events).toEqual([
      "admit",
      { model: "whisper-small", audioSeconds: 12.5, cost: 0 },
      "admit",
      { model: "whisper-small", audioSeconds: 11.2, cost: 0 },
    ]);
  });

  it("sends nothing once the academy's AI allowance for the month is used up", async () => {
    const { meter, events } = recordingMeter(true);
    const before = requests;
    await expect(embed({ baseUrl, model: "embed" }, ["one"], 3, meter)).rejects.toBeInstanceOf(
      AiAllowanceUsedUp,
    );
    await expect(
      transcribe({ baseUrl, model: "whisper-small" }, audio, "en", meter),
    ).rejects.toBeInstanceOf(AiAllowanceUsedUp);
    expect(events).toEqual(["admit", "admit"]);
    expect(requests).toBe(before);
  });
});

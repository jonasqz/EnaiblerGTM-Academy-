import { readFile } from "node:fs/promises";

import type { TimedText } from "@/core/authoring/transcript";
import type { Locale } from "@/core/i18n/locales";
import type { UsageMeter } from "@/server/ai-usage";
import { reportedCost } from "@/server/llm";

/*
 * Speech recognition and embeddings over OpenAI-compatible APIs: self-hosted
 * Whisper (faster-whisper behind e.g. speaches) for recordings, LiteLLM for
 * embeddings. Both are optional; without them authoring still works, with
 * time-based topics and keyword retrieval. The caller's meter, which knows the
 * academy, admits each request before it is sent (the monthly AI allowance)
 * and records what it used afterwards.
 */

export interface WhisperConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

export function whisperConfig(): WhisperConfig | null {
  const baseUrl = process.env.WHISPER_BASE_URL?.trim();
  if (!baseUrl) return null;
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey: process.env.WHISPER_API_KEY?.trim() || undefined,
    model: process.env.WHISPER_MODEL?.trim() || "Systran/faster-whisper-small",
  };
}

/** Transcribes an audio file into timed segments (verbose JSON). */
export async function transcribe(
  config: WhisperConfig,
  audioPath: string,
  locale: Locale | null,
  meter?: UsageMeter,
): Promise<TimedText[]> {
  await meter?.admit();
  const form = new FormData();
  form.set("file", new Blob([await readFile(audioPath)], { type: "audio/mpeg" }), "audio.mp3");
  form.set("model", config.model);
  form.set("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  if (locale) form.set("language", locale);
  const response = await fetch(`${config.baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {},
    body: form,
    signal: AbortSignal.timeout(60 * 60_000),
  });
  if (!response.ok) {
    throw new Error(
      `Whisper returned ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  }
  const body = (await response.json()) as {
    text?: string;
    duration?: number | string;
    segments?: Array<{ start: number; end: number; text: string }>;
  };
  const duration = Number(body.duration);
  await meter?.record({
    model: config.model,
    audioSeconds:
      Number.isFinite(duration) && duration > 0 ? duration : (body.segments?.at(-1)?.end ?? null),
    // Self-hosted Whisper has no price per call: 0, as null would read as "price unknown".
    cost: 0,
  });
  const segments = (body.segments ?? [])
    .filter((segment) => segment.text?.trim())
    .map((segment) => ({ start: segment.start, end: segment.end, text: segment.text.trim() }));
  if (segments.length === 0 && body.text?.trim()) {
    return [{ start: 0, end: 0, text: body.text.trim() }];
  }
  return segments;
}

export interface EmbeddingConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

export function embeddingConfig(): EmbeddingConfig | null {
  const baseUrl = process.env.LLM_BASE_URL?.trim();
  const model = process.env.LLM_EMBEDDING_MODEL?.trim();
  if (!baseUrl || !model) return null;
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey: process.env.LLM_API_KEY?.trim() || undefined,
    model,
  };
}

/**
 * Embeds texts; null when the model's vectors do not have the size the
 * database stores (EMBEDDING_DIMENSIONS), so retrieval falls back to keywords.
 */
export async function embed(
  config: EmbeddingConfig,
  texts: readonly string[],
  dimensions: number,
  meter?: UsageMeter,
): Promise<number[][] | null> {
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += 64) {
    await meter?.admit();
    const response = await fetch(`${config.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: config.model, input: texts.slice(start, start + 64) }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new Error(
        `Embeddings returned ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    }
    const body = (await response.json()) as {
      model?: string;
      data?: Array<{ embedding: number[]; index?: number }>;
      usage?: { prompt_tokens?: number };
    };
    // Before the size check: vectors of the wrong size were still paid for.
    await meter?.record({
      model: body.model ?? config.model,
      tokensIn: body.usage?.prompt_tokens ?? null,
      cost: reportedCost(response.headers),
    });
    const batch = [...(body.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (batch.some((item) => item.embedding.length !== dimensions)) {
      console.warn(
        `[authoring] embedding model returns ${batch[0]?.embedding.length} dimensions, the database stores ${dimensions}: using keyword retrieval`,
      );
      return null;
    }
    vectors.push(...batch.map((item) => item.embedding));
  }
  return vectors;
}

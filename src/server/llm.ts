/**
 * Minimal client for the LiteLLM gateway (OpenAI-compatible chat completions,
 * brief §11). LiteLLM routes to the EU-region / zero-retention provider and
 * reports the cost of each call in the `x-litellm-response-cost` header (in
 * the currency of its model price table, USD unless configured otherwise).
 */

export type ChatContentPart =
  { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

export interface LlmCallOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  /** OpenAI-style structured output schema ({ name, strict, schema }). */
  jsonSchema?: { name: string; strict: boolean; schema: Record<string, unknown> };
  maxTokens?: number;
  /** Passed to LiteLLM for its logs (e.g. prompt version, tenant). */
  metadata?: Record<string, string>;
}

export interface LlmCallResult {
  content: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  /** As reported by LiteLLM; null when the gateway does not know the price. */
  cost: number | null;
  latencyMs: number;
}

export type LlmCaller = (options: LlmCallOptions) => Promise<LlmCallResult>;

export function createLlmCaller(config: {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}): LlmCaller {
  const endpoint = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  return async (options) => {
    const started = performance.now();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.1,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
        ...(options.jsonSchema
          ? { response_format: { type: "json_schema", json_schema: options.jsonSchema } }
          : {}),
        ...(options.metadata ? { metadata: options.metadata } : {}),
      }),
      signal: AbortSignal.timeout(config.timeoutMs ?? 120_000),
    });
    if (!response.ok) {
      throw new Error(
        `LLM gateway returned ${response.status}: ${(await response.text()).slice(0, 500)}`,
      );
    }
    const body = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const costHeader = response.headers.get("x-litellm-response-cost");
    const cost = costHeader === null ? Number.NaN : Number.parseFloat(costHeader);
    return {
      content: body.choices?.[0]?.message?.content ?? "",
      model: body.model ?? options.model,
      tokensIn: body.usage?.prompt_tokens ?? null,
      tokensOut: body.usage?.completion_tokens ?? null,
      cost: Number.isFinite(cost) ? cost : null,
      latencyMs: Math.round(performance.now() - started),
    };
  };
}

import { z } from "zod";

/**
 * Runtime configuration. Parsed lazily (not at import time) so `next build`
 * works without secrets. See .env.example for descriptions.
 */
const optional = z.string().trim().min(1).optional();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  /** Public protocol of tenant domains (behind Traefik: https). */
  APP_PROTOCOL: z.enum(["http", "https"]).optional(),
  /** Port appended to dev hosts (e.g. demo.localhost:3000). */
  DEV_PORT: z.coerce.number().int().positive().default(3000),
  /** Tenant served on plain http://localhost in development. */
  DEV_DEFAULT_TENANT: optional,
  /** Platform sender used when a tenant has no email_sender. */
  EMAIL_FROM_ADDRESS: z.email().default("academy@enaibler.local"),
  /** smtp(s)://user:pass@host:port of the EU relay. Unset in development: mails are logged. */
  SMTP_URL: optional,
  S3_ENDPOINT: optional,
  S3_REGION: z.string().default("eu-central-1"),
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  /** OpenAI-compatible base URL of the LiteLLM proxy, e.g. http://litellm:4000/v1 */
  LLM_BASE_URL: optional,
  LLM_API_KEY: optional,
  LLM_REVIEW_MODEL: z.string().default("review-default"),
  /** Model for "import brand from website"; falls back to the review model. */
  LLM_BRAND_MODEL: optional,
  /** Model for authoring help (rubric, interview, lesson drafts); falls back to the review model. */
  LLM_AUTHORING_MODEL: optional,
  /** Embedding model behind LiteLLM for source retrieval (its vectors must have 1024 dimensions). */
  LLM_EMBEDDING_MODEL: optional,
  /** Self-hosted Whisper, OpenAI-compatible (e.g. speaches with faster-whisper), for recordings. */
  WHISPER_BASE_URL: optional,
  WHISPER_API_KEY: optional,
  WHISPER_MODEL: optional,
  /** ffmpeg binary for recordings (the worker image has it on PATH). */
  FFMPEG_PATH: optional,
  /**
   * Self-serve: the platform site where customers create academies, e.g.
   * enaibler.app. Development defaults to plain localhost. Unset in
   * production: no self-serve signup, academies come from manifests only.
   */
  PLATFORM_HOST: optional,
  /** New academies get <slug>.<ACADEMY_DOMAIN> (needs wildcard DNS and TLS). */
  ACADEMY_DOMAIN: optional,
  /**
   * enaibler's own legal pages kept elsewhere: each replaces its built-in page
   * (content/legal) on the platform site and at signup.
   */
  PLATFORM_TERMS_URL: optional,
  PLATFORM_DPA_URL: optional,
  PLATFORM_PRIVACY_URL: optional,
  PLATFORM_IMPRINT_URL: optional,
  /** An academy the website links to as a demo; no link without it. */
  PLATFORM_DEMO_URL: optional,
  /**
   * Recorded with every accepted agreement. Unset: a built-in page's
   * last-updated date, and 2026-09 for documents kept elsewhere.
   */
  PLATFORM_AGREEMENT_VERSION: optional,
  /** Where content reports from the website go (DSA notice and action). */
  PLATFORM_ABUSE_EMAIL: z.email().optional(),
  /** The operator's inbox for each new academy; no notice without it. */
  PLATFORM_NOTIFY_EMAIL: z.email().optional(),
});

export type Env = z.output<typeof envSchema> & { APP_PROTOCOL: "http" | "https" };

let cached: Env | null = null;

export function parseEnv(source: Record<string, string | undefined>): Env {
  // docker-compose.prod.yml passes unset variables as empty strings (${VAR:-}).
  const values = Object.fromEntries(Object.entries(source).filter(([, value]) => value?.trim()));
  const result = envSchema.safeParse(values);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  const parsed = result.data;
  return {
    ...parsed,
    APP_PROTOCOL: parsed.APP_PROTOCOL ?? (parsed.NODE_ENV === "production" ? "https" : "http"),
  };
}

export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

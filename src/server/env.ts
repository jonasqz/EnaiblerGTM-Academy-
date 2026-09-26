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
});

export type Env = z.output<typeof envSchema> & { APP_PROTOCOL: "http" | "https" };

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  const parsed = result.data;
  cached = {
    ...parsed,
    APP_PROTOCOL: parsed.APP_PROTOCOL ?? (parsed.NODE_ENV === "production" ? "https" : "http"),
  };
  return cached;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

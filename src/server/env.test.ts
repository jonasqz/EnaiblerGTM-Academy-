import { describe, expect, it } from "vitest";

import { parseEnv } from "@/server/env";

const required = {
  DATABASE_URL: "postgres://enaibler_app:app@db:5432/enaibler",
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
};

describe("environment", () => {
  it("treats empty variables as unset, the way docker compose passes them", () => {
    const parsed = parseEnv({
      ...required,
      S3_ENDPOINT: "",
      LLM_BASE_URL: " ",
      LLM_REVIEW_MODEL: "",
      PLATFORM_HOST: "",
    });
    expect(parsed.S3_ENDPOINT).toBeUndefined();
    expect(parsed.LLM_BASE_URL).toBeUndefined();
    expect(parsed.PLATFORM_HOST).toBeUndefined();
    expect(parsed.LLM_REVIEW_MODEL).toBe("review-default");
  });

  it("still requires the database and the auth secret", () => {
    expect(() => parseEnv({ ...required, DATABASE_URL: "" })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...required, BETTER_AUTH_SECRET: "short" })).toThrow(/32 characters/);
  });

  it("defaults the protocol to https in production only", () => {
    expect(parseEnv({ ...required, NODE_ENV: "production" }).APP_PROTOCOL).toBe("https");
    expect(parseEnv(required).APP_PROTOCOL).toBe("http");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { platformConfig, platformOrigin } from "@/server/platform/config";

describe("the platform host behind the academies' report link", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is missing in production until PLATFORM_HOST and ACADEMY_DOMAIN are set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_HOST", "");
    vi.stubEnv("ACADEMY_DOMAIN", "academies.enaibler.app");
    expect(platformOrigin()).toBeNull();

    vi.stubEnv("PLATFORM_HOST", "enaibler.app");
    expect(platformOrigin()).toBe("https://enaibler.app");
  });

  it("is localhost with the dev port in development, unless an academy takes localhost", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PLATFORM_HOST", "");
    vi.stubEnv("ACADEMY_DOMAIN", "");
    vi.stubEnv("APP_PROTOCOL", "");
    vi.stubEnv("DEV_PORT", "3100");
    vi.stubEnv("DEV_DEFAULT_TENANT", "");
    expect(platformOrigin()).toBe("http://localhost:3100");

    vi.stubEnv("DEV_DEFAULT_TENANT", "demo");
    expect(platformOrigin()).toBeNull();
  });

  it("sends content reports to PLATFORM_ABUSE_EMAIL, and nowhere in production without it", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_HOST", "enaibler.app");
    vi.stubEnv("ACADEMY_DOMAIN", "academies.enaibler.app");
    vi.stubEnv("PLATFORM_ABUSE_EMAIL", "");
    expect(platformConfig()?.abuseEmail).toBeUndefined();
    vi.stubEnv("PLATFORM_ABUSE_EMAIL", " abuse@enaibler.app ");
    expect(platformConfig()?.abuseEmail).toBe("abuse@enaibler.app");
  });
});

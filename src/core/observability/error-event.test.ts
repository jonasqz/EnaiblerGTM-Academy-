import { describe, expect, it } from "vitest";

import { errorEvent, parseDsn, parseStack, scrub } from "@/core/observability/error-event";

const options = {
  eventId: "a".repeat(32),
  now: new Date("2026-09-27T08:00:00Z"),
  environment: "production",
};

describe("error reports (brief §11, GlitchTip)", () => {
  it("finds the store endpoint in a DSN", () => {
    expect(parseDsn("https://abc123@errors.enaibler.app/4")).toEqual({
      storeUrl: "https://errors.enaibler.app/api/4/store/",
      publicKey: "abc123",
    });
    expect(parseDsn("https://key@host.example/glitchtip/12")?.storeUrl).toBe(
      "https://host.example/glitchtip/api/12/store/",
    );
    expect(parseDsn("")).toBeNull();
    expect(parseDsn("https://errors.enaibler.app/4")).toBeNull();
    expect(parseDsn("not a dsn")).toBeNull();
  });

  it("masks addresses and tokens in messages", () => {
    expect(scrub("duplicate key: (email)=(ada@example.com)")).toBe(
      "duplicate key: (email)=([email])",
    );
    expect(scrub("token=Z3VhcmQtdGhpcy10b2tlbi1wbGVhc2UtMTIzNDU2")).toBe("token=[redacted]");
    // Ids stay readable.
    expect(scrub("lesson 0b7a1f6e-8a51-4d1c-9a55-3f0c2f7f9b10")).toContain("0b7a1f6e-8a51");
  });

  it("reads V8 stacks, oldest call first", () => {
    const frames = parseStack(
      [
        "TypeError: nope",
        "    at loadCourse (/app/.next/server/chunks/course.js:10:5)",
        "    at async Page (/app/.next/server/app/page.js:3:1)",
        "    at /app/node_modules/next/dist/server/render.js:88:12",
        "    at node:internal/process/task_queues:95:5",
      ].join("\n"),
    );
    expect(frames.map((frame) => frame.function ?? "?")).toEqual(["?", "?", "Page", "loadCourse"]);
    expect(frames.map((frame) => frame.in_app)).toEqual([false, false, true, true]);
    expect(frames[3]).toMatchObject({ lineno: 10, colno: 5 });
  });

  it("sends the path, never the query string, and nothing about people", () => {
    const cause = new Error("connect ECONNREFUSED");
    const error = new Error("Sending mail to ada@example.com failed", { cause });
    const event = errorEvent(
      error,
      {
        runtime: "web",
        tenant: "scaling-product",
        route: "/sign-in/confirm",
        method: "GET",
        path: "/sign-in/confirm?token=abcdefabcdefabcdefabcdefabcdefabcdef",
      },
      options,
    );
    expect(event.request).toEqual({ method: "GET", url: "/sign-in/confirm" });
    expect(event.tags).toEqual({
      runtime: "web",
      tenant: "scaling-product",
      route: "/sign-in/confirm",
    });
    expect(event.exception.values.map((value) => value.value)).toEqual([
      "connect ECONNREFUSED",
      "Sending mail to [email] failed",
    ]);
    expect(JSON.stringify(event)).not.toContain("ada@example.com");
    expect(JSON.stringify(event)).not.toContain("abcdefabcdef");
  });

  it("reports thrown non-errors too", () => {
    const event = errorEvent("plain string", { runtime: "worker", queue: "review.run" }, options);
    expect(event.exception.values).toEqual([{ type: "NonError", value: "plain string" }]);
    expect(event.tags).toEqual({ runtime: "worker", queue: "review.run" });
  });
});

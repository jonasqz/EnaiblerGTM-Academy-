import { afterEach, describe, expect, it, vi } from "vitest";

import {
  classifyConnectionError,
  connectionAdvice,
  describeTarget,
  localLoginCause,
  reportConnectionProblem,
  type ProjectContainer,
} from "@/db/connection-hints";

/** The driver's error, with the code and message Postgres sends. */
function driverError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** Drizzle wraps whatever the driver threw. */
function wrapped(cause: unknown): Error {
  const error = new Error('Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"');
  error.cause = cause;
  return error;
}

describe("what a failed connection means", () => {
  it("knows a refused login through Drizzle's wrapper, and whose", () => {
    const error = wrapped(
      driverError("28P01", 'password authentication failed for user "enaibler_owner"'),
    );
    expect(classifyConnectionError(error)).toEqual({
      kind: "login_refused",
      user: "enaibler_owner",
    });
  });

  it("knows nothing is listening, also when localhost has several addresses", () => {
    const refused = (address: string) =>
      Object.assign(new Error(`connect ECONNREFUSED ${address}:5432`), { code: "ECONNREFUSED" });
    const several = Object.assign(new AggregateError([refused("::1"), refused("127.0.0.1")]), {
      code: "ECONNREFUSED",
    });
    expect(classifyConnectionError(several)).toEqual({ kind: "unreachable" });
    expect(classifyConnectionError(wrapped(several))).toEqual({ kind: "unreachable" });
    // Even when only the inner errors carry the code.
    expect(classifyConnectionError(new AggregateError([refused("127.0.0.1")]))).toEqual({
      kind: "unreachable",
    });
  });

  it("knows a missing database", () => {
    expect(
      classifyConnectionError(driverError("3D000", 'database "enaibler" does not exist')),
    ).toEqual({ kind: "no_database", name: "enaibler" });
  });

  it("leaves every other failure alone", () => {
    expect(classifyConnectionError(new Error("boom"))).toBeNull();
    expect(classifyConnectionError(driverError("23505", "duplicate key value"))).toBeNull();
    expect(classifyConnectionError("nope")).toBeNull();
    expect(classifyConnectionError(null)).toBeNull();
  });

  it("does not loop on an error that wraps itself", () => {
    const error = new Error("loop");
    error.cause = error;
    expect(classifyConnectionError(error)).toBeNull();
  });
});

describe("where a connection string points", () => {
  it("names user, host, port and database, never the password", () => {
    const target = describeTarget("postgres://enaibler_owner:s3cret@localhost:5433/enaibler");
    expect(target).toEqual({
      user: "enaibler_owner",
      host: "localhost",
      port: 5433,
      database: "enaibler",
      local: true,
    });
    expect(JSON.stringify(target)).not.toContain("s3cret");
  });

  it("takes Postgres' port when there is none, and knows a remote host", () => {
    expect(describeTarget("postgres://app:x@db.example.com/enaibler")).toMatchObject({
      host: "db.example.com",
      port: 5432,
      local: false,
    });
  });

  it("has no answer for something that is not an address", () => {
    expect(describeTarget(undefined)).toBeNull();
    expect(describeTarget("not a url")).toBeNull();
  });
});

describe("what to tell whoever ran the command", () => {
  const local = describeTarget("postgres://enaibler_owner:owner@localhost:5432/enaibler");
  const remote = describeTarget("postgres://enaibler_owner:x@db.example.com:5432/enaibler");

  it("sends a refused local login to the doctor, naming both usual causes", () => {
    const advice = connectionAdvice({ kind: "login_refused", user: "enaibler_owner" }, local);
    const text = advice.join("\n");
    expect(text).toContain('refused the login for "enaibler_owner"');
    expect(text).toContain("another Postgres answers on port 5432");
    expect(text).toContain("before its setup script ran");
    expect(text).toContain("npm run doctor");
  });

  it("does not mention docker for a database somewhere else", () => {
    for (const problem of [
      { kind: "login_refused", user: "x" },
      { kind: "unreachable" },
      { kind: "no_database", name: "enaibler" },
    ] as const) {
      const text = connectionAdvice(problem, remote).join("\n");
      expect(text).toContain("db.example.com:5432");
      expect(text).not.toMatch(/docker/i);
    }
  });

  it("tells a local unreachable database to start the services", () => {
    expect(connectionAdvice({ kind: "unreachable" }, local).join("\n")).toContain(
      "docker compose up -d",
    );
  });

  it("warns that starting over deletes the local database", () => {
    expect(connectionAdvice({ kind: "no_database", name: "enaibler" }, local).join("\n")).toContain(
      "docker compose down -v",
    );
  });
});

describe("reporting a failure to whoever ran a script", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prints the advice and says it was a connection problem", () => {
    const print = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = wrapped(
      driverError("28P01", 'password authentication failed for user "enaibler_owner"'),
    );
    expect(
      reportConnectionProblem(error, "postgres://enaibler_owner:owner@localhost:5432/enaibler"),
    ).toBe(true);
    expect(print.mock.calls[0]![0]).toMatch(/^✗ The database at localhost:5432 refused the login/);
    expect(print.mock.calls.flat().join("\n")).not.toContain(":owner@");
  });

  it("stays quiet about anything else", () => {
    const print = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(reportConnectionProblem(new Error("boom"), undefined)).toBe(false);
    expect(print).not.toHaveBeenCalled();
  });
});

describe("why a login on this machine was refused", () => {
  const running = (overrides: Partial<Extract<ProjectContainer, { running: true }>> = {}) =>
    ({ docker: true, running: true, publishedPort: 5432, hasRoles: true, ...overrides }) as const;
  const cause = (container: ProjectContainer, listeners: string[] = ["docker-pr"], port = 5432) =>
    localLoginCause({ port, container, listeners: listeners.map((command) => ({ command })) });

  it("blames Docker when it does not answer, and a stopped container when it does not run", () => {
    expect(cause({ docker: false })).toBe("no_docker");
    expect(cause({ docker: true, running: false })).toBe("container_stopped");
  });

  it("notices .env.local pointing at another port than the container publishes", () => {
    expect(cause(running({ publishedPort: 5433 }))).toBe("wrong_port");
    // Not knowing the published port is no reason to blame it.
    expect(cause(running({ publishedPort: null }))).toBe("wrong_password");
  });

  it("finds another Postgres holding the port, before it blames the container", () => {
    // The macOS case: Docker published the port and a Homebrew Postgres answers first.
    expect(cause(running(), ["com.docke", "postgres"])).toBe("other_postgres");
    expect(cause(running({ hasRoles: false }), ["postgres"])).toBe("other_postgres");
  });

  it("finds a volume from before the setup script ran, and a changed password", () => {
    expect(cause(running({ hasRoles: false }))).toBe("stale_volume");
    expect(cause(running({ hasRoles: true }))).toBe("wrong_password");
    expect(cause(running({ hasRoles: null }))).toBe("wrong_password");
  });
});

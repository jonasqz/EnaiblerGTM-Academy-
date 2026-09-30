/**
 * What a failed database connection means, in words for whoever sets the app
 * up (README → Quickstart, `npm run doctor`). The driver's error arrives
 * wrapped: Drizzle puts it under `cause`, and Node reports every address
 * `localhost` resolves to as an AggregateError, so the whole chain is
 * searched for the code that says what went wrong. Pure: nothing connects here.
 */

export type ConnectionProblem =
  /** The server answered and turned the login down: the user or its password is not known there. */
  | { kind: "login_refused"; user: string | null }
  /** Nothing answers at that address. */
  | { kind: "unreachable" }
  /** The server is there and knows the login, but not the database. */
  | { kind: "no_database"; name: string | null };

const LOGIN_REFUSED = new Set(["28P01", "28000"]);
const NO_DATABASE = "3D000";
const UNREACHABLE = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
]);

/** The error and everything it wraps, outermost first. */
function causes(error: unknown, depth = 0): object[] {
  if (depth > 6 || typeof error !== "object" || error === null) return [];
  const { cause, errors } = error as { cause?: unknown; errors?: unknown };
  return [
    error,
    ...causes(cause, depth + 1),
    ...(Array.isArray(errors) ? errors.flatMap((inner) => causes(inner, depth + 1)) : []),
  ];
}

const codeOf = (error: object): string | null => {
  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : null;
};

const messageOf = (error: object): string => {
  const { message } = error as { message?: unknown };
  return typeof message === "string" ? message : "";
};

/** Null when the error has nothing to do with reaching or logging in to the database. */
export function classifyConnectionError(error: unknown): ConnectionProblem | null {
  const chain = causes(error);
  const login = chain.find((candidate) => LOGIN_REFUSED.has(codeOf(candidate) ?? ""));
  if (login)
    return {
      kind: "login_refused",
      user: /for user "([^"]+)"/.exec(messageOf(login))?.[1] ?? null,
    };
  const missing = chain.find((candidate) => codeOf(candidate) === NO_DATABASE);
  if (missing)
    return {
      kind: "no_database",
      name: /database "([^"]+)"/.exec(messageOf(missing))?.[1] ?? null,
    };
  if (chain.some((candidate) => UNREACHABLE.has(codeOf(candidate) ?? "")))
    return { kind: "unreachable" };
  return null;
}

/** Where a connection string points: never the password. */
export interface ConnectionTarget {
  user: string;
  host: string;
  port: number;
  database: string;
  /** On this machine, so the docker compose services are what should answer. */
  local: boolean;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function describeTarget(url: string | undefined): ConnectionTarget | null {
  if (!url || !URL.canParse(url)) return null;
  const parsed = new URL(url);
  return {
    user: decodeURIComponent(parsed.username),
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    local: LOCAL_HOSTS.has(parsed.hostname),
  };
}

/** What to tell whoever ran the command, one line each. */
export function connectionAdvice(
  problem: ConnectionProblem,
  target: ConnectionTarget | null,
): string[] {
  const where = target ? `${target.host}:${target.port}` : "the database address";
  switch (problem.kind) {
    case "login_refused": {
      const user = problem.user ?? target?.user ?? "this user";
      if (!target?.local) {
        return [
          `The database at ${where} refused the login for "${user}".`,
          "Check the user and password in DATABASE_MIGRATION_URL and DATABASE_URL.",
        ];
      }
      return [
        `The database at ${where} refused the login for "${user}". With the docker compose setup that means:`,
        `  1. another Postgres answers on port ${target.port} (Homebrew, Postgres.app, another project), not this project's container, or`,
        "  2. the container was created before its setup script ran, so the enaibler roles are missing.",
        "Run `npm run doctor`: it tells which one it is and what to do.",
      ];
    }
    case "unreachable":
      return target?.local
        ? [
            `Nothing answers at ${where}.`,
            "Start Docker Desktop, run `docker compose up -d` and check with `npm run doctor`.",
          ]
        : [
            `The database at ${where} cannot be reached.`,
            "Check the address in DATABASE_MIGRATION_URL and DATABASE_URL, the network and the firewall.",
          ];
    case "no_database": {
      const name = problem.name ?? target?.database ?? "the database";
      return target?.local
        ? [
            `The server at ${where} has no database "${name}".`,
            "deploy/postgres/init.sh creates it once, when docker compose first starts on an empty volume.",
            "Start over with `docker compose down -v && docker compose up -d` (this deletes the local database), then `npm run doctor`.",
          ]
        : [
            `The server at ${where} has no database "${name}".`,
            "Create it with deploy/postgres/init.sh (docs/deployment.md §2).",
          ];
    }
  }
}

/** What the docker CLI says about this project's postgres container (scripts/doctor.ts asks it). */
export type ProjectContainer =
  | { docker: false }
  | { docker: true; running: false }
  | {
      docker: true;
      running: true;
      /** The host port it publishes for Postgres. */
      publishedPort: number | null;
      /** Whether it knows the enaibler roles; null when it could not be asked. */
      hasRoles: boolean | null;
    };

export type LocalLoginCause =
  | "no_docker"
  | "container_stopped"
  | "wrong_port"
  | "other_postgres"
  | "stale_volume"
  | "wrong_password";

/**
 * Why a login on this machine was refused, from what is known about the
 * docker services and what listens on the port. The order matters: on macOS a
 * Postgres from Homebrew or Postgres.app can hold the port next to Docker's,
 * and connections then reach it instead of the container, so it is looked
 * for before the container's own state is blamed.
 */
export function localLoginCause(input: {
  /** The port in the connection string. */
  port: number;
  container: ProjectContainer;
  /** What listens on that port (lsof), by program name. */
  listeners: ReadonlyArray<{ command: string }>;
}): LocalLoginCause {
  const { container } = input;
  if (!container.docker) return "no_docker";
  if (!container.running) return "container_stopped";
  if (container.publishedPort !== null && container.publishedPort !== input.port)
    return "wrong_port";
  if (input.listeners.some((entry) => /postgres/i.test(entry.command))) return "other_postgres";
  if (container.hasRoles === false) return "stale_volume";
  return "wrong_password";
}

/**
 * Prints the advice for a connection failure and says whether it was one.
 * The scripts call it in their catch, so setup mistakes read as a sentence
 * with a next step instead of a stack trace.
 */
export function reportConnectionProblem(error: unknown, url: string | undefined): boolean {
  const problem = classifyConnectionError(error);
  if (!problem) return false;
  const [first, ...rest] = connectionAdvice(problem, describeTarget(url));
  console.error(`✗ ${first}`);
  for (const line of rest) console.error(`  ${line}`);
  return true;
}

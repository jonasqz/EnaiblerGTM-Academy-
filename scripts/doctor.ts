/**
 * Checks a local setup and says what to do about each problem:
 *   npm run doctor
 * Read-only: it connects and looks, and changes nothing. Exits with 1 when
 * something the quickstart needs is missing; a "!" is worth knowing but does
 * not block (storage, mail, ffmpeg and the AI gateway are optional).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";

import pg from "pg";

import {
  classifyConnectionError,
  describeTarget,
  localLoginCause,
  type ConnectionTarget,
  type ProjectContainer,
} from "@/db/connection-hints";

let failures = 0;

function say(mark: "✓" | "!" | "✗", title: string, ...next: string[]): void {
  console.log(`${mark} ${title}`);
  for (const line of next) console.log(`    ${line}`);
  if (mark === "✗") failures += 1;
}

function run(command: string, args: string[], timeoutMs = 15_000) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: timeoutMs });
  return {
    ok: !result.error && result.status === 0,
    out: (result.stdout ?? "").trim(),
  };
}

async function open(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 4_000 });
  // A connection that drops later must not end the report.
  client.on("error", () => undefined);
  await client.connect();
  return client;
}

function listens(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(2_000, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

async function answers(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(3_000) });
    return true;
  } catch {
    return false;
  }
}

/** Who listens on a port, as lsof (macOS and Linux) names them; empty when it cannot tell. */
function listeners(port: number): Array<{ command: string; pid: string; on: string }> {
  const { out } = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], 5_000);
  return out
    .split("\n")
    .slice(1)
    .map((line) => {
      const [command = "", pid = ""] = line.split(/\s+/);
      return { command, pid, on: /(\S+) \(LISTEN\)/.exec(line)?.[1] ?? "" };
    })
    .filter((entry) => entry.command);
}

const sedInPlace = process.platform === "darwin" ? "sed -i ''" : "sed -i";

/** How to move the docker services to another port, when something else keeps port 5432. */
function anotherPortSteps(port: number): string[] {
  const moved = port === 5433 ? 5434 : 5433;
  return [
    `echo POSTGRES_PORT=${moved} > .env`,
    "docker compose up -d",
    `${sedInPlace} 's/localhost:${port}/localhost:${moved}/g' .env.local`,
  ];
}

/** What the project's own postgres container says: whether it runs, where, and if it knows the roles. */
function projectContainer(): ProjectContainer {
  const ps = run("docker", ["compose", "ps", "-q", "postgres"]);
  if (!ps.ok) return { docker: false };
  const id = ps.out.split("\n")[0];
  if (!id) return { docker: true, running: false };
  const published = /:(\d+)\s*$/m.exec(run("docker", ["port", id, "5432/tcp"]).out)?.[1];
  const roles = run("docker", [
    "compose",
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-Atc",
    "select count(*) from pg_roles where rolname = 'enaibler_owner'",
  ]);
  return {
    docker: true,
    running: true,
    publishedPort: published ? Number(published) : null,
    hasRoles: roles.ok ? roles.out === "1" : null,
  };
}

/** A local login was refused: which of the usual reasons it is (core: localLoginCause). */
function explainLocalLogin(label: string, target: ConnectionTarget): void {
  const where = `${target.host}:${target.port}`;
  const others = listeners(target.port);
  const who = others.map((entry) => `${entry.command} (pid ${entry.pid}) on ${entry.on}`);
  const listening = who.length ? [`Listening on port ${target.port}: ${who.join(", ")}`] : [];
  const container = projectContainer();
  const refused = `${label}: the login for "${target.user}" was refused at ${where}`;
  const anotherPort = anotherPortSteps(target.port).map((step) => `  ${step}`);

  switch (localLoginCause({ port: target.port, container, listeners: others })) {
    case "no_docker":
      say(
        "✗",
        `${refused}, and Docker does not answer`,
        "That Postgres is not this project's container. Start Docker Desktop and run: docker compose up -d",
        "(or point DATABASE_URL and DATABASE_MIGRATION_URL at a Postgres prepared with deploy/postgres/init.sh)",
        ...listening,
      );
      return;
    case "container_stopped":
      say(
        "✗",
        `${refused}, and this project's Postgres container is not running`,
        "Something else answers on that port. Start the project's services: docker compose up -d",
        `If Docker then says port ${target.port} is already allocated, another Postgres has it. Move Docker to another port:`,
        ...anotherPort,
        ...listening,
      );
      return;
    case "wrong_port": {
      const published = container.docker && container.running ? container.publishedPort : null;
      say(
        "✗",
        `${label}: .env.local points to port ${target.port}, but this project's container publishes port ${published}`,
        `Change the port in DATABASE_URL and DATABASE_MIGRATION_URL to ${published}:`,
        `  ${sedInPlace} 's/localhost:${target.port}/localhost:${published}/g' .env.local`,
      );
      return;
    }
    case "other_postgres":
      say(
        "✗",
        `${label}: another Postgres answers on port ${target.port}, not this project's container`,
        ...listening,
        "Fix A: stop it (Homebrew: brew services list, then brew services stop postgresql@16; Postgres.app: quit it), then: docker compose up -d",
        "Fix B: keep it and move Docker to another port:",
        ...anotherPort,
      );
      return;
    case "stale_volume":
      say(
        "✗",
        `${label}: this project's container runs, but it has no enaibler roles`,
        "Its data volume is older than the setup script (deploy/postgres/init.sh only runs on an empty volume).",
        "Start over (this deletes the local database): docker compose down -v && docker compose up -d",
      );
      return;
    case "wrong_password":
      say(
        "✗",
        `${refused}, though this project's container runs`,
        "The password in .env.local differs from the one the container was set up with (docker-compose.yml: owner and app).",
        "Copy the URLs from .env.example again, or start over (this deletes the local database): docker compose down -v && docker compose up -d",
        ...listening,
      );
  }
}

function explainFailure(label: string, error: unknown, url: string): void {
  const target = describeTarget(url);
  const problem = classifyConnectionError(error);
  const where = target ? `${target.host}:${target.port}` : "the database";
  if (!problem) {
    say("✗", `${label}: ${error instanceof Error ? error.message : String(error)}`);
  } else if (problem.kind === "unreachable") {
    say(
      "✗",
      `${label}: nothing answers at ${where}`,
      ...(target?.local
        ? [
            "Start Docker Desktop, then: docker compose up -d",
            `If Docker says port ${target.port} is already allocated, another Postgres has it:`,
            ...anotherPortSteps(target.port).map((step) => `  ${step}`),
          ]
        : ["Check the address, the network and the firewall."]),
    );
  } else if (problem.kind === "no_database") {
    say(
      "✗",
      `${label}: the server at ${where} has no database "${problem.name ?? target?.database ?? ""}"`,
      "deploy/postgres/init.sh creates it once, on an empty volume.",
      ...(target?.local
        ? [
            "Start over (this deletes the local database): docker compose down -v && docker compose up -d",
          ]
        : ["Create it with deploy/postgres/init.sh (docs/deployment.md §2)."]),
    );
  } else if (target?.local) {
    explainLocalLogin(label, target);
  } else {
    say(
      "✗",
      `${label}: the login for "${problem.user ?? target?.user ?? "this user"}" was refused at ${where}`,
      "Check the user and password in DATABASE_MIGRATION_URL and DATABASE_URL.",
    );
  }
}

async function login(label: string, url: string): Promise<pg.Client | null> {
  try {
    return await open(url);
  } catch (error) {
    explainFailure(label, error, url);
    return null;
  }
}

async function database(ownerUrl: string, appUrl: string | undefined): Promise<void> {
  const owner = await login("Database (schema owner)", ownerUrl);
  if (!owner) return;
  try {
    const target = describeTarget(ownerUrl);
    const version = (await owner.query<{ v: string }>("select version() as v")).rows[0]?.v;
    say(
      "✓",
      `Database: ${version?.split(",")[0] ?? "connected"} at ${target?.host}:${target?.port}`,
    );

    const vector = await owner.query("select 1 from pg_extension where extname = 'vector'");
    if (vector.rowCount === 0) {
      say(
        "✗",
        "The pgvector extension is missing",
        "Use the pgvector/pgvector image (docker compose does) or run CREATE EXTENSION vector as a superuser.",
      );
    }

    if (appUrl) {
      const app = await login("Database (app role)", appUrl);
      if (app) {
        const role = (
          await app.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
            "select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user",
          )
        ).rows[0];
        if (role?.rolsuper || role?.rolbypassrls) {
          say(
            "✗",
            `DATABASE_URL connects as "${role.rolname}", which bypasses row-level security`,
            "Use the app role (enaibler_app): see .env.example.",
          );
        } else {
          say("✓", `App role "${role?.rolname}" can log in and is bound by row-level security`);
        }
        await app.end();
      }
    }

    const journal = JSON.parse(
      readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
    ) as { entries: unknown[] };
    const expected = journal.entries.length;
    let applied = 0;
    try {
      applied = (
        await owner.query<{ n: number }>(
          "select count(*)::int as n from drizzle.__drizzle_migrations",
        )
      ).rows[0]!.n;
    } catch {
      // No migrations table yet: nothing applied.
    }
    if (applied < expected) {
      say("✗", `Migrations: ${applied} of ${expected} applied`, "Run: npm run db:migrate");
      return;
    }
    say(
      applied > expected ? "!" : "✓",
      applied > expected
        ? `Migrations: the database has ${applied}, this checkout knows ${expected} (a newer branch was used here)`
        : `Migrations: all ${expected} applied`,
    );

    const academies = (
      await owner.query<{ id: string; slug: string }>("select id, slug from tenants order by slug")
    ).rows;
    if (academies.length === 0) {
      say(
        "!",
        "No academies yet",
        "Run: npm run tenant:apply -- config/tenants/demo.yaml config/tenants/scaling-product.yaml",
        "(or create one on the platform site, http://localhost:3000)",
      );
      return;
    }
    say("✓", `Academies: ${academies.map((academy) => academy.slug).join(", ")}`);
    for (const academy of academies) {
      // Memberships are tenant data: read them the way the app does, inside the tenant.
      await owner.query("begin");
      await owner.query("select set_config('app.tenant_id', $1, true)", [academy.id]);
      const admins = (
        await owner.query<{ n: number }>(
          "select count(*)::int as n from memberships where role = 'tenant_admin'",
        )
      ).rows[0]!.n;
      await owner.query("commit");
      if (admins === 0) {
        say(
          "!",
          `${academy.slug} has no admin yet`,
          `Run: npm run role:grant -- ${academy.slug} you@example.com tenant_admin`,
          "(any address works locally: the sign-in mail arrives in Mailpit or in the terminal)",
        );
      }
    }
  } finally {
    await owner.end();
  }
}

// ---- The checks -------------------------------------------------------------------------

const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
if (major > 22 || (major === 22 && minor >= 12)) say("✓", `Node ${process.versions.node}`);
else
  say(
    "✗",
    `Node ${process.versions.node} is too old`,
    "This app needs Node 22.12 or newer: brew install node@22",
  );

if (!existsSync(".env.local")) {
  say(
    "!",
    ".env.local is missing",
    "Copy the example: cp .env.example .env.local (or set the variables in your shell).",
  );
}

const ownerUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
if (!ownerUrl) {
  say(
    "✗",
    "No database address",
    "Set DATABASE_URL and DATABASE_MIGRATION_URL: copy .env.example to .env.local.",
  );
} else {
  await database(ownerUrl, process.env.DATABASE_URL);
}

const storage = process.env.S3_ENDPOINT;
if (!storage) say("!", "S3_ENDPOINT is not set", "Uploads, recordings and exports need storage.");
else if (await answers(storage)) say("✓", `Storage answers at ${storage}`);
else
  say(
    "!",
    `Storage does not answer at ${storage}`,
    "Uploads, recordings and exports need it. Start it: docker compose up -d",
  );

const smtp = process.env.SMTP_URL;
if (!smtp) {
  say(
    "✓",
    "Mail is printed in the terminal of npm run dev and npm run worker",
    "To read it in a browser instead, set SMTP_URL=smtp://localhost:1025 in .env.local and open http://localhost:8025 (Mailpit).",
  );
} else {
  const target = URL.canParse(smtp) ? new URL(smtp) : null;
  if (target && (await listens(target.hostname, Number(target.port) || 25))) {
    say("✓", `Mail goes to ${target.hostname}:${target.port || 25}`);
  } else {
    say(
      "!",
      `Nothing answers at SMTP_URL (${smtp})`,
      "Sign-in mails cannot be sent. Start Mailpit: docker compose up -d",
    );
  }
}

const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
if (run(ffmpeg, ["-version"], 5_000).ok) say("✓", "ffmpeg is installed");
else
  say(
    "!",
    "ffmpeg was not found",
    "Only videos and recordings need it: brew install ffmpeg, then set FFMPEG_PATH in .env.local if the worker cannot find it.",
  );

if (!process.env.LLM_BASE_URL) {
  say(
    "✓",
    "AI features are off (LLM_BASE_URL is not set)",
    "Everything else works: hand-ins wait in the review queue for a person.",
  );
}

console.log(
  failures
    ? `\n${failures} problem${failures === 1 ? "" : "s"} to fix, then run npm run doctor again.`
    : "\nReady. Start the app in two terminals: npm run dev and npm run worker.",
);
process.exit(failures ? 1 : 0);

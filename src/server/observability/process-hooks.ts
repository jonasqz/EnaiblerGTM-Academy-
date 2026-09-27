import { reportError } from "@/server/observability/report";

/*
 * Imported by src/instrumentation.ts in the Node runtime only: a module of its
 * own, because the Edge build rejects process.on even behind a runtime check.
 */
process.on("unhandledRejection", (reason) => {
  void reportError(reason, { runtime: "web", extra: { kind: "unhandledRejection" } });
});

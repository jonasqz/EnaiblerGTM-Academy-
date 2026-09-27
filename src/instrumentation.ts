import type { Instrumentation } from "next";

/*
 * Server-side error reporting for the web container (brief §11: GlitchTip).
 * The worker reports its own (src/worker/index.ts).
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("@/server/observability/process-hooks");
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("@/server/observability/report");
  const host = request.headers.host;
  await reportError(error, {
    runtime: "web",
    route: context.routePath,
    method: request.method,
    path: request.path,
    extra: {
      host: Array.isArray(host) ? host[0] : host,
      routeType: context.routeType,
      digest: (error as { digest?: string } | null)?.digest,
    },
  });
};

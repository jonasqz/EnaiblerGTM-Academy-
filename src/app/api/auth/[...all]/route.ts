import { authFor } from "@/server/auth";
import { resolveTenant } from "@/server/tenant-resolver";

async function handle(request: Request): Promise<Response> {
  const tenant = await resolveTenant(request.headers.get("host"));
  if (!tenant || tenant.status !== "active") return new Response("Not found", { status: 404 });
  return authFor(tenant).handler(request);
}

export const GET = handle;
export const POST = handle;

import { sanitizeVerifyParams, verifyPath } from "@/server/magic-link-confirm";

/** Form POST from /sign-in/confirm → Better Auth's verify endpoint (303, same origin). */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const entries = [...form.entries()].flatMap(([key, value]) =>
    typeof value === "string" ? [[key, value] as [string, string]] : [],
  );
  const params = sanitizeVerifyParams(entries);
  const location = params ? verifyPath(params) : "/sign-in?error=invalid";
  return new Response(null, { status: 303, headers: { location } });
}

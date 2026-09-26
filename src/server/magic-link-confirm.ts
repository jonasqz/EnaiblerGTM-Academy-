/**
 * Parameters Better Auth puts on its magic-link verify URL. Our confirm step
 * (/sign-in/confirm → POST /api/sign-in/confirm) passes exactly these through,
 * so a link pre-fetched by a mail scanner does not consume the token.
 */
const TOKEN = /^[A-Za-z0-9_-]{16,256}$/;
const CALLBACK_KEYS = ["callbackURL", "newUserCallbackURL", "errorCallbackURL"] as const;

function isRelativePath(value: string): boolean {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    value.length <= 2048
  );
}

export function sanitizeVerifyParams(input: Iterable<[string, string]>): URLSearchParams | null {
  const source = new Map(input);
  const token = source.get("token");
  if (!token || !TOKEN.test(token)) return null;
  const params = new URLSearchParams({ token });
  for (const key of CALLBACK_KEYS) {
    const value = source.get(key);
    if (value === undefined) continue;
    if (!isRelativePath(value)) return null;
    params.set(key, value);
  }
  return params;
}

export function verifyPath(params: URLSearchParams): string {
  return `/api/auth/magic-link/verify?${params.toString()}`;
}

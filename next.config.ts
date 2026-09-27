import type { NextConfig } from "next";

import { FONT_LIBRARY } from "./src/core/theme/fonts";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Coolify container (see Dockerfile).
  output: "standalone",
  typedRoutes: true,
  // Keep our own CLAUDE.md: stop `next dev` from generating agent rule files.
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // No framing by other sites (clickjacking), except the path picker below.
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
      {
        // Later rules win for the same header: academies embed this on their websites.
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
  // Credential images read these font files at runtime (src/server/og-fonts.ts).
  // Keys are globs, so the brackets of the dynamic segment are escaped.
  outputFileTracingIncludes: {
    "/verify/\\[publicId\\]/image": [
      `./node_modules/@fontsource/{${FONT_LIBRARY.map((font) => font.id).join(",")}}/files/*-latin-{400,700}-normal.woff`,
    ],
  },
};

export default nextConfig;

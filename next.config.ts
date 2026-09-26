import type { NextConfig } from "next";

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
        ],
      },
    ];
  },
  // Credential images read these font files at runtime (src/server/og-fonts.ts).
  outputFileTracingIncludes: {
    "/verify/[publicId]/image": [
      "./node_modules/@fontsource/{inter,rubik,bungee}/files/*-latin-{400,700}-normal.woff",
    ],
  },
};

export default nextConfig;

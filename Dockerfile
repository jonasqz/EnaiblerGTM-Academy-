# syntax=docker/dockerfile:1.7
# One image recipe, two runtime targets (brief §11): `web` (Next.js standalone)
# and `worker` (pg-boss jobs, migrations and tenant tooling).

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Prune instead of a second `npm ci --omit=dev`: that re-runs install scripts of
# drizzle-kit's optional esbuild and fails; pruning keeps the tested tree.
FROM deps AS prod-deps
RUN npm prune --omit=dev

# --- web: the Next.js app (all tenants, one container) -----------------------
FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# --- worker: background jobs; also runs migrations and tenant manifests -------
FROM node:22-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
# ffmpeg: audio for transcription and keyframes from screen recordings (brief §7).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json tsconfig.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node config ./config
USER node
CMD ["node", "--import", "tsx", "src/worker/index.ts"]

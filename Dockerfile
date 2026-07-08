# syntax=docker/dockerfile:1.7

FROM node:20-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

FROM base AS build-deps

COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ ./patches/

RUN --mount=type=cache,id=destrava-pnpm-build,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store \
    && pnpm install --frozen-lockfile

FROM base AS prod-deps

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ ./patches/

RUN --mount=type=cache,id=destrava-pnpm-prod,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store \
    && pnpm install --prod --frozen-lockfile

FROM build-deps AS builder

COPY . .

ENV NODE_OPTIONS=--max-old-space-size=4096

RUN set -eu; \
    (while true; do echo "[destrava-build] build em andamento..."; sleep 20; done) & \
    HEARTBEAT_PID=$!; \
    trap 'kill "$HEARTBEAT_PID" 2>/dev/null || true; wait "$HEARTBEAT_PID" 2>/dev/null || true' EXIT; \
    pnpm run build; \
    trap - EXIT; \
    kill "$HEARTBEAT_PID" 2>/dev/null || true; \
    wait "$HEARTBEAT_PID" 2>/dev/null || true

RUN mkdir -p dist/assets && cp -r server/assets/. dist/assets/

FROM node:20-slim AS runner

USER root
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       fonts-freefont-ttf \
       fontconfig \
       libasound2 \
       libatk-bridge2.0-0 \
       libatk1.0-0 \
       libcairo2 \
       libcups2 \
       libdbus-1-3 \
       libdrm2 \
       libgbm1 \
       libnss3 \
       libpango-1.0-0 \
       libx11-6 \
       libx11-xcb1 \
       libxcb1 \
       libxcomposite1 \
       libxdamage1 \
       libxext6 \
       libxfixes3 \
       libxkbcommon0 \
       libxrandr2 \
       libxshmfence1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app/uploads /var/data/destrava /var/log/destrava /tmp/.chromium-config /tmp/.chromium-cache \
    && chown -R node:node /app /var/data/destrava /var/log/destrava /tmp/.chromium-config /tmp/.chromium-cache

WORKDIR /app

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/scripts ./scripts

ENV NODE_ENV=production
ENV PORT=4000
ENV DATA_DIR=/var/data/destrava
ENV REQUIRE_PERSISTENT_STORAGE=true
ENV PERSISTENT_STORAGE_CONFIGURED=false
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_BROWSER_PROVIDER=sparticuz
ENV HOME=/tmp
ENV XDG_CONFIG_HOME=/tmp/.chromium-config
ENV XDG_CACHE_HOME=/tmp/.chromium-cache


USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]

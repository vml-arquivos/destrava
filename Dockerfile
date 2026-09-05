# syntax=docker/dockerfile:1.7

FROM node:22.17.0-slim AS base

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

# Coolify's build context does not reliably preserve .git metadata (observed
# in production: .git/HEAD absent from this stage even though .dockerignore
# never excludes it). BUILD_COMMIT is best-effort: server/index.ts already
# falls back to "unknown" for anything that isn't a 40-hex-char sha (see
# resolveDestravaRelease), so the build must never hard-fail over this --
# a missing/invalid stamp here is a no-op at runtime, not an outage.
RUN set -eu; \
    commit="unknown"; \
    if [ -f .git/HEAD ]; then \
      commit="$(cat .git/HEAD)"; \
      case "$commit" in \
        ref:\ *) ref="${commit#ref: }"; [ -f ".git/$ref" ] && commit="$(cat ".git/$ref")" ;; \
      esac; \
    fi; \
    if [ "${#commit}" -ne 40 ] || [ -n "$(printf '%s' "$commit" | tr -d '0123456789abcdefABCDEF')" ]; then \
      commit="unknown"; \
    fi; \
    printf '%s\n' "$commit" > /app/BUILD_COMMIT

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

FROM node:22.17.0-slim AS runner

LABEL org.opencontainers.image.title="Destrava Crédito" \
      org.opencontainers.image.version="runtime-release"

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
       poppler-utils \
       unzip \
       tesseract-ocr \
       tesseract-ocr-por \
       tesseract-ocr-eng \
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
COPY --from=builder --chown=node:node /app/db ./db
COPY --from=builder --chown=node:node /app/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=builder --chown=node:node /app/BUILD_COMMIT ./BUILD_COMMIT

RUN chmod 755 /app/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=4000
# Keep an explicit env override for operators, but default to the build artifact
# generated from the exact Git checkout used by Coolify.
ENV DESTRAVA_RELEASE=
ENV DATA_DIR=/var/data/destrava
ENV REQUIRE_PERSISTENT_STORAGE=true
ENV PERSISTENT_STORAGE_CONFIGURED=false
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_BROWSER_PROVIDER=sparticuz
ENV MIGRATE_ON_STARTUP=false
ENV HOME=/tmp
ENV XDG_CONFIG_HOME=/tmp/.chromium-config
ENV XDG_CACHE_HOME=/tmp/.chromium-cache


USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]

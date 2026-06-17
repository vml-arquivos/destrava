# ─── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ ./patches/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

ENV NODE_OPTIONS=--max-old-space-size=4096

# Coolify encerra comandos longos sem saída útil. Mantém log ativo e preserva exit code.
RUN set -eu; \
    (while true; do echo "[destrava-build] vite build em andamento..."; sleep 20; done) & \
    HEARTBEAT_PID=$!; \
    pnpm exec vite build; \
    BUILD_STATUS=$?; \
    kill "$HEARTBEAT_PID" 2>/dev/null || true; \
    wait "$HEARTBEAT_PID" 2>/dev/null || true; \
    exit "$BUILD_STATUS"

RUN set -eu; \
    (while true; do echo "[destrava-build] esbuild backend em andamento..."; sleep 20; done) & \
    HEARTBEAT_PID=$!; \
    pnpm exec esbuild server/index.ts \
        --platform=node \
        --packages=external \
        --bundle \
        --format=esm \
        --outdir=dist; \
    BUILD_STATUS=$?; \
    kill "$HEARTBEAT_PID" 2>/dev/null || true; \
    wait "$HEARTBEAT_PID" 2>/dev/null || true; \
    exit "$BUILD_STATUS"

# Copiar assets de logos para dist/assets (lidos em runtime pelo logo_constants.ts)
RUN mkdir -p dist/assets && cp -r server/assets/. dist/assets/

# ─── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-slim AS runner

USER root
ENV DEBIAN_FRONTEND=noninteractive

# Chromium + dependências mínimas.
# O apt em Debian/Chromium pode ficar muito tempo em fases silenciosas; o heartbeat
# evita kill 255 do Coolify durante apt-get/dpkg sem alterar o resultado real.
RUN set -eu; \
    (while true; do echo "[destrava-build] instalando chromium/dependencias..."; sleep 20; done) & \
    HEARTBEAT_PID=$!; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        chromium \
        fonts-freefont-ttf \
        ca-certificates \
        wget; \
    APT_STATUS=$?; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/*; \
    kill "$HEARTBEAT_PID" 2>/dev/null || true; \
    wait "$HEARTBEAT_PID" 2>/dev/null || true; \
    exit "$APT_STATUS"

RUN set -eu; \
    (while true; do echo "[destrava-build] preparando pnpm runtime..."; sleep 20; done) & \
    HEARTBEAT_PID=$!; \
    corepack enable; \
    corepack prepare pnpm@10.4.1 --activate; \
    NPM_STATUS=$?; \
    kill "$HEARTBEAT_PID" 2>/dev/null || true; \
    wait "$HEARTBEAT_PID" 2>/dev/null || true; \
    exit "$NPM_STATUS"

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROMIUM_PATH=/usr/bin/chromium

# Diretórios de dados com permissões corretas ANTES de qualquer COPY
RUN mkdir -p /var/data/destrava /var/log/destrava \
    && chown -R node:node /var/data/destrava /var/log/destrava

USER node

WORKDIR /app

COPY --chown=node:node package.json pnpm-lock.yaml .npmrc ./
COPY --chown=node:node patches/ ./patches/

RUN --mount=type=cache,id=pnpm-store-prod,uid=1000,target=/home/node/.local/share/pnpm/store \
    set -eu; \
    (while true; do echo "[destrava-build] pnpm install prod em andamento..."; sleep 20; done) & \
    HEARTBEAT_PID=$!; \
    pnpm install --prod --frozen-lockfile; \
    PNPM_STATUS=$?; \
    kill "$HEARTBEAT_PID" 2>/dev/null || true; \
    wait "$HEARTBEAT_PID" 2>/dev/null || true; \
    exit "$PNPM_STATUS"

COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/scripts ./scripts

ENV NODE_ENV=production
ENV PORT=4000
ENV DATA_DIR=/var/data/destrava

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node", "dist/index.js"]

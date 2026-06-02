# ─── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

RUN npm install -g pnpm@10.4.1

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ ./patches/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

ENV NODE_OPTIONS=--max-old-space-size=4096
# Coolify encerra builds com muito tempo sem saída. O Vite pode ficar vários
# segundos/minutos em "transforming..." sem imprimir nada em projetos grandes;
# este heartbeat mantém o log ativo e preserva o exit code real do Vite.
RUN set -eu; \
    (while true; do echo "[destrava-build] vite build em andamento..."; sleep 25; done) & \
    HEARTBEAT_PID=$!; \
    pnpm exec vite build; \
    BUILD_STATUS=$?; \
    kill "$HEARTBEAT_PID" 2>/dev/null || true; \
    wait "$HEARTBEAT_PID" 2>/dev/null || true; \
    exit "$BUILD_STATUS"

# Mesmo tratamento para o bundle do backend: evita falso timeout por falta de log.
RUN set -eu; \
    (while true; do echo "[destrava-build] esbuild backend em andamento..."; sleep 25; done) & \
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
# node:20-slim (Debian) — Chromium via apt é muito mais leve que Alpine
# (Alpine puxa Mesa, LLVM, FFmpeg → ~189 dependências extras → timeout no build)
FROM node:20-slim AS runner

# Chromium + dependências mínimas
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-freefont-ttf \
    ca-certificates \
    wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# pnpm para instalar prod deps
RUN npm install -g pnpm@10.4.1 && npm cache clean --force

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROMIUM_PATH=/usr/bin/chromium

# Diretórios de dados com permissões corretas ANTES de qualquer COPY
RUN mkdir -p /var/data/destrava /var/log/destrava \
    && chown -R node:node /var/data/destrava /var/log/destrava

# USER node ANTES do pnpm install → elimina o chown -R /app final
# que causava timeout de ~260s sobre node_modules no Coolify
USER node

WORKDIR /app

COPY --chown=node:node package.json pnpm-lock.yaml .npmrc ./
COPY --chown=node:node patches/ ./patches/

RUN --mount=type=cache,id=pnpm-store-prod,uid=1000,target=/home/node/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile

COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/scripts ./scripts

ENV NODE_ENV=production
ENV PORT=4000
ENV DATA_DIR=/var/data/destrava

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node", "dist/index.js"]

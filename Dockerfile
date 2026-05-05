# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN npm install -g pnpm@10.4.1

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ ./patches/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

RUN ls -la node_modules/scheduler && ls -la node_modules/scheduler/index.js

COPY . .

# Diagnóstico explícito do ambiente
RUN node -v && npm -v && pnpm -v

# Build do frontend
# VITE_ADMIN_KEY é injetada pelo Coolify como variável de ambiente em build-time
RUN pnpm exec vite build

# Build do backend
RUN pnpm exec esbuild server/index.ts \
    --platform=node \
    --packages=external \
    --bundle \
    --format=esm \
    --outdir=dist

# ─── Stage 2: Production ─────────────────────────────────────────────────────
# Alpine com Chromium mínimo — evita pull de imagem Puppeteer (~700 MB)
# que estourava o timeout do Coolify antes do pnpm terminar.
# font-noto e font-noto-cjk foram removidos: puxavam Mesa, LLVM e FFmpeg
# (194 pacotes / 850 MB) desnecessários para Chromium headless em PT-BR.
FROM node:20-alpine AS runner

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    wget \
    && npm install -g pnpm@10.4.1

# Puppeteer: usar Chromium do sistema, sem baixar binário próprio
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

WORKDIR /app

RUN mkdir -p /var/data/destrava /var/log/destrava && \
    chown -R node:node /var/data/destrava /var/log/destrava /app

COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ ./patches/

# Depende do builder via COPY --from, forçando serialização:
# o pnpm install do runner só começa depois do build completo,
# eliminando a concorrência de I/O que causava OOM nos deploys anteriores.
COPY --from=builder /app/dist ./dist

RUN --mount=type=cache,id=pnpm-store-runner,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

# Scripts para execução manual dentro do container (migração, diagnóstico, criar usuário)
COPY --from=builder /app/scripts ./scripts

USER node

# Valores padrão — variáveis reais injetadas pelo Coolify em runtime
ENV NODE_ENV=production
ENV PORT=4000
ENV DATA_DIR=/var/data/destrava

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node", "dist/index.js"]

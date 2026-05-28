# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN npm install -g pnpm@10.4.1

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ ./patches/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

RUN pnpm exec vite build

RUN pnpm exec esbuild server/index.ts \
    --platform=node \
    --packages=external \
    --bundle \
    --format=esm \
    --outdir=dist

# ─── Stage 2: Production ──────────────────────────────────────────────────────
# Usando node:20-slim (Debian) em vez de Alpine para evitar o problema do
# Chromium no Alpine que puxa ~189 dependências pesadas (Mesa, LLVM, FFmpeg)
# causando timeout no build.
FROM node:20-slim AS runner

# Instala Chromium e dependências mínimas via apt (muito mais leve no Debian)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-freefont-ttf \
    ca-certificates \
    wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Instala pnpm globalmente
RUN npm install -g pnpm@10.4.1 && npm cache clean --force

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROMIUM_PATH=/usr/bin/chromium

# Criar diretórios de dados com dono correto ANTES de qualquer COPY/RUN
RUN mkdir -p /var/data/destrava /var/log/destrava \
    && chown -R node:node /var/data/destrava /var/log/destrava

# Mudar para node ANTES de instalar dependências — elimina o chown -R /app
# final que levava ~260s sobre node_modules e causava timeout no Coolify.
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

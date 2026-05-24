# ─── Stage 1: Build ──────────────────────────────────────────────────────────
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

# ─── Stage 2: Production ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Instala Chromium e limpa cache na mesma layer para não inflar a imagem
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    wget \
    && npm install -g pnpm@10.4.1 \
    && rm -rf /root/.npm /tmp/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

WORKDIR /app

RUN mkdir -p /var/data/destrava /var/log/destrava \
    && chown -R node:node /var/data/destrava /var/log/destrava /app

COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ ./patches/

# Instala prod deps como root, depois passa para node
RUN --mount=type=cache,id=pnpm-store-prod,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile \
    && pnpm store prune \
    && rm -rf /root/.local/share/pnpm/store /tmp/*

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts

# Corrige ownership de tudo de uma vez só
RUN chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV PORT=4000
ENV DATA_DIR=/var/data/destrava

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node", "dist/index.js"]

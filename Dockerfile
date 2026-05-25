# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN npm install -g pnpm@10.4.1

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ ./patches/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

# Build do frontend
RUN pnpm exec vite build

# Build do backend
RUN pnpm exec esbuild server/index.ts \
    --platform=node \
    --packages=external \
    --bundle \
    --format=esm \
    --outdir=dist

# ─── Stage 2: Production ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Instala apenas o chromium do sistema (Alpine) + wget para healthcheck.
# @sparticuz/chromium NÃO é instalado aqui: ele serve apenas para ambientes
# serverless/Lambda. No container, CHROMIUM_PATH aponta para o binário do
# sistema e o bloco `import('@sparticuz/chromium')` nunca é executado.
# Remover @sparticuz/chromium do stage de produção reduz a imagem em ~170 MB
# e elimina o travamento no "exporting layers" causado por imagem muito grande.
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    wget \
    && npm install -g pnpm@10.4.1

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

WORKDIR /app

RUN mkdir -p /var/data/destrava/uploads/contratos \
             /var/data/destrava/uploads/previsoes \
             /var/data/destrava/uploads/declaracoes \
             /var/data/destrava/uploads/empresas \
             /var/log/destrava && \
    chown -R node:node /var/data/destrava /var/log/destrava /app

COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ ./patches/

# Instala dependências de produção excluindo @sparticuz/chromium.
# O pacote é listado como optional no package.json; pnpm --prod o ignora
# por padrão quando optional não é solicitado.
RUN --mount=type=cache,id=pnpm-store-prod,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

USER node

ENV NODE_ENV=production
ENV PORT=4000
ENV DATA_DIR=/var/data/destrava

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget -qO- http://localhost:4000/api/health || exit 1

ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]

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

ARG VITE_ADMIN_KEY
ENV VITE_ADMIN_KEY=$VITE_ADMIN_KEY

# Diagnóstico explícito do ambiente
RUN node -v && npm -v && pnpm -v

# Build do frontend isolado, com log detalhado
RUN pnpm exec vite build --debug

# Build do backend isolado
RUN pnpm exec esbuild server/index.ts \
    --platform=node \
    --packages=external \
    --bundle \
    --format=esm \
    --outdir=dist

# ─── Stage 2: Production ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache wget && npm install -g pnpm@10.4.1

WORKDIR /app

RUN mkdir -p /var/data/destrava /var/log/destrava && \
    chown -R node:node /var/data/destrava /var/log/destrava /app

COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ ./patches/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
# Copia scripts e migração SQL para o container de produção
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/db/migrate.sql ./db/migrate.sql

# Entrypoint: executa migração antes de iniciar o servidor
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node

# Valores padrão seguros — variáveis reais injetadas pelo Coolify em runtime
ENV NODE_ENV=production
ENV PORT=4000
ENV DATA_DIR=/var/data/destrava

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]

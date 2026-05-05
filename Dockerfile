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
# A imagem oficial do Puppeteer já inclui Chrome for Testing e as dependências
# necessárias para execução headless, evitando o apk add de Chromium no Alpine
# que puxava centenas de pacotes e aumentava o risco de OOM no deploy.
FROM ghcr.io/puppeteer/puppeteer:24.42.0 AS runner

USER root
RUN npm install -g pnpm@10.4.1

# Puppeteer: usar o Chrome já presente na imagem oficial, sem baixar binário.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV CHROMIUM_PATH=/usr/bin/google-chrome-stable

WORKDIR /app
RUN mkdir -p /var/data/destrava /var/log/destrava /app && \
    chown -R pptruser:pptruser /var/data/destrava /var/log/destrava /app

# Copiar o build antes da instalação de produção força o runner a depender do
# builder, evitando que o install completo e o install de produção rodem em
# paralelo no BuildKit em ambientes com pouca memória.
COPY --from=builder --chown=pptruser:pptruser /app/dist ./dist
COPY --chown=pptruser:pptruser package.json pnpm-lock.yaml .npmrc ./
COPY --chown=pptruser:pptruser patches/ ./patches/
RUN --mount=type=cache,id=pnpm-store-runner,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

# Copia scripts para execução manual dentro do container (migração, diagnóstico, criar usuário)
COPY --from=builder --chown=pptruser:pptruser /app/scripts ./scripts

USER pptruser

# Valores padrão — variáveis reais injetadas pelo Coolify em runtime
ENV NODE_ENV=production
ENV PORT=4000
ENV DATA_DIR=/var/data/destrava
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]

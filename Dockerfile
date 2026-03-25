# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Instalar pnpm
RUN npm install -g pnpm@10.4.1

WORKDIR /app

# Copiar arquivos de dependências
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Instalar dependências (incluindo devDependencies para o build)
RUN pnpm install --frozen-lockfile

# Copiar todo o código fonte
COPY . .

# Build: frontend (Vite) + backend (esbuild)
RUN pnpm run build

# ─── Stage 2: Production ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Instalar pnpm
RUN npm install -g pnpm@10.4.1

WORKDIR /app

# Criar diretórios necessários
RUN mkdir -p /var/data/destrava /var/log/destrava && \
    chown -R node:node /var/data/destrava /var/log/destrava

# Copiar package.json para instalar apenas dependências de produção
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Instalar apenas dependências de produção
RUN pnpm install --frozen-lockfile --prod

# Copiar o build gerado no stage anterior
COPY --from=builder /app/dist ./dist

# Usar usuário não-root por segurança
USER node

# Variáveis de ambiente padrão (podem ser sobrescritas no Coolify)
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/var/data/destrava
ENV ADMIN_KEY=destrava2024admin

# Expor porta
EXPOSE 3000

# Healthcheck para o Coolify monitorar
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Iniciar o servidor
CMD ["node", "dist/index.js"]

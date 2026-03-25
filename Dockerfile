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

# Criar diretórios necessários com permissões corretas
RUN mkdir -p /var/data/destrava /var/log/destrava && \
    chown -R node:node /var/data/destrava /var/log/destrava /app

# Copiar package.json para instalar apenas dependências de produção
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Instalar apenas dependências de produção
RUN pnpm install --frozen-lockfile --prod

# Copiar o build gerado no stage anterior
COPY --from=builder /app/dist ./dist

# Usar usuário não-root por segurança
USER node

# Variáveis de ambiente padrão
# NOTA: PORT=4000 evita conflito com Chatwoot (3000) na mesma VPS
# O Traefik/Coolify roteia destrava.permupay.com.br → container:4000
ENV NODE_ENV=production
ENV PORT=4000
ENV DATA_DIR=/var/data/destrava
ENV ADMIN_KEY=destrava2024admin
ENV SITE_DOMAIN=destrava.permupay.com.br

# Expor porta interna (Traefik faz o roteamento externo 80/443)
EXPOSE 4000

# Healthcheck para o Coolify monitorar
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

# Iniciar o servidor
CMD ["node", "dist/index.js"]

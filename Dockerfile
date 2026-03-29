# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Instalar pnpm
RUN npm install -g pnpm@10.4.1

WORKDIR /app

# Copiar arquivos de configuração do pnpm (incluindo .npmrc com public-hoist-pattern)
# O .npmrc garante que 'scheduler' tenha symlink em node_modules/ raiz.
COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ ./patches/

# Instalar dependências (incluindo devDependencies para o build)
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Garantir que scheduler tem symlink (falha o build se não estiver)
RUN ls node_modules/scheduler/index.js && echo "OK: scheduler symlink presente"

# Copiar todo o código fonte
COPY . .

# ─── Variáveis de build do Vite ───────────────────────────────────────────────
# Apenas VITE_ADMIN_KEY é necessária em build-time (usada no painel do colaborador).
# DATABASE_URL e JWT_SECRET são variáveis de runtime — não são bakeadas no bundle.
# Defina no Coolify em: Settings > Build Args > VITE_ADMIN_KEY=<sua-chave>
ARG VITE_ADMIN_KEY
ENV VITE_ADMIN_KEY=$VITE_ADMIN_KEY

# Build: frontend (Vite) + backend (esbuild)
RUN pnpm run build

# ─── Stage 2: Production ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Instalar pnpm e wget (necessário para o healthcheck)
RUN apk add --no-cache wget && npm install -g pnpm@10.4.1

WORKDIR /app

# Criar diretórios necessários com permissões corretas
RUN mkdir -p /var/data/destrava /var/log/destrava && \
    chown -R node:node /var/data/destrava /var/log/destrava /app

# Copiar arquivos de configuração
COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ ./patches/

# Instalar apenas dependências de produção
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

# Copiar o build gerado no stage anterior
COPY --from=builder /app/dist ./dist

# Usar usuário não-root por segurança
USER node

# Variáveis de ambiente padrão
# NOTA: PORT=4000 evita conflito com Chatwoot (3000) na mesma VPS
ENV NODE_ENV=production
ENV PORT=4000
ENV DATA_DIR=/var/data/destrava
ENV SITE_DOMAIN=destrava.permupay.com.br
# DATABASE_URL, JWT_SECRET e ADMIN_KEY devem ser definidos via Environment Variables no Coolify

# Expor porta interna (Traefik faz o roteamento externo 80/443)
EXPOSE 4000

# Healthcheck para o Coolify monitorar
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

# Iniciar o servidor
CMD ["node", "dist/index.js"]

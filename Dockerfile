# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Instalar pnpm
RUN npm install -g pnpm@10.4.1

WORKDIR /app

# Copiar arquivos de configuração do pnpm (incluindo .npmrc com public-hoist-pattern)
# O .npmrc garante que 'scheduler' tenha symlink em node_modules/ raiz.
# Sem isso o Rollup trata "scheduler" como módulo externo e o browser falha:
# "Failed to resolve module specifier scheduler"
COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ ./patches/

# Instalar dependências (incluindo devDependencies para o build)
# --mount=type=cache: o pnpm store persiste em disco entre builds no mesmo host.
# Primeira execução: baixa tudo (~55s). Execuções seguintes: lê do cache (~5s).
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Garantir que scheduler tem symlink (falha o build se não estiver)
RUN ls node_modules/scheduler/index.js && echo "OK: scheduler symlink presente"

# Copiar todo o código fonte
COPY . .

# ─── Variáveis de build do Vite (OBRIGATÓRIAS) ───────────────────────────────
# O Vite bake essas variáveis no bundle em build-time via import.meta.env.
# Devem ser definidas como Build Args no Coolify (Settings > Build Args):
#   VITE_SUPABASE_URL=https://<project>.supabase.co
#   VITE_SUPABASE_ANON_KEY=<anon-key>
# Sem elas o bundle usa undefined e o login falha com placeholder.supabase.co.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Validar que as variáveis foram fornecidas antes de buildar
RUN if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; then \
      echo "ERRO: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY sao obrigatorias como Build Args no Coolify." && exit 1; \
    fi

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
# Mesmo cache mount do builder — reutiliza pacotes já baixados no Stage 1.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

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
ENV SITE_DOMAIN=destrava.permupay.com.br
# ADMIN_KEY deve ser definido via variáveis de ambiente no Coolify (não hardcoded aqui)

# Expor porta interna (Traefik faz o roteamento externo 80/443)
EXPOSE 4000

# Healthcheck para o Coolify monitorar
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

# Iniciar o servidor
CMD ["node", "dist/index.js"]

#!/bin/bash

# ============================================
# SCRIPT DE INSTALAÇÃO - DESTRAVA CRÉDITO
# ============================================
# Este script instala e configura a aplicação
# na VPS de forma automática e segura

set -e

echo "================================"
echo "INSTALAÇÃO DESTRAVA CRÉDITO"
echo "================================"
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================
# PASSO 1: Verificar Node.js
# ============================================
echo -e "${YELLOW}[1/6] Verificando Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js não encontrado!${NC}"
    echo "Instale Node.js 18+ e tente novamente"
    exit 1
fi
NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js ${NODE_VERSION} encontrado${NC}"

# ============================================
# PASSO 2: Verificar npm/pnpm
# ============================================
echo -e "${YELLOW}[2/6] Verificando gerenciador de pacotes...${NC}"
if ! command -v pnpm &> /dev/null; then
    echo "Instalando pnpm..."
    npm install -g pnpm
fi
PNPM_VERSION=$(pnpm -v)
echo -e "${GREEN}✓ pnpm ${PNPM_VERSION} pronto${NC}"

# ============================================
# PASSO 3: Instalar dependências
# ============================================
echo -e "${YELLOW}[3/6] Instalando dependências...${NC}"
pnpm install --frozen-lockfile
echo -e "${GREEN}✓ Dependências instaladas${NC}"

# ============================================
# PASSO 4: Configurar variáveis de ambiente
# ============================================
echo -e "${YELLOW}[4/6] Configurando variáveis de ambiente...${NC}"
if [ ! -f .env.production ]; then
    cp .env.production.example .env.production 2>/dev/null || true
    echo -e "${YELLOW}⚠ Arquivo .env.production criado. EDITE COM SEUS DADOS!${NC}"
fi
echo -e "${GREEN}✓ Variáveis de ambiente configuradas${NC}"

# ============================================
# PASSO 5: Build para produção
# ============================================
echo -e "${YELLOW}[5/6] Compilando aplicação...${NC}"
pnpm build
echo -e "${GREEN}✓ Build concluído${NC}"

# ============================================
# PASSO 6: Instalar PM2 (gerenciador de processos)
# ============================================
echo -e "${YELLOW}[6/6] Configurando PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

# Criar arquivo de configuração PM2
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'destrava-credito',
    script: './dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M'
  }]
};
EOF

echo -e "${GREEN}✓ PM2 configurado${NC}"

# ============================================
# RESUMO FINAL
# ============================================
echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}✓ INSTALAÇÃO CONCLUÍDA!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "Próximos passos:"
echo ""
echo "1. EDITE o arquivo .env.production com seus dados:"
echo "   - Supabase PostgreSQL URL"
echo "   - N8n URL e API Key"
echo ""
echo "2. INICIE a aplicação:"
echo "   pm2 start ecosystem.config.js"
echo ""
echo "3. CONFIGURE Nginx como proxy reverso (opcional)"
echo ""
echo "4. ACESSE: http://seu-dominio.com.br:3001"
echo ""

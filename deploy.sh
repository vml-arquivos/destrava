#!/bin/bash
# ─── Destrava Crédito - Script de Deploy para Google Cloud VPS ───────────────
# Uso: bash deploy.sh
# Requisitos: Node.js 18+, pnpm, PM2, Nginx

set -e

echo "🚀 Iniciando deploy do Destrava Crédito..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── Variáveis ────────────────────────────────────────────────────────────────
APP_DIR="/var/www/destrava-credito"
DATA_DIR="/var/data/destrava"
LOG_DIR="/var/log/destrava"
REPO_URL="https://github.com/vml-arquivos/destrava.git"
BRANCH="main"

# ─── Criar diretórios necessários ─────────────────────────────────────────────
echo "📁 Criando diretórios..."
sudo mkdir -p "$APP_DIR" "$DATA_DIR" "$LOG_DIR"
sudo chown -R $USER:$USER "$APP_DIR" "$DATA_DIR" "$LOG_DIR"

# ─── Clonar ou atualizar repositório ──────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  echo "🔄 Atualizando repositório..."
  cd "$APP_DIR"
  git pull origin "$BRANCH"
else
  echo "📥 Clonando repositório..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# ─── Instalar dependências ────────────────────────────────────────────────────
echo "📦 Instalando dependências..."
pnpm install --frozen-lockfile

# ─── Build ────────────────────────────────────────────────────────────────────
echo "🔨 Fazendo build..."
NODE_ENV=production pnpm run build

# ─── Criar diretório de logs ──────────────────────────────────────────────────
mkdir -p logs

# ─── Configurar variáveis de ambiente ─────────────────────────────────────────
if [ ! -f ".env" ]; then
  echo "⚙️  Criando arquivo .env..."
  cp .env.example .env
  echo "⚠️  ATENÇÃO: Edite o arquivo .env com suas configurações antes de continuar!"
fi

# ─── Iniciar/Reiniciar com PM2 ────────────────────────────────────────────────
echo "🔄 Reiniciando aplicação com PM2..."
if pm2 list | grep -q "destrava-credito"; then
  pm2 reload destrava-credito --update-env
else
  pm2 start ecosystem.config.js --env production
fi

pm2 save

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deploy concluído com sucesso!"
echo ""
echo "📊 Status da aplicação:"
pm2 status destrava-credito
echo ""
echo "🌐 A aplicação está rodando na porta 3000"
echo "📝 Logs: pm2 logs destrava-credito"
echo "🔧 Para configurar Nginx, execute: sudo bash nginx-setup.sh"

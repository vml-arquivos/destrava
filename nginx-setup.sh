#!/bin/bash
# ─── Destrava Crédito — Configuração do Nginx ────────────────────────────────
# ATENÇÃO: Use este script apenas para deploy MANUAL (sem Coolify).
# Se você usa Coolify, o Traefik já faz o proxy reverso — este script
# NÃO é necessário.
#
# Uso: sudo bash nginx-setup.sh [dominio]
# Exemplo: sudo bash nginx-setup.sh destrava.permupay.com.br
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DOMAIN="${1:-destrava.permupay.com.br}"
APP_PORT=4000   # PORTA 4000: evita conflito com Chatwoot (3000) na mesma VPS
CONF_FILE="/etc/nginx/sites-available/destrava-credito"

echo "🔧 Configurando Nginx para: $DOMAIN → porta $APP_PORT"

# Verificar se nginx está instalado
if ! command -v nginx &>/dev/null; then
    echo "📦 Instalando Nginx..."
    apt-get update -qq && apt-get install -y nginx
fi

# Criar diretório para ACME challenge (certbot)
mkdir -p /var/www/certbot

# ── Criar configuração do Nginx ───────────────────────────────────────────────
cat > "$CONF_FILE" << NGINX_EOF
# Destrava Crédito — Nginx config
# Gerado por nginx-setup.sh em $(date '+%Y-%m-%d %H:%M:%S')

# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    # ACME challenge para Let's Encrypt
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;

    # SSL — Let's Encrypt (certbot)
    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    ssl_protocols             TLSv1.2 TLSv1.3;
    ssl_ciphers               ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_cache         shared:SSL:10m;
    ssl_session_timeout       1d;

    # Cabeçalhos de segurança
    add_header X-Frame-Options        "SAMEORIGIN"                      always;
    add_header X-Content-Type-Options "nosniff"                         always;
    add_header X-XSS-Protection       "1; mode=block"                   always;
    add_header Referrer-Policy        "strict-origin-when-cross-origin" always;

    # Gzip
    gzip            on;
    gzip_vary       on;
    gzip_proxied    any;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml image/svg+xml font/woff font/woff2;

    # Proxy → Node.js porta $APP_PORT
    location / {
        proxy_pass         http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade            \$http_upgrade;
        proxy_set_header   Connection         "upgrade";
        proxy_set_header   Host               \$host;
        proxy_set_header   X-Real-IP          \$remote_addr;
        proxy_set_header   X-Forwarded-For    \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto  \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;
    }

    # Cache de assets estáticos (Vite gera hashes nos nomes)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp|avif)$ {
        proxy_pass       http://127.0.0.1:$APP_PORT;
        proxy_set_header Host             \$host;
        proxy_set_header X-Forwarded-For  \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        expires          1y;
        add_header       Cache-Control "public, immutable";
        access_log       off;
    }

    # API routes
    location /api/ {
        proxy_pass         http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;
    }

    client_max_body_size 10M;

    access_log /var/log/nginx/destrava-credito-access.log;
    error_log  /var/log/nginx/destrava-credito-error.log warn;
}
NGINX_EOF

echo "✅ Arquivo de configuração criado: $CONF_FILE"

# Ativar o site
ln -sf "$CONF_FILE" /etc/nginx/sites-enabled/destrava-credito
echo "🔗 Site ativado em sites-enabled"

# Desativar o default se existir
if [ -f /etc/nginx/sites-enabled/default ]; then
    rm -f /etc/nginx/sites-enabled/default
    echo "🗑️  Site 'default' desativado"
fi

# Testar configuração
echo "🔍 Testando configuração do Nginx..."
nginx -t

# Recarregar Nginx
systemctl reload nginx
echo "🔄 Nginx recarregado"

echo ""
echo "═══════════════════════════════════════════════════"
echo "✅ Nginx configurado com sucesso!"
echo ""
echo "🌐 Site disponível em: http://$DOMAIN"
echo "   (redireciona para HTTPS após configurar SSL)"
echo ""
echo "🔒 Para configurar SSL com Let's Encrypt:"
echo "   sudo apt install -y certbot python3-certbot-nginx"
echo "   sudo certbot --nginx -d $DOMAIN"
echo ""
echo "⚠️  Certifique-se de que a aplicação Node.js"
echo "   está rodando na porta $APP_PORT:"
echo "   pm2 start ecosystem.config.js --env production"
echo "═══════════════════════════════════════════════════"

#!/bin/bash
# ─── Destrava Crédito - Configuração do Nginx ────────────────────────────────
# Uso: sudo bash nginx-setup.sh seu-dominio.com.br

set -e

DOMAIN="${1:-destravacredito.com.br}"
APP_PORT=3000

echo "🔧 Configurando Nginx para domínio: $DOMAIN"

# Criar configuração do Nginx
cat > /etc/nginx/sites-available/destrava-credito << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    # Redirecionar para HTTPS (após configurar SSL)
    # return 301 https://\$host\$request_uri;

    # Configurações de segurança
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml application/json;

    # Proxy para a aplicação Node.js
    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }

    # Cache para assets estáticos
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_set_header Host \$host;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Ativar o site
ln -sf /etc/nginx/sites-available/destrava-credito /etc/nginx/sites-enabled/

# Testar configuração
nginx -t

# Recarregar Nginx
systemctl reload nginx

echo "✅ Nginx configurado com sucesso!"
echo ""
echo "🔒 Para configurar SSL com Let's Encrypt:"
echo "   sudo apt install certbot python3-certbot-nginx"
echo "   sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo ""
echo "🌐 Site disponível em: http://$DOMAIN"

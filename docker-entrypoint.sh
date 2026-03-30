#!/bin/sh
# DESTRAVA CRÉDITO — Entrypoint Docker
# Executa a migração do banco antes de iniciar o servidor.
# Idempotente: seguro em todo redeploy.
set -e

echo "🗄️  [entrypoint] Executando migração do banco..."
node /app/scripts/migrate-db.mjs

echo "🚀 [entrypoint] Iniciando servidor..."
exec "$@"

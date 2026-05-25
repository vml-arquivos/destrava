#!/bin/sh
# DESTRAVA CRÉDITO — Entrypoint Docker
# Aguarda o PostgreSQL estar disponível antes de iniciar o servidor.
# Migração de banco deve ser executada manualmente via:
#   docker exec -it <container> node scripts/migrate-db.mjs
set -e

echo "[STARTUP] Aguardando PostgreSQL..."
i=0
until node -e "
  const { Pool } = (await import('pg')).default || (await import('pg'));
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  p.query('SELECT 1').then(() => { p.end(); process.exit(0); }).catch(() => process.exit(1));
" 2>/dev/null; do
  i=$((i+1))
  if [ "$i" -ge 20 ]; then
    echo "[STARTUP] PostgreSQL não respondeu após 60s. Abortando."
    exit 1
  fi
  echo "[STARTUP] Tentativa $i/20 — aguardando 3s..."
  sleep 3
done

echo "[STARTUP] PostgreSQL OK. Iniciando servidor..."
exec "$@"

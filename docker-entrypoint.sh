#!/bin/sh
# DESTRAVA CRÉDITO — Entrypoint Docker
# Por padrão inicia o servidor sem mutar o banco. Quando o operador habilita
# MIGRATE_ON_STARTUP=true, executa a migração versionada e só sobe o processo
# principal depois do COMMIT. A execução manual continua disponível.
set -e

if [ "${MIGRATE_ON_STARTUP:-false}" = "true" ]; then
  node scripts/migrate-db.mjs
fi

exec "$@"

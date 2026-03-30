#!/bin/sh
# DESTRAVA CRÉDITO — Entrypoint Docker
# Inicia o servidor apenas.
# Migração de banco deve ser executada manualmente via:
#   docker exec -it <container> node scripts/migrate-db.mjs
set -e
exec "$@"

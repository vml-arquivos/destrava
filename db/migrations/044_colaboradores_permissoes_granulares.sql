-- Migration: 044_colaboradores_permissoes_granulares.sql
-- Sistema Destrava Crédito
-- Corrige/instala permissões granulares dos colaboradores

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS permissoes JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS permissoes_atualizadas_por UUID NULL,
  ADD COLUMN IF NOT EXISTS permissoes_atualizadas_em TIMESTAMPTZ NULL;

UPDATE colaboradores
SET permissoes = '{}'::jsonb
WHERE permissoes IS NULL;

CREATE INDEX IF NOT EXISTS idx_colaboradores_permissoes_gin
ON colaboradores USING GIN (permissoes);

CREATE TABLE IF NOT EXISTS auditoria_permissoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL,
  alterado_por UUID NULL,
  antes JSONB,
  depois JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_permissoes_colaborador_id
ON auditoria_permissoes (colaborador_id);

CREATE INDEX IF NOT EXISTS idx_auditoria_permissoes_created_at
ON auditoria_permissoes (created_at);

COMMIT;

-- =============================================================================
-- ROLLBACK: rollback_captadores_v1.sql
-- Objetivo: Reverter a migração migrate_captadores_v1.sql
-- Banco: postgres (destravadb) — produção
-- Usuário necessário: postgres
-- Segurança: idempotente — usa IF EXISTS
-- Data: 2026-03-31
-- =============================================================================

BEGIN;

-- ─── Remover índices ──────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_empresas_captador_id;
DROP INDEX IF EXISTS public.idx_leads_captador_id;
DROP INDEX IF EXISTS public.idx_colaboradores_telefone;

-- ─── Remover colunas ──────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.empresas     DROP COLUMN IF EXISTS captador_id;
ALTER TABLE public.leads        DROP COLUMN IF EXISTS captador_id;
ALTER TABLE public.colaboradores DROP COLUMN IF EXISTS telefone;
-- =============================================================================
-- MIGRAÇÃO: migrate_captadores_v1.sql
-- Objetivo: Adicionar suporte a Captadores no sistema Destrava Crédito
-- Banco: postgres (destravadb) — produção
-- Usuário necessário: postgres (owner das tabelas leads, clientes)
--                     destravadb (owner da tabela empresas)
-- Segurança: 100% idempotente — usa IF NOT EXISTS e verificações de existência
-- Data: 2026-03-31
-- Commit base: f882f0a (HEAD)
-- =============================================================================
--
-- ── O QUE ESTA MIGRAÇÃO FAZ ───────────────────────────────────────────────────
--
-- 1. Adiciona coluna `captador_id` na tabela `empresas` (FK → colaboradores.id)
--    → Permite vincular uma empresa a um captador específico
--
-- 2. Adiciona coluna `captador_id` na tabela `leads` (FK → colaboradores.id)
--    → Permite rastrear qual captador trouxe o lead
--
-- 3. Cria índices de performance para as novas colunas
--
-- ── O QUE NÃO MUDA ────────────────────────────────────────────────────────────
--
-- - A coluna `cargo` da tabela `colaboradores` é TEXT livre — nenhuma constraint
--   de CHECK existe nela. O valor 'captador' pode ser inserido diretamente.
--   Não é necessário ALTER TABLE para adicionar o cargo.
--
-- - Nenhuma tabela existente é removida ou alterada de forma destrutiva.
--
-- ── COMO EXECUTAR ─────────────────────────────────────────────────────────────
--
-- Para tabelas com owner=postgres (leads):
--   docker exec -i <container_postgres> psql -U postgres -d postgres -f /path/migrate_captadores_v1.sql
--
-- Para tabela empresas (owner=destravadb):
--   docker exec -i <container_postgres> psql -U destravadb -d postgres -f /path/migrate_captadores_v1.sql
--
-- Recomendado: executar com -U postgres para ter permissão em todas as tabelas.
--
-- ── ROLLBACK ──────────────────────────────────────────────────────────────────
-- Ver rollback_captadores_v1.sql
-- =============================================================================

BEGIN;

-- ─── 0. Adicionar coluna `telefone` na tabela colaboradores ─────────────────────
-- Necessário para identificar captadores pelo telefone no webhook do Chatwoot.
-- Coluna é nullable — colaboradores existentes não são afetados.
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS telefone TEXT;

CREATE INDEX IF NOT EXISTS idx_colaboradores_telefone
  ON public.colaboradores(telefone) WHERE telefone IS NOT NULL;

-- ─── 1. Adicionar captador_id na tabela empresas ──────────────────────────────
-- Tabela empresas tem owner=destravadb. Coluna é nullable (captador é opcional).
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS captador_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL;

-- ─── 2. Adicionar captador_id na tabela leads ─────────────────────────────────
-- Tabela leads tem owner=postgres. Coluna é nullable.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS captador_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL;

-- ─── 3. Índices de performance ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_empresas_captador_id
  ON public.empresas(captador_id) WHERE captador_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_captador_id
  ON public.leads(captador_id) WHERE captador_id IS NOT NULL;

-- ─── 4. Verificação pós-migração ──────────────────────────────────────────────
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('empresas', 'leads')
  AND column_name = 'captador_id'
ORDER BY table_name;

COMMIT;

-- ============================================================
-- DESTRAVA CRÉDITO — Migração: Vínculo Simulações ↔ Empresas
-- Versão: v1.0 — 30/03/2026
-- Ambiente: VPS / Coolify / PostgreSQL 17 nativo
-- Idempotente: seguro para reexecutar a qualquer momento
-- Sem Supabase, sem RLS, sem auth.uid()
-- ============================================================

-- ─── OBJETIVO ────────────────────────────────────────────────
-- 1. Adicionar empresa_id em simulacoes_colaborador
-- 2. Adicionar empresa_id em leads
-- 3. Adicionar empresa_id em triagem_leads
-- 4. Garantir que empresa_historico existe (já criada pelo auto-migrate do servidor)
-- 5. Criar índices para performance
-- ─────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. Coluna empresa_id em simulacoes_colaborador ──────────
ALTER TABLE public.simulacoes_colaborador
  ADD COLUMN IF NOT EXISTS empresa_id UUID
  REFERENCES public.empresas(id) ON DELETE SET NULL;

ALTER TABLE public.simulacoes_colaborador
  ADD COLUMN IF NOT EXISTS cliente_empresa TEXT;

-- ─── 2. Coluna empresa_id em leads ───────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS empresa_id UUID
  REFERENCES public.empresas(id) ON DELETE SET NULL;

-- ─── 3. Coluna empresa_id em triagem_leads ───────────────────
ALTER TABLE public.triagem_leads
  ADD COLUMN IF NOT EXISTS empresa_id UUID
  REFERENCES public.empresas(id) ON DELETE SET NULL;

-- ─── 4. Garantir tabela empresa_historico ────────────────────
CREATE TABLE IF NOT EXISTS public.empresa_historico (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo        TEXT        NOT NULL DEFAULT 'nota',
  descricao   TEXT        NOT NULL,
  autor       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 5. Índices de performance ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_simulacoes_empresa_id
  ON public.simulacoes_colaborador(empresa_id)
  WHERE empresa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_empresa_id
  ON public.leads(empresa_id)
  WHERE empresa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_triagem_empresa_id
  ON public.triagem_leads(empresa_id)
  WHERE empresa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_empresa_historico_empresa_id
  ON public.empresa_historico(empresa_id);

CREATE INDEX IF NOT EXISTS idx_empresa_historico_created_at
  ON public.empresa_historico(created_at DESC);

-- ─── 6. Índice de deduplicação por CNPJ normalizado ──────────
-- Usado pela função processarEmpresaDaSimulacao no backend
CREATE INDEX IF NOT EXISTS idx_empresas_cnpj_normalizado
  ON public.empresas(regexp_replace(cnpj, '\D', '', 'g'))
  WHERE cnpj IS NOT NULL;

COMMIT;

-- ─── VERIFICAÇÃO PÓS-MIGRAÇÃO ────────────────────────────────
-- Execute após o COMMIT para confirmar:
--
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'simulacoes_colaborador'
--   AND column_name IN ('empresa_id', 'cliente_empresa');
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'leads' AND column_name = 'empresa_id';
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'triagem_leads' AND column_name = 'empresa_id';
--
-- SELECT COUNT(*) FROM empresa_historico;
-- ─────────────────────────────────────────────────────────────

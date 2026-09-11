-- ============================================================
-- MIGRAÇÃO 006 — Campos extras em leads para operação CRM
-- Versão: 1.0 | Data: 2026-04-01
--
-- O QUE ESTA MIGRATION FAZ:
--   Adiciona campos operacionais que o servidor já referencia
--   (PATCH /api/leads/:id/ia) mas que podem não existir no banco:
--     - probabilidade_aprovacao
--     - probabilidade_conversao
--     - proxima_acao_ia
--     - linha_recomendada
--     - prazo_aprovacao_estimado
--     - analise_credito_ia
--
--   Também adiciona campos de controle de IA por lead:
--     - ia_ativa (se a IA deve responder neste lead)
--     - ia_pausada_ate (pausa temporária da IA)
--     - ia_motivo_pausa
--
-- Idempotente: seguro para reexecutar.
-- ============================================================

BEGIN;

-- ─── Campos de IA já referenciados pelo servidor ─────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS probabilidade_aprovacao  INTEGER
    CHECK (probabilidade_aprovacao BETWEEN 0 AND 100);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS probabilidade_conversao  INTEGER
    CHECK (probabilidade_conversao BETWEEN 0 AND 100);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS proxima_acao_ia          TEXT;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS linha_recomendada        TEXT;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS prazo_aprovacao_estimado TEXT;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS analise_credito_ia       TEXT;

-- ─── Campos de controle de IA por lead ───────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ia_ativa         BOOLEAN     DEFAULT TRUE;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ia_pausada_ate   TIMESTAMPTZ;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ia_motivo_pausa  TEXT;

-- ─── Índice para leads com IA ativa ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_ia_ativa
  ON public.leads(ia_ativa)
  WHERE ia_ativa = TRUE;

-- ─── Campos de controle de IA em triagem_leads ───────────────
ALTER TABLE public.triagem_leads
  ADD COLUMN IF NOT EXISTS ia_ativa         BOOLEAN     DEFAULT TRUE;

ALTER TABLE public.triagem_leads
  ADD COLUMN IF NOT EXISTS ia_pausada_ate   TIMESTAMPTZ;

COMMIT;

DO $$
BEGIN
  RAISE NOTICE 'Migration 006 — campos extras de leads e IA aplicados em %', NOW();
END $$;

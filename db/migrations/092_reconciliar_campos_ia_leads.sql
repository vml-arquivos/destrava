-- ─── MIGRAÇÃO 092: reconcilição dos campos de IA usados pelo CRM ────────────
-- A migration 006 já definia estes campos, mas a auditoria de produção mostrou
-- que eles não foram aplicados naquele ambiente. Tudo é aditivo e idempotente;
-- nenhum valor existente é recalculado ou substituído.
BEGIN;

ALTER TABLE IF EXISTS public.leads
  ADD COLUMN IF NOT EXISTS probabilidade_aprovacao INTEGER
    CHECK (probabilidade_aprovacao BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS probabilidade_conversao INTEGER
    CHECK (probabilidade_conversao BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS proxima_acao_ia TEXT,
  ADD COLUMN IF NOT EXISTS linha_recomendada TEXT,
  ADD COLUMN IF NOT EXISTS prazo_aprovacao_estimado TEXT,
  ADD COLUMN IF NOT EXISTS analise_credito_ia TEXT,
  ADD COLUMN IF NOT EXISTS ia_ativa BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ia_pausada_ate TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ia_motivo_pausa TEXT;

ALTER TABLE IF EXISTS public.triagem_leads
  ADD COLUMN IF NOT EXISTS ia_ativa BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ia_pausada_ate TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_ia_ativa
  ON public.leads (ia_ativa)
  WHERE ia_ativa = TRUE;

COMMIT;

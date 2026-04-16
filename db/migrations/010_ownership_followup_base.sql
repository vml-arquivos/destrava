-- ============================================================
-- MIGRAÇÃO 010 — Ownership e controle básico de follow-up
-- Objetivo: garantir as colunas operacionais e preparar índices
-- sem remover compatibilidade com o schema já em produção.
-- ============================================================

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proximo_followup TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ultimo_contato_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_responsavel_id
  ON public.leads(responsavel_id);

CREATE INDEX IF NOT EXISTS idx_leads_proximo_followup
  ON public.leads(proximo_followup)
  WHERE proximo_followup IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_ultimo_contato_em
  ON public.leads(ultimo_contato_em)
  WHERE ultimo_contato_em IS NOT NULL;

COMMIT;

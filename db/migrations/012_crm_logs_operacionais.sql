-- ============================================================
-- MIGRAÇÃO 012 — Logs operacionais do CRM
-- Objetivo: registrar eventos essenciais de alteração em leads
-- sem impactar os contratos existentes do monólito.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_logs_lead_id
  ON public.crm_logs(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_logs_usuario_id
  ON public.crm_logs(usuario_id, created_at DESC);

COMMIT;

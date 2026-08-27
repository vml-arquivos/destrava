-- ─── MIGRAÇÃO 093: vínculo opcional de orçamento ao lead de origem ─────────
-- O módulo real usa public.orcamentos_timbrados (não existe public.orcamentos
-- em produção). O campo é nullable para preservar todo o histórico antigo.
BEGIN;
ALTER TABLE IF EXISTS public.orcamentos_timbrados
  ADD COLUMN IF NOT EXISTS lead_id UUID
    REFERENCES public.leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orcamentos_timbrados_lead_id
  ON public.orcamentos_timbrados (lead_id)
  WHERE lead_id IS NOT NULL;
COMMIT;

-- ─── MIGRAÇÃO 091: unicidade operacional de metas comerciais ───────────────
-- A produção já possui crm_metas e não apresentou duplicidades. Este índice
-- aditivo permite upsert idempotente por colaborador/período.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_metas_colaborador_periodo
  ON public.crm_metas (colaborador_id, periodo);
CREATE INDEX IF NOT EXISTS idx_crm_metas_periodo
  ON public.crm_metas (periodo);
COMMIT;

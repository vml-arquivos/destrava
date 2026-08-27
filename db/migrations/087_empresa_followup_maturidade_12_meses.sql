-- MIGRAÇÃO 087 — origem dos follow-ups empresariais e unicidade do lembrete de maturidade
-- Aditiva e idempotente. Não altera nem remove dados existentes.

ALTER TABLE IF EXISTS public.empresa_followups
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF to_regclass('public.empresa_followups') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_empresa_followups_maturidade_unica
      ON public.empresa_followups(empresa_id)
      WHERE origem = 'maturidade_12_meses';
  END IF;
END $$;

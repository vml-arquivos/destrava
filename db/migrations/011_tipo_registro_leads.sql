-- ============================================================
-- MIGRAÇÃO 011 — Tipo de registro em leads
-- Objetivo: classificar a origem funcional do registro sem alterar
-- os contratos atuais de API nem reescrever os fluxos existentes.
-- ============================================================

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS tipo_registro TEXT DEFAULT 'lead';

UPDATE public.leads
   SET tipo_registro = CASE
     WHEN origem IN ('simulador_publico', 'simulador-publico', 'site') THEN 'simulacao'
     WHEN origem = 'contato_site' THEN 'contato'
     WHEN etapa_funil = 'carteira' THEN 'carteira'
     ELSE COALESCE(tipo_registro, 'lead')
   END
 WHERE tipo_registro IS NULL
    OR tipo_registro NOT IN ('lead', 'simulacao', 'contato', 'cliente', 'carteira');

ALTER TABLE public.leads
  ALTER COLUMN tipo_registro SET DEFAULT 'lead';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'leads_tipo_registro_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_tipo_registro_check
      CHECK (tipo_registro IN ('lead', 'simulacao', 'contato', 'cliente', 'carteira'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_tipo_registro
  ON public.leads(tipo_registro);

COMMIT;

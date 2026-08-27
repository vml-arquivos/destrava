-- ============================================================
-- MIGRAÇÃO 086 — Onda 0: score básico persistido
--
-- Objetivo: impedir que o score determinístico calculado na captura
-- seja descartado antes de chegar à fila operacional do CRM.
-- Compatível com bases antigas: alterações aditivas e idempotentes;
-- score_efetivo legado não é removido nem refeito.
-- ============================================================

ALTER TABLE IF EXISTS public.leads
  ADD COLUMN IF NOT EXISTS score_basico INTEGER;

ALTER TABLE IF EXISTS public.leads
  DROP CONSTRAINT IF EXISTS leads_score_basico_check;

ALTER TABLE IF EXISTS public.leads
  ADD CONSTRAINT leads_score_basico_check
  CHECK (score_basico IS NULL OR score_basico BETWEEN 0 AND 100) NOT VALID;

ALTER TABLE IF EXISTS public.triagem_leads
  ADD COLUMN IF NOT EXISTS score_basico INTEGER;

ALTER TABLE IF EXISTS public.triagem_leads
  DROP CONSTRAINT IF EXISTS triagem_leads_score_basico_check;

ALTER TABLE IF EXISTS public.triagem_leads
  ADD CONSTRAINT triagem_leads_score_basico_check
  CHECK (score_basico IS NULL OR score_basico BETWEEN 0 AND 100) NOT VALID;

-- A fórmula abaixo é o espelho SQL do helper shared/leadScoring.ts.
-- O backfill só preenche lacunas, preservando qualquer valor já revisado.
UPDATE public.leads
SET score_basico = LEAST(
  100,
  GREATEST(
    0,
    (CASE WHEN valor_solicitado > 0 THEN LEAST(30, GREATEST(0, ROUND((LN(valor_solicitado) / LN(5000000) * 30)::numeric))) ELSE 0 END)::integer
    + CASE
        WHEN prazo_meses >= 60 THEN 20
        WHEN prazo_meses >= 36 THEN 15
        WHEN prazo_meses >= 24 THEN 10
        WHEN prazo_meses >= 12 THEN 5
        WHEN prazo_meses > 0 THEN 2
        ELSE 0
      END
    + (CASE WHEN NULLIF(BTRIM(nome), '') IS NOT NULL THEN 6 ELSE 0 END)
    + (CASE WHEN NULLIF(BTRIM(telefone), '') IS NOT NULL THEN 6 ELSE 0 END)
    + (CASE WHEN NULLIF(BTRIM(email), '') IS NOT NULL THEN 6 ELSE 0 END)
    + (CASE WHEN NULLIF(BTRIM(empresa), '') IS NOT NULL THEN 6 ELSE 0 END)
    + (CASE WHEN NULLIF(BTRIM(cpf_cnpj), '') IS NOT NULL THEN 6 ELSE 0 END)
    + CASE temperatura
        WHEN 'urgente' THEN 20
        WHEN 'quente' THEN 15
        WHEN 'morno' THEN 8
        ELSE 0
      END
  )
)::integer
WHERE score_basico IS NULL;

DO $$
BEGIN
  IF to_regclass('public.triagem_leads') IS NOT NULL THEN
    UPDATE public.triagem_leads
    SET score_basico = LEAST(
      100,
      GREATEST(
        0,
        (CASE WHEN valor > 0 THEN LEAST(30, GREATEST(0, ROUND((LN(valor) / LN(5000000) * 30)::numeric))) ELSE 0 END)::integer
        + CASE
            WHEN prazo >= 60 THEN 20
            WHEN prazo >= 36 THEN 15
            WHEN prazo >= 24 THEN 10
            WHEN prazo >= 12 THEN 5
            WHEN prazo > 0 THEN 2
            ELSE 0
          END
        + (CASE WHEN NULLIF(BTRIM(nome), '') IS NOT NULL THEN 6 ELSE 0 END)
        + (CASE WHEN NULLIF(BTRIM(telefone), '') IS NOT NULL THEN 6 ELSE 0 END)
        + (CASE WHEN NULLIF(BTRIM(email), '') IS NOT NULL THEN 6 ELSE 0 END)
        + (CASE WHEN NULLIF(BTRIM(empresa), '') IS NOT NULL THEN 6 ELSE 0 END)
        + (CASE WHEN NULLIF(BTRIM(cpf_cnpj), '') IS NOT NULL THEN 6 ELSE 0 END)
        + 8
      )
    )::integer
    WHERE score_basico IS NULL;

    CREATE INDEX IF NOT EXISTS idx_triagem_score_basico
      ON public.triagem_leads(score_basico DESC NULLS LAST);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_score_basico
  ON public.leads(score_basico DESC NULLS LAST);

DO $$
BEGIN
  IF to_regclass('public.leads') IS NOT NULL THEN
    ALTER TABLE public.leads VALIDATE CONSTRAINT leads_score_basico_check;
  END IF;
  IF to_regclass('public.triagem_leads') IS NOT NULL THEN
    ALTER TABLE public.triagem_leads VALIDATE CONSTRAINT triagem_leads_score_basico_check;
  END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'Migration 086 — score_basico persistido e backfill concluído em %', NOW();
END $$;

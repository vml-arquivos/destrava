-- Onda 1: indicação rastreável mínima, sem portal de afiliados.
-- Somente alterações aditivas e idempotentes.

ALTER TABLE IF EXISTS public.parceiros_comerciais
  ADD COLUMN IF NOT EXISTS codigo_indicacao TEXT;

ALTER TABLE IF EXISTS public.leads
  ADD COLUMN IF NOT EXISTS codigo_indicacao TEXT,
  ADD COLUMN IF NOT EXISTS parceiro_indicador_id UUID;

ALTER TABLE IF EXISTS public.triagem_leads
  ADD COLUMN IF NOT EXISTS codigo_indicacao TEXT,
  ADD COLUMN IF NOT EXISTS parceiro_indicador_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_parceiros_codigo_indicacao
  ON public.parceiros_comerciais (codigo_indicacao)
  WHERE codigo_indicacao IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_parceiro_indicador
  ON public.leads (parceiro_indicador_id)
  WHERE parceiro_indicador_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_triagem_leads_parceiro_indicador
  ON public.triagem_leads (parceiro_indicador_id)
  WHERE parceiro_indicador_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_codigo_indicacao
  ON public.leads (codigo_indicacao)
  WHERE codigo_indicacao IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_triagem_leads_codigo_indicacao
  ON public.triagem_leads (codigo_indicacao)
  WHERE codigo_indicacao IS NOT NULL;

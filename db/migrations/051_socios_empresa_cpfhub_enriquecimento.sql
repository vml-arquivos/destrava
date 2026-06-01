-- 051_socios_empresa_cpfhub_enriquecimento.sql
-- Complementa socios_empresa para armazenar dados cadastrais retornados pela CPFHub.io.
-- A chave da API fica somente em variável de ambiente: CPFHUB_API_KEY.

BEGIN;

ALTER TABLE public.socios_empresa
  ADD COLUMN IF NOT EXISTS genero VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cpfhub_consultado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cpfhub_status TEXT;

CREATE INDEX IF NOT EXISTS idx_socios_empresa_cpfhub_consultado_at
  ON public.socios_empresa(cpfhub_consultado_at);

CREATE INDEX IF NOT EXISTS idx_socios_empresa_cpf_fonte
  ON public.socios_empresa(cpf_fonte);

COMMIT;

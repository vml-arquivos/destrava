-- 034_company_hub_empresas_completo.sql
-- Enriquecimento definitivo da página Empresas / Company Hub.
-- Idempotente: pode rodar mais de uma vez sem quebrar produção.

BEGIN;

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS natureza_juridica TEXT,
  ADD COLUMN IF NOT EXISTS capital_social NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS cnae_principal TEXT,
  ADD COLUMN IF NOT EXISTS cnaes_secundarios TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS data_abertura DATE,
  ADD COLUMN IF NOT EXISTS situacao_cadastral TEXT,
  ADD COLUMN IF NOT EXISTS matriz_filial TEXT,
  ADD COLUMN IF NOT EXISTS ultima_sincronizacao_receita TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.empresa_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT,
  tamanho INTEGER,
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_empresa_documentos_empresa_id ON public.empresa_documentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empresas_cnpj ON public.empresas(cnpj);
CREATE INDEX IF NOT EXISTS idx_empresas_natureza_juridica ON public.empresas(natureza_juridica);
CREATE INDEX IF NOT EXISTS idx_empresas_cnae_principal ON public.empresas(cnae_principal);

COMMIT;

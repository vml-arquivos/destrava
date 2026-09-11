-- 031_empresas_dados_receita_cnpj.sql
-- Corrige cadastro de empresas e adiciona armazenamento completo de dados públicos da Receita/BrasilAPI.
-- Idempotente: pode rodar mais de uma vez com segurança.

BEGIN;

-- Extensões necessárias para gen_random_uuid(), caso ainda não existam.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Colunas de relacionamento que podem faltar em ambientes que não rodaram migrations antigas.
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS captador_id UUID NULL REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS analista_id UUID NULL REFERENCES public.colaboradores(id) ON DELETE SET NULL;

-- Dados fiscais/cadastrais retornados pela Receita Federal/BrasilAPI.
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS natureza_juridica TEXT,
  ADD COLUMN IF NOT EXISTS cnae_principal TEXT,
  ADD COLUMN IF NOT EXISTS cnae_descricao TEXT,
  ADD COLUMN IF NOT EXISTS cnaes_secundarios JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS descricao_situacao_cadastral TEXT,
  ADD COLUMN IF NOT EXISTS data_situacao_cadastral DATE,
  ADD COLUMN IF NOT EXISTS motivo_situacao_cadastral TEXT,
  ADD COLUMN IF NOT EXISTS data_inicio_atividade DATE,
  ADD COLUMN IF NOT EXISTS capital_social NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS matriz_filial TEXT,
  ADD COLUMN IF NOT EXISTS dados_receita JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS qsa JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_empresas_captador_id ON public.empresas(captador_id) WHERE captador_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_empresas_analista_id ON public.empresas(analista_id) WHERE analista_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_empresas_cnae_principal ON public.empresas(cnae_principal) WHERE cnae_principal IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_empresas_situacao_cadastral ON public.empresas(descricao_situacao_cadastral) WHERE descricao_situacao_cadastral IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_empresas_qsa_gin ON public.empresas USING GIN (qsa);
CREATE INDEX IF NOT EXISTS idx_empresas_dados_receita_gin ON public.empresas USING GIN (dados_receita);

COMMIT;

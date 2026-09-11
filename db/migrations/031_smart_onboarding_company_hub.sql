-- 031_smart_onboarding_company_hub.sql
-- Refatoração Crítica: Smart Onboarding e Company Hub
-- Idempotente (IF NOT EXISTS) para não quebrar funcionalidades anteriores

BEGIN;

-- 1. Enriquecer tabela clientes (no nosso banco é 'empresas')
-- A instrução diz "tabela clientes", mas no esquema atual o nome é 'empresas'.
-- O documento original usa 'empresas' para B2B e 'clientes_pf' para B2C.
-- Vou aplicar em 'empresas'.

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS natureza_juridica TEXT,
  ADD COLUMN IF NOT EXISTS capital_social NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS cnae_principal TEXT,
  ADD COLUMN IF NOT EXISTS cnaes_secundarios TEXT[],
  ADD COLUMN IF NOT EXISTS data_abertura DATE;

-- Os campos cep, logradouro, numero, complemento, bairro, cidade, estado já existem na tabela empresas.

-- 2. Nova tabela socios_empresa
CREATE TABLE IF NOT EXISTS public.socios_empresa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf_cnpj TEXT,
  qualificacao_socio TEXT,
  percentual_capital NUMERIC(5,2),
  representante_legal BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_socios_empresa_empresa_id ON public.socios_empresa(empresa_id);

-- Trigger de updated_at para socios_empresa
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_socios_empresa_updated_at') THEN
    CREATE TRIGGER trg_socios_empresa_updated_at
      BEFORE UPDATE ON public.socios_empresa
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 3. Nova tabela documentos_empresa (GED)
-- A instrução pediu "documentos_empresa". Existe uma tabela "empresa_documentos" no backend, mas o prompt exige a criação dessa nova estrutura e enum de status.
CREATE TABLE IF NOT EXISTS public.documentos_empresa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL,
  tipo_documento TEXT CHECK (tipo_documento IN ('contrato_social', 'alteracao_contratual', 'cartao_cnpj', 'cnh_socio', 'comprovante_residencia', 'faturamento', 'imposto_renda', 'outro')),
  url_arquivo TEXT NOT NULL,
  tamanho_bytes INTEGER,
  status_validacao TEXT DEFAULT 'em_analise' CHECK (status_validacao IN ('em_analise', 'aprovado', 'rejeitado')),
  data_vencimento DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documentos_empresa_empresa_id ON public.documentos_empresa(empresa_id);

-- Trigger de updated_at para documentos_empresa
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_documentos_empresa_updated_at') THEN
    CREATE TRIGGER trg_documentos_empresa_updated_at
      BEFORE UPDATE ON public.documentos_empresa
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

COMMIT;

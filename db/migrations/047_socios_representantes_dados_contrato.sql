-- ============================================================
-- 047_socios_representantes_dados_contrato.sql
-- Destrava Crédito
-- Expande sócios/representantes para contratos e análises.
-- Mantém dados públicos importados das APIs de CNPJ e campos manuais
-- necessários para contrato: CPF completo, RG, estado civil, cônjuge,
-- regime de bens, profissão, contato e endereço residencial.
-- Idempotente.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

ALTER TABLE public.socios_empresa
  ADD COLUMN IF NOT EXISTS nome_representante TEXT,
  ADD COLUMN IF NOT EXISTS qualificacao_representante TEXT,
  ADD COLUMN IF NOT EXISTS data_entrada_sociedade DATE,
  ADD COLUMN IF NOT EXISTS pais TEXT,
  ADD COLUMN IF NOT EXISTS rg TEXT,
  ADD COLUMN IF NOT EXISTS rg_orgao_emissor TEXT,
  ADD COLUMN IF NOT EXISTS rg_uf_emissao CHAR(2),
  ADD COLUMN IF NOT EXISTS rg_data_emissao DATE,
  ADD COLUMN IF NOT EXISTS data_nascimento DATE,
  ADD COLUMN IF NOT EXISTS nacionalidade TEXT DEFAULT 'Brasileiro(a)',
  ADD COLUMN IF NOT EXISTS estado_civil TEXT,
  ADD COLUMN IF NOT EXISTS profissao TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS telefone TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS logradouro TEXT,
  ADD COLUMN IF NOT EXISTS numero TEXT,
  ADD COLUMN IF NOT EXISTS complemento TEXT,
  ADD COLUMN IF NOT EXISTS bairro TEXT,
  ADD COLUMN IF NOT EXISTS cidade TEXT,
  ADD COLUMN IF NOT EXISTS uf CHAR(2),
  ADD COLUMN IF NOT EXISTS conjuge_nome TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_cpf TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_rg TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_data_nasc DATE,
  ADD COLUMN IF NOT EXISTS conjuge_profissao TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_email TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_telefone TEXT,
  ADD COLUMN IF NOT EXISTS regime_bens TEXT,
  ADD COLUMN IF NOT EXISTS pep BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS fonte_dados TEXT,
  ADD COLUMN IF NOT EXISTS dados_extra JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dados_extras JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS observacoes TEXT;

UPDATE public.socios_empresa
SET nacionalidade = COALESCE(NULLIF(nacionalidade, ''), 'Brasileiro(a)'),
    ativo = COALESCE(ativo, true),
    fonte_dados = COALESCE(NULLIF(fonte_dados, ''), 'api_publica_cnpj'),
    dados_extra = COALESCE(dados_extra, '{}'::jsonb),
    dados_extras = COALESCE(dados_extras, '{}'::jsonb)
WHERE nacionalidade IS NULL
   OR ativo IS NULL
   OR fonte_dados IS NULL
   OR dados_extra IS NULL
   OR dados_extras IS NULL;

CREATE INDEX IF NOT EXISTS idx_socios_empresa_empresa_id
  ON public.socios_empresa(empresa_id);

CREATE INDEX IF NOT EXISTS idx_socios_empresa_cpf_cnpj_digits
  ON public.socios_empresa ((regexp_replace(COALESCE(cpf_cnpj,''), '\D', '', 'g')));

CREATE INDEX IF NOT EXISTS idx_socios_empresa_ativo
  ON public.socios_empresa(empresa_id, ativo);

CREATE INDEX IF NOT EXISTS idx_socios_empresa_representante
  ON public.socios_empresa(empresa_id, representante_legal)
  WHERE COALESCE(ativo, true) = true;

CREATE INDEX IF NOT EXISTS idx_socios_empresa_conjuge_cpf
  ON public.socios_empresa(conjuge_cpf)
  WHERE conjuge_cpf IS NOT NULL;

-- Permite documentos societários vinculados a sócios quando a tabela GED existir/for criada.
CREATE TABLE IF NOT EXISTS public.documentos_empresa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  socio_id UUID NULL REFERENCES public.socios_empresa(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL,
  tipo_documento TEXT NOT NULL DEFAULT 'outro',
  url_arquivo TEXT NOT NULL,
  tamanho_bytes BIGINT,
  status_validacao TEXT DEFAULT 'pendente',
  data_vencimento DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.documentos_empresa
  ADD COLUMN IF NOT EXISTS socio_id UUID NULL REFERENCES public.socios_empresa(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status_validacao TEXT DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS observacoes TEXT;

CREATE INDEX IF NOT EXISTS idx_documentos_empresa_socios
  ON public.documentos_empresa(empresa_id, socio_id, tipo_documento);

COMMIT;

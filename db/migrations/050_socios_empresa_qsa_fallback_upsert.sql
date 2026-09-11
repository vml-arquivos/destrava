-- Migration 050 — índices de apoio para importação/upsert de sócios por CNPJ
-- Sistema Destrava Crédito
-- Execute depois da 049 e antes do deploy desta versão.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Garante a tabela/colunas centrais caso algum ambiente tenha aplicado versões parciais.
CREATE TABLE IF NOT EXISTS public.socios_empresa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf_cnpj TEXT,
  qualificacao_socio TEXT,
  percentual_capital NUMERIC(8,2),
  representante_legal BOOLEAN DEFAULT false,
  ativo BOOLEAN DEFAULT true,
  fonte_dados TEXT DEFAULT 'api_publica_cnpj',
  dados_extra JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
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
  ADD COLUMN IF NOT EXISTS nacionalidade TEXT,
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
  ADD COLUMN IF NOT EXISTS cpf_completo_manual VARCHAR(14),
  ADD COLUMN IF NOT EXISTS cpf_validado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cpf_fonte VARCHAR(50) DEFAULT 'opencnpj',
  ADD COLUMN IF NOT EXISTS ultima_atualizacao_pessoal TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS assinante_contrato BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pendencias_contrato TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS cadastro_completo_contrato BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_socios_empresa_empresa_id ON public.socios_empresa(empresa_id);
CREATE INDEX IF NOT EXISTS idx_socios_empresa_empresa_nome_lower ON public.socios_empresa(empresa_id, lower(nome));
CREATE INDEX IF NOT EXISTS idx_socios_empresa_empresa_cpf_cnpj_digits ON public.socios_empresa(empresa_id, regexp_replace(COALESCE(cpf_cnpj,''), '\D', '', 'g'));
CREATE INDEX IF NOT EXISTS idx_socios_empresa_ativo ON public.socios_empresa(empresa_id, ativo);
CREATE INDEX IF NOT EXISTS idx_socios_empresa_dados_extra_gin ON public.socios_empresa USING GIN (dados_extra);

COMMIT;

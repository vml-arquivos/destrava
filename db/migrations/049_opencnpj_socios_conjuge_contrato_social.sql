-- Migration 049 — OpenCNPJ + sócios completos + cônjuge + contrato social
-- Sistema Destrava Crédito
-- Execute antes do deploy desta versão.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Empresas: metadados de fonte/sincronização da consulta CNPJ.
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS dados_extra_receita JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dados_fontes_cnpj JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ultima_sincronizacao_receita TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS provedor_cnpj TEXT NULL,
  ADD COLUMN IF NOT EXISTS fontes_cnpj TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Sócios/representantes usados pelo sistema atual.
CREATE TABLE IF NOT EXISTS socios_empresa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf_cnpj TEXT,
  qualificacao_socio TEXT,
  percentual_capital NUMERIC(8,2),
  representante_legal BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE socios_empresa
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
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS fonte_dados TEXT DEFAULT 'api_publica_cnpj',
  ADD COLUMN IF NOT EXISTS cpf_completo_manual VARCHAR(14),
  ADD COLUMN IF NOT EXISTS cpf_validado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cpf_fonte VARCHAR(50) DEFAULT 'opencnpj',
  ADD COLUMN IF NOT EXISTS ultima_atualizacao_pessoal TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS assinante_contrato BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pendencias_contrato TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS cadastro_completo_contrato BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS dados_extra JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_socios_empresa_empresa_id ON socios_empresa(empresa_id);
CREATE INDEX IF NOT EXISTS idx_socios_empresa_cpf_cnpj ON socios_empresa(cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_socios_empresa_cpf_completo_manual ON socios_empresa(cpf_completo_manual);

-- Compatibilidade com prompt/tabela antiga caso exista tabela socios.
DO $$
BEGIN
  IF to_regclass('public.socios') IS NOT NULL THEN
    ALTER TABLE socios
      ADD COLUMN IF NOT EXISTS cpf_completo_manual VARCHAR(14),
      ADD COLUMN IF NOT EXISTS cpf_validado BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS cpf_fonte VARCHAR(50) DEFAULT 'opencnpj',
      ADD COLUMN IF NOT EXISTS ultima_atualizacao_pessoal TIMESTAMPTZ DEFAULT NOW();
    CREATE INDEX IF NOT EXISTS idx_socios_cpf_completo ON socios(cpf_completo_manual);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS socios_conjuge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id UUID NOT NULL REFERENCES socios_empresa(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  conjuge_nome VARCHAR(255),
  conjuge_cpf VARCHAR(14),
  regime_bens VARCHAR(100),
  data_casamento DATE,
  estado_civil VARCHAR(50),
  fonte VARCHAR(50) DEFAULT 'manual',
  criado_por UUID NULL REFERENCES colaboradores(id) ON DELETE SET NULL,
  atualizado_por UUID NULL REFERENCES colaboradores(id) ON DELETE SET NULL,
  data_insercao TIMESTAMPTZ DEFAULT NOW(),
  ultima_atualizacao TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_socios_conjuge_socio_id ON socios_conjuge(socio_id);
CREATE INDEX IF NOT EXISTS idx_socios_conjuge_empresa_id ON socios_conjuge(empresa_id);

CREATE TABLE IF NOT EXISTS empresas_contratos_sociais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome_arquivo VARCHAR(255) NOT NULL,
  caminho_arquivo VARCHAR(500) NOT NULL,
  url VARCHAR(500),
  tamanho_bytes INT,
  tipo_mime VARCHAR(50) DEFAULT 'application/pdf',
  data_assinatura DATE,
  numero_registro VARCHAR(50),
  data_registro DATE,
  numero_alteracoes INT DEFAULT 0,
  ultima_alteracao DATE,
  descricao TEXT,
  uploaded_by UUID NULL REFERENCES colaboradores(id) ON DELETE SET NULL,
  data_upload TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contratos_sociais_empresa_id ON empresas_contratos_sociais(empresa_id);
CREATE INDEX IF NOT EXISTS idx_contratos_sociais_data_upload ON empresas_contratos_sociais(data_upload);

COMMIT;

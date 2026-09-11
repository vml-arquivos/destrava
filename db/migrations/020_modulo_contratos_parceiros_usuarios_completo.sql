-- Migration 020: módulo completo de contratos, parceiros, responsáveis e usuários
-- Idempotente: não apaga dados, não renomeia tabelas e usa apenas ADD COLUMN/CREATE TABLE/CREATE INDEX se necessário.

BEGIN;

-- Parceiros/contratadas/prestadores: mantém a tabela histórica e adiciona campos de cadastro, identidade visual e PDF.
CREATE TABLE IF NOT EXISTS public.prestadores_servico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_pessoa TEXT NOT NULL DEFAULT 'pj',
  razao_social TEXT,
  nome_fantasia TEXT,
  nome TEXT,
  cnpj TEXT,
  cpf TEXT,
  email TEXT,
  telefone TEXT,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  representante_nome TEXT,
  representante_cpf TEXT,
  representante_cargo TEXT,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.prestadores_servico ADD COLUMN IF NOT EXISTS rg TEXT;
ALTER TABLE public.prestadores_servico ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE public.prestadores_servico ADD COLUMN IF NOT EXISTS estado_civil TEXT;
ALTER TABLE public.prestadores_servico ADD COLUMN IF NOT EXISTS profissao TEXT;
ALTER TABLE public.prestadores_servico ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE public.prestadores_servico ADD COLUMN IF NOT EXISTS complemento TEXT;
ALTER TABLE public.prestadores_servico ADD COLUMN IF NOT EXISTS bairro TEXT;
ALTER TABLE public.prestadores_servico ADD COLUMN IF NOT EXISTS cargo TEXT;
ALTER TABLE public.prestadores_servico ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.prestadores_servico ADD COLUMN IF NOT EXISTS cor_primaria TEXT;
ALTER TABLE public.prestadores_servico ADD COLUMN IF NOT EXISTS cor_secundaria TEXT;
ALTER TABLE public.prestadores_servico ADD COLUMN IF NOT EXISTS texto_cabecalho TEXT;
ALTER TABLE public.prestadores_servico ADD COLUMN IF NOT EXISTS texto_rodape TEXT;
ALTER TABLE public.prestadores_servico ADD COLUMN IF NOT EXISTS rodape_html TEXT;
ALTER TABLE public.prestadores_servico ADD COLUMN IF NOT EXISTS mostrar_logo_contrato BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.prestadores_servico ADD COLUMN IF NOT EXISTS origem_cadastro TEXT;
ALTER TABLE public.prestadores_servico ADD COLUMN IF NOT EXISTS metadados JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_prestadores_servico_tipo_ativo ON public.prestadores_servico(tipo_pessoa, ativo);
CREATE INDEX IF NOT EXISTS idx_prestadores_servico_documentos ON public.prestadores_servico(cnpj, cpf);

-- Responsáveis pessoa física vinculados a pessoas jurídicas parceiras/contratadas.
CREATE TABLE IF NOT EXISTS public.pessoa_juridica_responsaveis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id UUID REFERENCES public.prestadores_servico(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf TEXT,
  rg TEXT,
  email TEXT,
  telefone TEXT,
  cargo TEXT,
  profissao TEXT,
  estado_civil TEXT,
  nacionalidade TEXT,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  principal BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pj_responsaveis_prestador ON public.pessoa_juridica_responsaveis(prestador_id, ativo);
CREATE INDEX IF NOT EXISTS idx_pj_responsaveis_cpf ON public.pessoa_juridica_responsaveis(cpf);

-- Contratos gerados: novos vínculos/snapshots administrativos sem remover colunas antigas.
ALTER TABLE public.contratos_gerados ADD COLUMN IF NOT EXISTS parceiro_snapshot JSONB;
ALTER TABLE public.contratos_gerados ADD COLUMN IF NOT EXISTS parceiro_responsavel_id UUID REFERENCES public.pessoa_juridica_responsaveis(id) ON DELETE SET NULL;
ALTER TABLE public.contratos_gerados ADD COLUMN IF NOT EXISTS parceiro_responsavel_snapshot JSONB;
ALTER TABLE public.contratos_gerados ADD COLUMN IF NOT EXISTS contratante_tipo TEXT;
ALTER TABLE public.contratos_gerados ADD COLUMN IF NOT EXISTS contratante_pf_id UUID;
ALTER TABLE public.contratos_gerados ADD COLUMN IF NOT EXISTS contratante_pj_id UUID;
ALTER TABLE public.contratos_gerados ADD COLUMN IF NOT EXISTS contratante_snapshot JSONB;
ALTER TABLE public.contratos_gerados ADD COLUMN IF NOT EXISTS contratante_responsavel_id UUID REFERENCES public.pessoa_juridica_responsaveis(id) ON DELETE SET NULL;
ALTER TABLE public.contratos_gerados ADD COLUMN IF NOT EXISTS contratante_responsavel_snapshot JSONB;
ALTER TABLE public.contratos_gerados ADD COLUMN IF NOT EXISTS responsavel_interno_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL;
ALTER TABLE public.contratos_gerados ADD COLUMN IF NOT EXISTS responsavel_interno_snapshot JSONB;
ALTER TABLE public.contratos_gerados ADD COLUMN IF NOT EXISTS local_assinatura TEXT;
ALTER TABLE public.contratos_gerados ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE public.contratos_gerados ADD COLUMN IF NOT EXISTS dados_editaveis JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.contratos_gerados ADD COLUMN IF NOT EXISTS pdf_regenerado_em TIMESTAMPTZ;
ALTER TABLE public.contratos_gerados ADD COLUMN IF NOT EXISTS assinado_em TIMESTAMPTZ;
ALTER TABLE public.contratos_gerados ADD COLUMN IF NOT EXISTS assinado_pdf_path TEXT;

CREATE INDEX IF NOT EXISTS idx_contratos_gerados_contratante_pf ON public.contratos_gerados(contratante_pf_id);
CREATE INDEX IF NOT EXISTS idx_contratos_gerados_contratante_pj ON public.contratos_gerados(contratante_pj_id);
CREATE INDEX IF NOT EXISTS idx_contratos_gerados_status_tipo ON public.contratos_gerados(status, tipo_contrato);

-- Colaboradores: dados pessoais, perfil e recuperação/redefinição de senha.
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS rg TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS estado_civil TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS profissao TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS complemento TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS bairro TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS cidade TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS uf TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS assinatura_url TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS precisa_redefinir_senha BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS ultimo_reset_senha_em TIMESTAMPTZ;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS reset_senha_solicitado_em TIMESTAMPTZ;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS reset_senha_token_hash TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS reset_senha_expira_em TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_colaboradores_email_lower_unique ON public.colaboradores(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_colaboradores_reset_senha ON public.colaboradores(reset_senha_solicitado_em) WHERE reset_senha_solicitado_em IS NOT NULL;

COMMIT;

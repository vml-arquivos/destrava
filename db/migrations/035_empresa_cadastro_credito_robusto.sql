-- 035_empresa_cadastro_credito_robusto.sql
-- Correção sem regressão para cadastro de empresa, Smart Onboarding, sócios,
-- documentos/checklist e histórico. Idempotente para redeploy seguro.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Empresas: campos carregáveis automaticamente ou preenchíveis no dossiê de crédito.
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS captador_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS analista_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS natureza_juridica TEXT,
  ADD COLUMN IF NOT EXISTS capital_social NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS cnae_principal TEXT,
  ADD COLUMN IF NOT EXISTS cnaes_secundarios TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS data_abertura DATE,
  ADD COLUMN IF NOT EXISTS situacao_cadastral TEXT,
  ADD COLUMN IF NOT EXISTS matriz_filial TEXT,
  ADD COLUMN IF NOT EXISTS ultima_sincronizacao_receita TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS telefone_2 TEXT,
  ADD COLUMN IF NOT EXISTS inscricao_municipal TEXT,
  ADD COLUMN IF NOT EXISTS data_situacao_cadastral DATE,
  ADD COLUMN IF NOT EXISTS motivo_situacao_cadastral TEXT,
  ADD COLUMN IF NOT EXISTS regime_tributario TEXT,
  ADD COLUMN IF NOT EXISTS score_cnpj INTEGER,
  ADD COLUMN IF NOT EXISTS restricoes_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS observacoes_credito TEXT,
  ADD COLUMN IF NOT EXISTS dados_extra_receita JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_empresas_captador_id ON public.empresas(captador_id) WHERE captador_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_empresas_analista_id ON public.empresas(analista_id) WHERE analista_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_empresas_cnpj ON public.empresas(cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_empresas_status ON public.empresas(status);
CREATE INDEX IF NOT EXISTS idx_empresas_responsavel_id ON public.empresas(responsavel_id) WHERE responsavel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_empresas_cnae_principal ON public.empresas(cnae_principal) WHERE cnae_principal IS NOT NULL;

-- Histórico da empresa, caso produção ainda não tenha aplicado migrations antigas.
CREATE TABLE IF NOT EXISTS public.empresa_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'nota',
  descricao TEXT NOT NULL,
  autor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_empresa_historico_empresa_id ON public.empresa_historico(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empresa_historico_created_at ON public.empresa_historico(created_at DESC);

-- Follow-ups da empresa, usados pela página Company Hub.
CREATE TABLE IF NOT EXISTS public.empresa_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  tipo TEXT DEFAULT 'ligacao',
  data_agendada TIMESTAMPTZ,
  descricao TEXT,
  concluido BOOLEAN NOT NULL DEFAULT FALSE,
  concluido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_empresa_followups_empresa_id ON public.empresa_followups(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empresa_followups_data ON public.empresa_followups(data_agendada);

-- Documentos oficiais da empresa já usados por /api/empresas/:id/documentos.
CREATE TABLE IF NOT EXISTS public.empresa_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT,
  tamanho INTEGER,
  url TEXT,
  status_validacao TEXT DEFAULT 'em_analise',
  observacao_validacao TEXT,
  data_vencimento DATE,
  validado_por UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  validado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.empresa_documentos
  ADD COLUMN IF NOT EXISTS status_validacao TEXT DEFAULT 'em_analise',
  ADD COLUMN IF NOT EXISTS observacao_validacao TEXT,
  ADD COLUMN IF NOT EXISTS data_vencimento DATE,
  ADD COLUMN IF NOT EXISTS validado_por UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_empresa_documentos_empresa_id ON public.empresa_documentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empresa_documentos_tipo ON public.empresa_documentos(tipo);
CREATE INDEX IF NOT EXISTS idx_empresa_documentos_status ON public.empresa_documentos(status_validacao);

-- Estrutura GED antiga/alternativa mantida para compatibilidade com /ged.
CREATE TABLE IF NOT EXISTS public.documentos_empresa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL,
  tipo_documento TEXT,
  url_arquivo TEXT NOT NULL,
  tamanho_bytes INTEGER,
  status_validacao TEXT DEFAULT 'em_analise',
  data_vencimento DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documentos_empresa_empresa_id ON public.documentos_empresa(empresa_id);

-- Sócios completos.
CREATE TABLE IF NOT EXISTS public.socios_empresa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf_cnpj TEXT,
  qualificacao_socio TEXT,
  percentual_capital NUMERIC(5,2),
  representante_legal BOOLEAN DEFAULT FALSE,
  nome_representante TEXT,
  qualificacao_representante TEXT,
  data_entrada_sociedade DATE,
  pais TEXT,
  rg TEXT,
  data_nascimento DATE,
  estado_civil TEXT,
  profissao TEXT,
  endereco TEXT,
  conjuge_nome TEXT,
  advogado_nome TEXT,
  score INTEGER,
  restricoes TEXT,
  observacoes TEXT,
  dados_extra JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.socios_empresa
  ADD COLUMN IF NOT EXISTS nome_representante TEXT,
  ADD COLUMN IF NOT EXISTS qualificacao_representante TEXT,
  ADD COLUMN IF NOT EXISTS data_entrada_sociedade DATE,
  ADD COLUMN IF NOT EXISTS pais TEXT,
  ADD COLUMN IF NOT EXISTS rg TEXT,
  ADD COLUMN IF NOT EXISTS data_nascimento DATE,
  ADD COLUMN IF NOT EXISTS estado_civil TEXT,
  ADD COLUMN IF NOT EXISTS profissao TEXT,
  ADD COLUMN IF NOT EXISTS endereco TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_nome TEXT,
  ADD COLUMN IF NOT EXISTS advogado_nome TEXT,
  ADD COLUMN IF NOT EXISTS score INTEGER,
  ADD COLUMN IF NOT EXISTS restricoes TEXT,
  ADD COLUMN IF NOT EXISTS observacoes TEXT,
  ADD COLUMN IF NOT EXISTS dados_extra JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_socios_empresa_empresa_id ON public.socios_empresa(empresa_id);

-- Checklist automático para dossiê de crédito.
CREATE TABLE IF NOT EXISTS public.empresa_checklist_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  socio_id UUID NULL REFERENCES public.socios_empresa(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  tipo_documento TEXT NOT NULL,
  nome TEXT NOT NULL,
  obrigatorio BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'pendente',
  origem TEXT NOT NULL DEFAULT 'automatico',
  observacao TEXT,
  arquivo_id UUID NULL,
  data_vencimento DATE NULL,
  criado_por UUID NULL REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, socio_id, tipo_documento)
);
CREATE INDEX IF NOT EXISTS idx_empresa_checklist_empresa_id ON public.empresa_checklist_documentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empresa_checklist_status ON public.empresa_checklist_documentos(status);
CREATE INDEX IF NOT EXISTS idx_empresa_checklist_categoria ON public.empresa_checklist_documentos(categoria);

COMMIT;

-- 039_clientes_empresas_melhorias.sql
-- Melhorias incrementais: origem de clientes, status de completude,
-- vínculos empresa-simulação/contrato e campos de acompanhamento bancário por empresa.
-- Idempotente: seguro para reexecutar em banco existente.
BEGIN;

-- ─── 1. Campos de origem e completude em leads ─────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS origem_detalhada TEXT,
  ADD COLUMN IF NOT EXISTS cadastro_completo BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS campos_pendentes TEXT[] DEFAULT '{}';

-- ─── 2. Campos de origem e completude em clientes_pf ──────────────────────
ALTER TABLE IF EXISTS public.clientes_pf
  ADD COLUMN IF NOT EXISTS cadastro_completo BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS campos_pendentes TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS origem_detalhada TEXT;

-- ─── 3. Campos de origem e completude em empresas ─────────────────────────
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS cadastro_completo BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS campos_pendentes TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS origem_detalhada TEXT;

-- ─── 4. Garantir empresa_historico com campos de autor ────────────────────
CREATE TABLE IF NOT EXISTS public.empresa_historico (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo       TEXT        NOT NULL DEFAULT 'nota',
  descricao  TEXT        NOT NULL,
  autor      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.empresa_historico
  ADD COLUMN IF NOT EXISTS autor TEXT;

-- ─── 5. Garantir tabela socios_empresa com campos completos ───────────────
CREATE TABLE IF NOT EXISTS public.socios_empresa (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id               UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome                     TEXT        NOT NULL,
  cpf_cnpj                 TEXT,
  qualificacao_socio       TEXT,
  percentual_capital       NUMERIC(5,2),
  representante_legal      BOOLEAN     DEFAULT FALSE,
  nome_representante       TEXT,
  qualificacao_representante TEXT,
  data_entrada_sociedade   DATE,
  pais                     TEXT,
  dados_extra              JSONB       DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.socios_empresa
  ADD COLUMN IF NOT EXISTS nome_representante TEXT,
  ADD COLUMN IF NOT EXISTS qualificacao_representante TEXT,
  ADD COLUMN IF NOT EXISTS data_entrada_sociedade DATE,
  ADD COLUMN IF NOT EXISTS pais TEXT,
  ADD COLUMN IF NOT EXISTS dados_extra JSONB DEFAULT '{}'::jsonb;

-- ─── 6. Garantir empresa_documentos com campos completos ──────────────────
CREATE TABLE IF NOT EXISTS public.empresa_documentos (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome                 TEXT        NOT NULL,
  tipo                 TEXT,
  tamanho              INTEGER,
  url                  TEXT,
  status_validacao     TEXT        DEFAULT 'em_analise',
  observacao_validacao TEXT,
  data_vencimento      DATE,
  validado_por         UUID        REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  validado_em          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.empresa_documentos
  ADD COLUMN IF NOT EXISTS status_validacao TEXT DEFAULT 'em_analise',
  ADD COLUMN IF NOT EXISTS observacao_validacao TEXT,
  ADD COLUMN IF NOT EXISTS data_vencimento DATE,
  ADD COLUMN IF NOT EXISTS validado_por UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ─── 7. Garantir simulacoes_colaborador com empresa_id ────────────────────
ALTER TABLE public.simulacoes_colaborador
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_empresa TEXT;

-- ─── 8. Garantir contratos_gerados com empresa_id ─────────────────────────
ALTER TABLE IF EXISTS public.contratos_gerados
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL;

-- ─── 9. Garantir acompanhamentos_bancarios com empresa_id ─────────────────
ALTER TABLE IF EXISTS public.acompanhamentos_bancarios
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL;

-- ─── 10. Índices de performance ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_origem_detalhada ON public.leads(origem_detalhada);
CREATE INDEX IF NOT EXISTS idx_leads_cadastro_completo ON public.leads(cadastro_completo);
CREATE INDEX IF NOT EXISTS idx_empresas_cadastro_completo ON public.empresas(cadastro_completo);
CREATE INDEX IF NOT EXISTS idx_socios_empresa_empresa_id ON public.socios_empresa(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empresa_historico_empresa_id ON public.empresa_historico(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empresa_historico_created_at ON public.empresa_historico(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_empresa_documentos_empresa_id ON public.empresa_documentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_simulacoes_empresa_id ON public.simulacoes_colaborador(empresa_id) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contratos_gerados_empresa_id ON public.contratos_gerados(empresa_id) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_acompanhamentos_bancarios_empresa_id ON public.acompanhamentos_bancarios(empresa_id) WHERE empresa_id IS NOT NULL;

COMMIT;

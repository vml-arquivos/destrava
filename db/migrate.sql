-- ============================================================
-- DESTRAVA CRÉDITO — Migração Unificada para PostgreSQL Nativo
-- Ambiente: VPS / Coolify / postgres:17-alpine
-- Sem Supabase SDK, sem RLS, sem auth.uid()
-- Idempotente: seguro para reexecutar a qualquer momento
-- ============================================================

-- ─── Extensões ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ─── 1. Tabela: colaboradores ─────────────────────────────────
-- Autenticação própria via JWT + bcrypt (sem Supabase Auth)
CREATE TABLE IF NOT EXISTS public.colaboradores (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        UNIQUE NOT NULL,
  nome        TEXT        NOT NULL DEFAULT '',
  cargo       TEXT        NOT NULL DEFAULT 'Analista',
  senha_hash  TEXT,                          -- bcrypt hash da senha
  ativo       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. Tabela: leads ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             TEXT        NOT NULL DEFAULT '',
  email            TEXT,
  telefone         TEXT        NOT NULL DEFAULT '',
  empresa          TEXT,
  cpf_cnpj         TEXT,
  cargo            TEXT,
  tipo_pessoa      TEXT        DEFAULT 'pj' CHECK (tipo_pessoa IN ('pf','pj')),
  produto_interesse TEXT,
  valor_solicitado NUMERIC(15,2),
  prazo_meses      INTEGER,
  finalidade       TEXT,
  mensagem         TEXT,
  origem           TEXT        NOT NULL DEFAULT 'site',
  status           TEXT        NOT NULL DEFAULT 'novo'
                     CHECK (status IN ('novo','contatado','em_negociacao','convertido','perdido')),
  etapa_funil      TEXT        NOT NULL DEFAULT 'novo'
                     CHECK (etapa_funil IN ('novo','contato_feito','proposta_enviada','negociacao','ganho','perdido','inativo')),
  temperatura      TEXT        NOT NULL DEFAULT 'frio'
                     CHECK (temperatura IN ('frio','morno','quente')),
  score_ia         INTEGER     DEFAULT 0 CHECK (score_ia BETWEEN 0 AND 100),
  score_manual     INTEGER     CHECK (score_manual BETWEEN 0 AND 100),
  score_efetivo    INTEGER     GENERATED ALWAYS AS (COALESCE(score_manual, score_ia)) STORED,
  tags             TEXT[]      DEFAULT '{}',
  cidade           TEXT,
  estado           CHAR(2),
  canal_origem     TEXT        DEFAULT 'site',
  proximo_followup TIMESTAMPTZ,
  ultimo_contato_em TIMESTAMPTZ,
  resumo_ia        TEXT,
  observacoes_ia   TEXT,
  chatwoot_conv_id BIGINT,
  responsavel_id   UUID        REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  utm_source       TEXT,
  utm_medium       TEXT,
  utm_campaign     TEXT,
  pagina_origem    TEXT,
  n8n_notificado   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. Tabela: simulacoes_colaborador ────────────────────────
CREATE TABLE IF NOT EXISTS public.simulacoes_colaborador (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id       UUID        NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  cliente_nome         TEXT        NOT NULL DEFAULT '',
  cliente_empresa      TEXT,
  cliente_cpf_cnpj     TEXT,
  cliente_telefone     TEXT,
  valor_solicitado     NUMERIC(15,2),
  quantidade_parcelas  INTEGER,
  taxa_juros_mensal    NUMERIC(8,4),
  comissao_percentual  NUMERIC(6,4),
  total_comissao       NUMERIC(15,2),
  valor_parcela        NUMERIC(15,2),
  valor_total_pagar    NUMERIC(15,2),
  total_juros          NUMERIC(15,2),
  custo_efetivo_total  NUMERIC(8,4),
  imposto_percentual   NUMERIC(6,4),
  total_imposto        NUMERIC(15,2),
  banco                TEXT,
  linha_credito        TEXT,
  observacoes          TEXT,
  status               TEXT        NOT NULL DEFAULT 'rascunho'
                         CHECK (status IN ('rascunho','pendente','em_analise','aprovado','reprovado','cancelado')),
  criado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 4. Tabela: crm_atividades ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_atividades (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  colaborador_id UUID        REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  tipo           TEXT        NOT NULL DEFAULT 'nota'
                   CHECK (tipo IN ('nota','ligacao','whatsapp','email','reuniao','proposta','documento','status_change','ia_acao','followup','outro')),
  titulo         TEXT        NOT NULL DEFAULT '',
  descricao      TEXT,
  resultado      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 5. Tabela: crm_documentos ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_documentos (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  nome          TEXT        NOT NULL,
  tipo          TEXT,
  status        TEXT        NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente','solicitado','recebido','aprovado','rejeitado')),
  obrigatorio   BOOLEAN     DEFAULT FALSE,
  observacao    TEXT,
  url_arquivo   TEXT,
  recebido_em   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 6. Tabela: crm_qualificacoes_ia ──────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_qualificacoes_ia (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id               UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  score                 INTEGER     CHECK (score BETWEEN 0 AND 100),
  probabilidade_aprovacao NUMERIC(5,2),
  linha_recomendada     TEXT,
  motivo_recomendacao   TEXT,
  pontos_atencao        TEXT[],
  proximos_passos       TEXT[],
  resumo                TEXT,
  modelo_ia             TEXT,
  versao_modelo         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 7. Tabela: crm_historico_funil ───────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_historico_funil (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  colaborador_id UUID        REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  etapa_anterior TEXT,
  etapa_nova     TEXT        NOT NULL,
  motivo         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 8. Tabela: crm_score_historico ───────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_score_historico (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  score       INTEGER     NOT NULL CHECK (score BETWEEN 0 AND 100),
  tipo        TEXT        NOT NULL DEFAULT 'ia' CHECK (tipo IN ('ia','manual','sistema')),
  motivo      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 9. Tabela: crm_recomendacoes_ia ──────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_recomendacoes_ia (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  linha_recomendada TEXT,
  probabilidade     NUMERIC(5,2),
  motivo            TEXT,
  pontos_atencao    TEXT[],
  proximos_passos   TEXT[],
  modelo_ia         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 10. Tabela: crm_eventos_webhook ──────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_eventos_webhook (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID        REFERENCES public.leads(id) ON DELETE SET NULL,
  evento      TEXT        NOT NULL,
  payload     JSONB,
  status      TEXT        DEFAULT 'recebido',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Índices ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_status         ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_etapa_funil    ON public.leads(etapa_funil);
CREATE INDEX IF NOT EXISTS idx_leads_origem         ON public.leads(origem);
CREATE INDEX IF NOT EXISTS idx_leads_responsavel    ON public.leads(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at     ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_utm_source     ON public.leads(utm_source) WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_simulacoes_colab     ON public.simulacoes_colaborador(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_crm_ativ_lead        ON public.crm_atividades(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_docs_lead        ON public.crm_documentos(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_qualif_lead      ON public.crm_qualificacoes_ia(lead_id);

-- ─── Triggers: updated_at automático ──────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leads_updated_at') THEN
    CREATE TRIGGER trg_leads_updated_at
      BEFORE UPDATE ON public.leads
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_colaboradores_updated_at') THEN
    CREATE TRIGGER trg_colaboradores_updated_at
      BEFORE UPDATE ON public.colaboradores
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_simulacoes_updated_at') THEN
    CREATE TRIGGER trg_simulacoes_updated_at
      BEFORE UPDATE ON public.simulacoes_colaborador
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_ativ_updated_at') THEN
    CREATE TRIGGER trg_crm_ativ_updated_at
      BEFORE UPDATE ON public.crm_atividades
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_docs_updated_at') THEN
    CREATE TRIGGER trg_crm_docs_updated_at
      BEFORE UPDATE ON public.crm_documentos
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ─── View: vw_crm_pipeline ────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_crm_pipeline AS
SELECT
  l.id,
  l.nome,
  l.telefone,
  l.email,
  l.empresa,
  l.tipo_pessoa,
  l.cpf_cnpj,
  l.cargo,
  l.cidade,
  l.estado,
  l.canal_origem,
  l.produto_interesse,
  l.valor_solicitado,
  l.prazo_meses,
  l.etapa_funil,
  l.temperatura,
  l.score_ia,
  l.score_manual,
  l.score_efetivo,
  l.tags,
  l.proximo_followup,
  l.ultimo_contato_em,
  l.resumo_ia,
  l.observacoes_ia,
  l.chatwoot_conv_id,
  l.responsavel_id,
  c.nome                                                        AS responsavel_nome,
  l.origem,
  l.status,
  l.created_at,
  l.updated_at,
  COALESCE(d.total_docs, 0)                                     AS total_docs,
  COALESCE(d.docs_recebidos, 0)                                 AS docs_recebidos,
  COALESCE(d.docs_pendentes_obrig, 0)                           AS docs_pendentes_obrig,
  a.titulo                                                      AS ultima_atividade,
  a.created_at                                                  AS ultima_atividade_em,
  EXTRACT(DAY FROM NOW() - COALESCE(l.ultimo_contato_em, l.created_at))::INTEGER AS dias_sem_contato
FROM public.leads l
LEFT JOIN public.colaboradores c ON c.id = l.responsavel_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                                                    AS total_docs,
    COUNT(*) FILTER (WHERE status IN ('recebido','aprovado'))   AS docs_recebidos,
    COUNT(*) FILTER (WHERE obrigatorio AND status = 'pendente') AS docs_pendentes_obrig
  FROM public.crm_documentos WHERE lead_id = l.id
) d ON TRUE
LEFT JOIN LATERAL (
  SELECT titulo, created_at
  FROM public.crm_atividades
  WHERE lead_id = l.id
  ORDER BY created_at DESC LIMIT 1
) a ON TRUE
WHERE l.etapa_funil NOT IN ('inativo');

-- ─── View: vw_leads_para_ia ───────────────────────────────────
CREATE OR REPLACE VIEW public.vw_leads_para_ia AS
SELECT
  l.id,
  l.nome,
  l.empresa,
  l.tipo_pessoa,
  l.produto_interesse,
  l.valor_solicitado,
  l.prazo_meses,
  l.origem,
  l.etapa_funil,
  l.temperatura,
  l.score_ia,
  l.score_efetivo,
  l.created_at,
  l.updated_at,
  (l.score_ia = 0 OR l.score_ia IS NULL)                        AS precisa_score,
  EXTRACT(DAY FROM NOW() - l.created_at)::INTEGER               AS dias_desde_criacao
FROM public.leads l
WHERE l.etapa_funil NOT IN ('ganho','perdido','inativo');

-- ─── Normaliza dados existentes ───────────────────────────────
-- Corrige etapa_funil com maiúsculo (bug do schema_fase1_1_delta)
UPDATE public.leads
SET etapa_funil = LOWER(etapa_funil)
WHERE etapa_funil IS DISTINCT FROM LOWER(etapa_funil);

-- Garante que leads sem etapa_funil recebam 'novo'
UPDATE public.leads
SET etapa_funil = 'novo'
WHERE etapa_funil IS NULL;

-- ─── Tabela: empresas ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.empresas (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social         TEXT         NOT NULL,
  nome_fantasia        TEXT,
  cnpj                 TEXT,
  inscricao_estadual   TEXT,
  email                TEXT,
  telefone             TEXT,
  whatsapp             TEXT,
  site                 TEXT,
  segmento             TEXT,
  porte                TEXT         DEFAULT 'mei'
                         CHECK (porte IN ('mei','me','epp','medio','grande')),
  faturamento_anual    NUMERIC(15,2),
  numero_funcionarios  INTEGER,
  -- Endereço
  cep                  TEXT,
  logradouro           TEXT,
  numero               TEXT,
  complemento          TEXT,
  bairro               TEXT,
  cidade               TEXT,
  estado               CHAR(2),
  -- Responsável / sócio
  responsavel_nome     TEXT,
  responsavel_cpf      TEXT,
  responsavel_cargo    TEXT,
  responsavel_telefone TEXT,
  responsavel_email    TEXT,
  -- Dados financeiros
  banco_principal      TEXT,
  agencia              TEXT,
  conta                TEXT,
  limite_credito_atual NUMERIC(15,2),
  score_serasa         INTEGER,
  score_spc            INTEGER,
  -- Relacionamento interno
  responsavel_id       UUID         REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  status               TEXT         NOT NULL DEFAULT 'ativo'
                         CHECK (status IN ('ativo','inativo','prospecto','cliente','ex_cliente')),
  origem               TEXT         DEFAULT 'manual',
  tags                 TEXT[]       DEFAULT '{}',
  observacoes          TEXT,
  -- Controle
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_empresas_razao_social ON public.empresas(razao_social);
CREATE INDEX IF NOT EXISTS idx_empresas_cnpj         ON public.empresas(cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_empresas_status       ON public.empresas(status);
CREATE INDEX IF NOT EXISTS idx_empresas_responsavel  ON public.empresas(responsavel_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_empresas_updated_at') THEN
    CREATE TRIGGER trg_empresas_updated_at
      BEFORE UPDATE ON public.empresas
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ─── FIM DA MIGRAÇÃO ─────────────────────────────────────────────
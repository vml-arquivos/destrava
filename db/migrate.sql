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
-- ─── REGRAS DOCUMENTAIS AGOSTO/2026 (081) ────────────────────────
CREATE TABLE IF NOT EXISTS public.documentos_observacoes_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo TEXT NOT NULL,
  entidade_id UUID NOT NULL,
  empresa_id UUID NULL,
  socio_id UUID NULL,
  tipo_documento TEXT NOT NULL,
  observacao TEXT NOT NULL DEFAULT '',
  criado_por TEXT NULL,
  atualizado_por TEXT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_documentos_observacoes_slots_contexto
  ON public.documentos_observacoes_slots (entidade_tipo, entidade_id, tipo_documento, COALESCE(socio_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_documentos_observacoes_slots_empresa ON public.documentos_observacoes_slots(empresa_id, tipo_documento);

DO $$
BEGIN
  IF to_regclass('public.documentacao_blocos') IS NOT NULL THEN
    UPDATE public.documentacao_blocos SET ordem=4, descricao='Histórico de arquivamentos lido antes do contrato para definir quais atos devem ser anexados.', configuracao=COALESCE(configuracao,'{}'::jsonb)||'{"etapa":"documentacao_societaria","sequencia_analise":1,"dispensa_mei_sem_ato":true}'::jsonb, atualizacao_em=NOW() WHERE codigo='atos_junta_comercial';
    UPDATE public.documentacao_blocos SET ordem=5, descricao='Contrato e alterações lidos depois dos Atos da Junta e conferidos por número, data, NIRE, CNPJ e QSA.', configuracao=COALESCE(configuracao,'{}'::jsonb)||'{"etapa":"documentacao_societaria","sequencia_analise":2}'::jsonb, atualizacao_em=NOW() WHERE codigo='contrato_social_alteracoes';
    UPDATE public.documentacao_blocos SET obrigatorio=false, descricao='Faturamento analisado quando anexado; não obrigatório.', configuracao=COALESCE(configuracao,'{}'::jsonb)||'{"documento_obrigatorio":false,"validar_ultimo_mes_fechado":true,"validar_assinaturas":true}'::jsonb, atualizacao_em=NOW() WHERE codigo='faturamento_historico';
  END IF;
  IF to_regclass('public.documentos_regras_credito') IS NOT NULL THEN
    UPDATE public.documentos_regras_credito SET ordem=40, condicao=COALESCE(condicao,'{}'::jsonb)||'{"sequencia_analise":1,"retroagir_ate_12_meses":true,"dispensa_mei_sem_ato":true,"permitir_outro_orgao_com_alerta":true}'::jsonb, descricao='Ler primeiro; solicitar atos anteriores até alcançar 12 meses. MEI sem ato é dispensado; outro órgão gera alerta sem bloquear a inclusão.', atualizado_em=NOW() WHERE codigo='empresa_atos_junta';
    UPDATE public.documentos_regras_credito SET ordem=50, condicao=COALESCE(condicao,'{}'::jsonb)||'{"sequencia_analise":2,"conferir_numero_ato":true,"conferir_cnpj":true,"conferir_qsa":true}'::jsonb, descricao='Ler depois dos Atos da Junta e conferir número do ato, data, NIRE, CNPJ e sócios do QSA.', atualizado_em=NOW() WHERE codigo='empresa_contrato_social';
    UPDATE public.documentos_regras_credito SET obrigatorio=false, condicao=COALESCE(condicao,'{}'::jsonb)||'{"quando_anexado":true,"ultimo_mes_fechado":true,"assinaturas_mesma_modalidade":true,"conferir_cnpj_qsa":true}'::jsonb, descricao='Opcional. Quando anexado, validar competências, fechamento mensal, assinaturas, CNPJ e administrador do QSA.', atualizado_em=NOW() WHERE codigo='empresa_faturamento_12m';
    UPDATE public.documentos_regras_credito SET validade_dias=NULL, condicao=COALESCE(condicao,'{}'::jsonb)||'{"validade_meses":2,"aplicar_todos_socios":true,"titular_divergente_exige_justificativa":true}'::jsonb, descricao='Comprovante individual por sócio, com validade máxima de dois meses; titular diferente exige justificativa.', atualizado_em=NOW() WHERE codigo='socio_comprovante_residencia';
    UPDATE public.documentos_regras_credito SET condicao=COALESCE(condicao,'{}'::jsonb)||'{"aplicar_todos_socios":true,"identificacao_socio_obrigatoria":true}'::jsonb, atualizado_em=NOW() WHERE entidade_tipo='socio';
  END IF;
END $$;
-- ─── CORREÇÃO DE PRONTIDÃO DOCUMENTAL E IA LOCAL (079) ─────────────
-- Idempotente e compatível com bancos que já receberam a migração 056.
DO $$
BEGIN
  IF to_regclass('public.documentacao_entidade_blocos') IS NOT NULL THEN
    ALTER TABLE public.documentacao_entidade_blocos
      DROP CONSTRAINT IF EXISTS documentacao_entidade_blocos_origem_chk;

    ALTER TABLE public.documentacao_entidade_blocos
      ADD CONSTRAINT documentacao_entidade_blocos_origem_chk CHECK (
        origem IN ('sistema','manual','receita','ia','documento_ia','migracao','sincronizacao')
      ) NOT VALID;

    ALTER TABLE public.documentacao_entidade_blocos
      VALIDATE CONSTRAINT documentacao_entidade_blocos_origem_chk;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.documentacao_blocos') IS NOT NULL THEN
    INSERT INTO public.documentacao_blocos
      (codigo, nome_amigavel, descricao, entidade_principal, obrigatorio, ordem, configuracao)
    VALUES
      ('enquadramento_tributario', 'Enquadramento Tributário / Simples Nacional',
       'Comprovante e validação do enquadramento tributário, opção pelo Simples Nacional e condição MEI.',
       'empresa', true, 3,
       '{"etapa":"identidade_cnpj","documento_inicial":true,"analise":"simples_nacional"}'::jsonb),
      ('contrato_social_alteracoes', 'Contrato Social e Alterações',
       'Contrato social vigente e alterações contratuais para conferência do NIRE e da data de registro.',
       'empresa', true, 4,
       '{"etapa":"documentacao_societaria","documento_inicial":false,"analise":"contrato_junta"}'::jsonb),
      ('atos_junta_comercial', 'Atos da Junta Comercial',
       'Certidão ou lista de arquivamentos para conferir NIRE e data de registro com o contrato/alteração social. O CNPJ é informativo.',
       'empresa', true, 5,
       '{"etapa":"documentacao_societaria","documento_inicial":false,"analise":"atos_junta_comercial"}'::jsonb)
    ON CONFLICT (codigo) DO UPDATE SET
      nome_amigavel = EXCLUDED.nome_amigavel,
      descricao = EXCLUDED.descricao,
      entidade_principal = EXCLUDED.entidade_principal,
      obrigatorio = EXCLUDED.obrigatorio,
      ordem = EXCLUDED.ordem,
      ativo = true,
      configuracao = COALESCE(public.documentacao_blocos.configuracao, '{}'::jsonb) || EXCLUDED.configuracao;
  END IF;
END $$;

-- A correção 081 deve ser a última autoridade de ordenação, inclusive quando
-- este arquivo agregado também contém o bloco legado 079 acima.
DO $$
BEGIN
  IF to_regclass('public.documentacao_blocos') IS NOT NULL THEN
    UPDATE public.documentacao_blocos SET ordem=4, descricao='Histórico de arquivamentos lido antes do contrato para definir quais atos devem ser anexados.', configuracao=COALESCE(configuracao,'{}'::jsonb)||'{"etapa":"documentacao_societaria","sequencia_analise":1,"dispensa_mei_sem_ato":true}'::jsonb, atualizacao_em=NOW() WHERE codigo='atos_junta_comercial';
    UPDATE public.documentacao_blocos SET ordem=5, descricao='Contrato e alterações lidos depois dos Atos da Junta e conferidos por número, data, NIRE, CNPJ e QSA.', configuracao=COALESCE(configuracao,'{}'::jsonb)||'{"etapa":"documentacao_societaria","sequencia_analise":2}'::jsonb, atualizacao_em=NOW() WHERE codigo='contrato_social_alteracoes';
    UPDATE public.documentacao_blocos SET obrigatorio=false, descricao='Faturamento analisado quando anexado; não obrigatório.', configuracao=COALESCE(configuracao,'{}'::jsonb)||'{"documento_obrigatorio":false,"validar_ultimo_mes_fechado":true,"validar_assinaturas":true}'::jsonb, atualizacao_em=NOW() WHERE codigo='faturamento_historico';
  END IF;
END $$;


-- ─── MIGRAÇÃO 086: score básico persistido na captura e na fila ──────────────
-- Espelho idempotente de db/migrations/086_onda_0_crm_score_basico.sql.
ALTER TABLE IF EXISTS public.leads
  ADD COLUMN IF NOT EXISTS score_basico INTEGER;
ALTER TABLE IF EXISTS public.leads
  DROP CONSTRAINT IF EXISTS leads_score_basico_check;
ALTER TABLE IF EXISTS public.leads
  ADD CONSTRAINT leads_score_basico_check
  CHECK (score_basico IS NULL OR score_basico BETWEEN 0 AND 100) NOT VALID;

ALTER TABLE IF EXISTS public.triagem_leads
  ADD COLUMN IF NOT EXISTS score_basico INTEGER;
ALTER TABLE IF EXISTS public.triagem_leads
  DROP CONSTRAINT IF EXISTS triagem_leads_score_basico_check;
ALTER TABLE IF EXISTS public.triagem_leads
  ADD CONSTRAINT triagem_leads_score_basico_check
  CHECK (score_basico IS NULL OR score_basico BETWEEN 0 AND 100) NOT VALID;

UPDATE public.leads
SET score_basico = LEAST(100, GREATEST(0,
  (CASE WHEN valor_solicitado > 0 THEN LEAST(30, GREATEST(0, ROUND((LN(valor_solicitado) / LN(5000000) * 30)::numeric))) ELSE 0 END)::integer
  + CASE WHEN prazo_meses >= 60 THEN 20 WHEN prazo_meses >= 36 THEN 15 WHEN prazo_meses >= 24 THEN 10 WHEN prazo_meses >= 12 THEN 5 WHEN prazo_meses > 0 THEN 2 ELSE 0 END
  + (CASE WHEN NULLIF(BTRIM(nome), '') IS NOT NULL THEN 6 ELSE 0 END)
  + (CASE WHEN NULLIF(BTRIM(telefone), '') IS NOT NULL THEN 6 ELSE 0 END)
  + (CASE WHEN NULLIF(BTRIM(email), '') IS NOT NULL THEN 6 ELSE 0 END)
  + (CASE WHEN NULLIF(BTRIM(empresa), '') IS NOT NULL THEN 6 ELSE 0 END)
  + (CASE WHEN NULLIF(BTRIM(cpf_cnpj), '') IS NOT NULL THEN 6 ELSE 0 END)
  + CASE temperatura WHEN 'urgente' THEN 20 WHEN 'quente' THEN 15 WHEN 'morno' THEN 8 ELSE 0 END
))::integer
WHERE score_basico IS NULL;

DO $$
BEGIN
  IF to_regclass('public.triagem_leads') IS NOT NULL THEN
    UPDATE public.triagem_leads
    SET score_basico = LEAST(100, GREATEST(0,
      (CASE WHEN valor > 0 THEN LEAST(30, GREATEST(0, ROUND((LN(valor) / LN(5000000) * 30)::numeric))) ELSE 0 END)::integer
      + CASE WHEN prazo >= 60 THEN 20 WHEN prazo >= 36 THEN 15 WHEN prazo >= 24 THEN 10 WHEN prazo >= 12 THEN 5 WHEN prazo > 0 THEN 2 ELSE 0 END
      + (CASE WHEN NULLIF(BTRIM(nome), '') IS NOT NULL THEN 6 ELSE 0 END)
      + (CASE WHEN NULLIF(BTRIM(telefone), '') IS NOT NULL THEN 6 ELSE 0 END)
      + (CASE WHEN NULLIF(BTRIM(email), '') IS NOT NULL THEN 6 ELSE 0 END)
      + (CASE WHEN NULLIF(BTRIM(empresa), '') IS NOT NULL THEN 6 ELSE 0 END)
      + (CASE WHEN NULLIF(BTRIM(cpf_cnpj), '') IS NOT NULL THEN 6 ELSE 0 END)
      + 8
    ))::integer
    WHERE score_basico IS NULL;
    CREATE INDEX IF NOT EXISTS idx_triagem_score_basico ON public.triagem_leads(score_basico DESC NULLS LAST);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_leads_score_basico ON public.leads(score_basico DESC NULLS LAST);

DO $$
BEGIN
  IF to_regclass('public.leads') IS NOT NULL THEN
    ALTER TABLE public.leads VALIDATE CONSTRAINT leads_score_basico_check;
  END IF;
  IF to_regclass('public.triagem_leads') IS NOT NULL THEN
    ALTER TABLE public.triagem_leads VALIDATE CONSTRAINT triagem_leads_score_basico_check;
  END IF;
END $$;

-- ─── MIGRAÇÃO 087: origem e idempotência do lembrete de maturidade empresarial ───
ALTER TABLE IF EXISTS public.empresa_followups
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'manual';
DO $$
BEGIN
  IF to_regclass('public.empresa_followups') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_empresa_followups_maturidade_unica
      ON public.empresa_followups(empresa_id)
      WHERE origem = 'maturidade_12_meses';
  END IF;
END $$;


-- ─── MIGRAÇÃO 088: foto opcional do colaborador para ficha cadastral/PDF ───
ALTER TABLE IF EXISTS public.colaboradores
  ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- ─── MIGRAÇÃO 089: indicação rastreável mínima ──────────────────────────────
ALTER TABLE IF EXISTS public.parceiros_comerciais
  ADD COLUMN IF NOT EXISTS codigo_indicacao TEXT;
ALTER TABLE IF EXISTS public.leads
  ADD COLUMN IF NOT EXISTS codigo_indicacao TEXT,
  ADD COLUMN IF NOT EXISTS parceiro_indicador_id UUID;
ALTER TABLE IF EXISTS public.triagem_leads
  ADD COLUMN IF NOT EXISTS codigo_indicacao TEXT,
  ADD COLUMN IF NOT EXISTS parceiro_indicador_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_parceiros_codigo_indicacao
  ON public.parceiros_comerciais (codigo_indicacao)
  WHERE codigo_indicacao IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_parceiro_indicador
  ON public.leads (parceiro_indicador_id)
  WHERE parceiro_indicador_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_triagem_leads_parceiro_indicador
  ON public.triagem_leads (parceiro_indicador_id)
  WHERE parceiro_indicador_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_codigo_indicacao
  ON public.leads (codigo_indicacao)
  WHERE codigo_indicacao IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_triagem_leads_codigo_indicacao
  ON public.triagem_leads (codigo_indicacao)
  WHERE codigo_indicacao IS NOT NULL;

-- ─── MIGRAÇÃO 090: links seguros de cadastro por convite ────────────────────
CREATE TABLE IF NOT EXISTS public.convites_cadastro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('parceiro', 'captador')),
  cargo TEXT NOT NULL DEFAULT 'Captador Externo',
  criado_por UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  usado_por UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  revogado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_convites_cadastro_expira
  ON public.convites_cadastro (expira_em);
CREATE INDEX IF NOT EXISTS idx_convites_cadastro_usado_por
  ON public.convites_cadastro (usado_por)
  WHERE usado_por IS NOT NULL;
ALTER TABLE IF EXISTS public.colaboradores
  ADD COLUMN IF NOT EXISTS convite_cadastro_id UUID;
ALTER TABLE IF EXISTS public.parceiros_comerciais
  ADD COLUMN IF NOT EXISTS colaborador_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_parceiros_colaborador_id
  ON public.parceiros_comerciais (colaborador_id)
  WHERE colaborador_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_colaboradores_convite_cadastro
  ON public.colaboradores (convite_cadastro_id)
  WHERE convite_cadastro_id IS NOT NULL;

-- ─── MIGRAÇÃO 091: unicidade operacional de metas comerciais ───────────────
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_metas_colaborador_periodo
  ON public.crm_metas (colaborador_id, periodo);
CREATE INDEX IF NOT EXISTS idx_crm_metas_periodo
  ON public.crm_metas (periodo);
COMMIT;

-- ─── MIGRAÇÃO 092: reconciliação dos campos de IA usados pelo CRM ───────────
BEGIN;
ALTER TABLE IF EXISTS public.leads
  ADD COLUMN IF NOT EXISTS probabilidade_aprovacao INTEGER
    CHECK (probabilidade_aprovacao BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS probabilidade_conversao INTEGER
    CHECK (probabilidade_conversao BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS proxima_acao_ia TEXT,
  ADD COLUMN IF NOT EXISTS linha_recomendada TEXT,
  ADD COLUMN IF NOT EXISTS prazo_aprovacao_estimado TEXT,
  ADD COLUMN IF NOT EXISTS analise_credito_ia TEXT,
  ADD COLUMN IF NOT EXISTS ia_ativa BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ia_pausada_ate TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ia_motivo_pausa TEXT;
ALTER TABLE IF EXISTS public.triagem_leads
  ADD COLUMN IF NOT EXISTS ia_ativa BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ia_pausada_ate TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_leads_ia_ativa
  ON public.leads (ia_ativa)
  WHERE ia_ativa = TRUE;
COMMIT;

-- ─── MIGRAÇÃO 093: vínculo opcional de orçamento ao lead de origem ─────────
BEGIN;
ALTER TABLE IF EXISTS public.orcamentos_timbrados
  ADD COLUMN IF NOT EXISTS lead_id UUID
    REFERENCES public.leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orcamentos_timbrados_lead_id
  ON public.orcamentos_timbrados (lead_id)
  WHERE lead_id IS NOT NULL;
COMMIT;

-- ─── MIGRAÇÃO 094: função de movimentação/histórico do funil ───────────────
CREATE OR REPLACE FUNCTION public.crm_mover_funil(
  p_lead_id    UUID,
  p_nova_etapa TEXT,
  p_motivo     TEXT DEFAULT NULL,
  p_collab_id  UUID DEFAULT NULL,
  p_origem_ia  BOOLEAN DEFAULT FALSE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_etapa_atual TEXT;
  v_hist_id UUID;
BEGIN
  SELECT etapa_funil::TEXT INTO v_etapa_atual
    FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead % não encontrado', p_lead_id;
  END IF;
  IF v_etapa_atual IS NOT DISTINCT FROM p_nova_etapa THEN RETURN NULL; END IF;
  INSERT INTO public.crm_historico_funil
    (lead_id, etapa_de, etapa_para, motivo, colaborador_id, origem_ia)
  VALUES
    (p_lead_id, v_etapa_atual, p_nova_etapa, p_motivo, p_collab_id, p_origem_ia)
  RETURNING id INTO v_hist_id;
  UPDATE public.leads SET
    etapa_funil = p_nova_etapa,
    updated_at = NOW(),
    status = p_nova_etapa
  WHERE id = p_lead_id;
  INSERT INTO public.crm_atividades
    (lead_id, colaborador_id, tipo, titulo, descricao, origem_ia, concluido)
  VALUES (
    p_lead_id, p_collab_id, 'status_change',
    'Movido para: ' || p_nova_etapa,
    COALESCE(p_motivo, 'Movimentação no funil'),
    p_origem_ia, TRUE
  );
  RETURN v_hist_id;
END;
$$;

-- ─── MIGRAÇÃO 095: coleta pública guiada de documentos ─────────────────────
CREATE TABLE IF NOT EXISTS public.links_coleta_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ativo',
  criado_por UUID NULL REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  expira_em TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluido_em TIMESTAMPTZ NULL,
  revogado_em TIMESTAMPTZ NULL,
  CONSTRAINT links_coleta_documentos_status_chk CHECK (status IN ('ativo','expirado','concluido','revogado'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_links_coleta_documentos_empresa_ativo
  ON public.links_coleta_documentos (empresa_id)
  WHERE status = 'ativo';
CREATE INDEX IF NOT EXISTS idx_links_coleta_documentos_empresa
  ON public.links_coleta_documentos (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_links_coleta_documentos_expira
  ON public.links_coleta_documentos (expira_em)
  WHERE status = 'ativo';
CREATE TABLE IF NOT EXISTS public.coleta_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES public.links_coleta_documentos(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  etapa_numero INTEGER NOT NULL,
  item_codigo TEXT NOT NULL,
  tipo_documento_solicitado TEXT NOT NULL,
  tipo_documento_fisico TEXT NOT NULL,
  documento_arquivo_id UUID NULL REFERENCES public.documentos_arquivos(id) ON DELETE SET NULL,
  analise_extracao_id UUID NULL,
  status TEXT NOT NULL DEFAULT 'pendente_analise',
  analise_status TEXT NULL,
  analise_resultado JSONB NOT NULL DEFAULT '{}'::jsonb,
  motivo_revisao TEXT NULL,
  revisado_por UUID NULL REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  revisado_em TIMESTAMPTZ NULL,
  promovido_em TIMESTAMPTZ NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coleta_documentos_status_chk CHECK (status IN ('pendente_analise','processando','promovido','revisao_humana','recusado','substituido'))
);
CREATE INDEX IF NOT EXISTS idx_coleta_documentos_link
  ON public.coleta_documentos (link_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_coleta_documentos_empresa
  ON public.coleta_documentos (empresa_id, status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_coleta_documentos_item
  ON public.coleta_documentos (link_id, item_codigo, status, criado_em DESC);
-- Cofre documental público livre, separado de empresas, clientes PF e leads.
-- Aditiva: não altera tabelas existentes nem promove vínculos automaticamente.

CREATE TABLE IF NOT EXISTS public.links_cofre_documentos_publico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  rotulo TEXT NULL,
  status TEXT NOT NULL DEFAULT 'ativo',
  criado_por UUID NULL REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  expira_em TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revogado_em TIMESTAMPTZ NULL,
  CONSTRAINT links_cofre_documentos_publico_status_chk CHECK (status IN ('ativo','expirado','revogado','concluido'))
);

CREATE INDEX IF NOT EXISTS idx_links_cofre_documentos_publico_status_expira
  ON public.links_cofre_documentos_publico (status, expira_em);
CREATE INDEX IF NOT EXISTS idx_links_cofre_documentos_publico_criado_por
  ON public.links_cofre_documentos_publico (criado_por, created_at DESC);

CREATE TABLE IF NOT EXISTS public.cofre_documentos_publico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES public.links_cofre_documentos_publico(id) ON DELETE CASCADE,
  tipo_pessoa TEXT NOT NULL,
  nome_remetente TEXT NOT NULL,
  documento_tipo TEXT NULL,
  documento_valor TEXT NULL,
  nome_organizacao TEXT NULL,
  email_remetente TEXT NULL,
  telefone_remetente TEXT NULL,
  tipo_documento TEXT NOT NULL DEFAULT 'outros',
  descricao_documento TEXT NULL,
  nome_original TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  caminho_arquivo TEXT NOT NULL,
  mime_type TEXT NULL,
  tamanho_bytes BIGINT NULL,
  hash_arquivo TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pendente_analise',
  analise_status TEXT NULL,
  analise_resultado JSONB NOT NULL DEFAULT '{}'::jsonb,
  analise_extracao_id UUID NULL,
  motivo_revisao TEXT NULL,
  consentimento BOOLEAN NOT NULL DEFAULT false,
  consentido_em TIMESTAMPTZ NULL,
  origem_ip_hash TEXT NULL,
  user_agent_hash TEXT NULL,
  revisado_por UUID NULL REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  revisado_em TIMESTAMPTZ NULL,
  observacoes_internas TEXT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cofre_documentos_publico_tipo_pessoa_chk CHECK (tipo_pessoa IN ('pf','pj')),
  CONSTRAINT cofre_documentos_publico_status_chk CHECK (status IN ('pendente_analise','processando','revisao_humana','aceito','recusado','arquivado')),
  CONSTRAINT cofre_documentos_publico_consentimento_chk CHECK (consentimento = true),
  CONSTRAINT cofre_documentos_publico_identificacao_chk CHECK (
    (tipo_pessoa = 'pf' AND nome_remetente <> '') OR
    (tipo_pessoa = 'pj' AND nome_remetente <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_cofre_documentos_publico_link
  ON public.cofre_documentos_publico (link_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cofre_documentos_publico_status
  ON public.cofre_documentos_publico (status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cofre_documentos_publico_documento
  ON public.cofre_documentos_publico (documento_tipo, documento_valor);
CREATE INDEX IF NOT EXISTS idx_cofre_documentos_publico_hash
  ON public.cofre_documentos_publico (hash_arquivo);
-- Dossiês isolados do cofre público livre.
-- Cada sessão de remetente possui um token próprio; documentos nunca são
-- agrupados apenas pelo link compartilhável, evitando mistura entre PF/PJ.
CREATE TABLE IF NOT EXISTS public.cofre_dossies_publico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES public.links_cofre_documentos_publico(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  tipo_pessoa TEXT NOT NULL,
  nome_remetente TEXT NOT NULL,
  documento_tipo TEXT NULL,
  documento_valor TEXT NULL,
  nome_organizacao TEXT NULL,
  email_remetente TEXT NULL,
  telefone_remetente TEXT NULL,
  status TEXT NOT NULL DEFAULT 'ativo',
  consentimento BOOLEAN NOT NULL DEFAULT false,
  consentido_em TIMESTAMPTZ NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  encerrado_em TIMESTAMPTZ NULL,
  CONSTRAINT cofre_dossies_publico_tipo_pessoa_chk CHECK (tipo_pessoa IN ('pf','pj')),
  CONSTRAINT cofre_dossies_publico_status_chk CHECK (status IN ('ativo','encerrado','arquivado')),
  CONSTRAINT cofre_dossies_publico_consentimento_chk CHECK (consentimento = true),
  CONSTRAINT cofre_dossies_publico_nome_chk CHECK (length(trim(nome_remetente)) >= 2)
);
CREATE INDEX IF NOT EXISTS idx_cofre_dossies_publico_link_status
  ON public.cofre_dossies_publico (link_id, status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cofre_dossies_publico_documento
  ON public.cofre_dossies_publico (documento_tipo, documento_valor);

ALTER TABLE public.cofre_documentos_publico
  ADD COLUMN IF NOT EXISTS dossie_id UUID NULL REFERENCES public.cofre_dossies_publico(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_cofre_documentos_publico_dossie
  ON public.cofre_documentos_publico (dossie_id, criado_em DESC);

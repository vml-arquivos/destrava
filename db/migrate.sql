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


-- ============================================================
-- Migration 098: catálogo documental, regras versionadas, IA e prontidão financeira
-- ============================================================
-- Migration 098 — catálogo documental, regras versionadas, IA auditável e prontidão financeira.
-- Idempotente e aditiva. Não apaga documentos, análises, tabelas ou dados legados.

CREATE TABLE IF NOT EXISTS public.documentos_catalogo (
  tipo_documento TEXT PRIMARY KEY,
  nome_amigavel TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'outros',
  escopo TEXT NOT NULL DEFAULT 'empresa',
  uploadavel BOOLEAN NOT NULL DEFAULT TRUE,
  tipo_canonico TEXT NULL,
  fonte_automatica TEXT NULL,
  analise TEXT NULL,
  prompt_codigo TEXT NULL,
  tipo_exigencia TEXT NOT NULL DEFAULT 'documento_complementar',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  catalogo_versao TEXT NOT NULL DEFAULT '2026.08.29',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.documentos_catalogo
  (tipo_documento, nome_amigavel, categoria, escopo, uploadavel, tipo_canonico, fonte_automatica, analise, prompt_codigo, tipo_exigencia)
VALUES
  ('cartao_cnpj','Cartão CNPJ','cadastral','empresa',true,null,null,'cartao_cnpj','cnpj_receita_cartao','obrigacao_legal'),
  ('cnpj_cartao','Cartão CNPJ (legado)','cadastral','empresa',true,'cartao_cnpj',null,'cartao_cnpj','cnpj_receita_cartao','obrigacao_legal'),
  ('qsa','QSA / Quadro societário','societario','empresa',true,null,null,'qsa','qsa_extract','obrigacao_legal'),
  ('atos_junta_comercial','Atos da Junta Comercial','societario','empresa',true,null,null,'atos_junta_comercial','atos_junta_extract','obrigacao_legal'),
  ('contrato_social','Contrato social','societario','empresa',true,null,null,'contrato_social','contrato_social_extract','obrigacao_legal'),
  ('alteracao_contratual','Alteração contratual','societario','empresa',true,null,null,'contrato_social','contrato_social_extract','obrigacao_legal'),
  ('contrato_prestacao_servicos','Contrato de prestação de serviços','contrato','empresa',true,null,null,null,null,'obrigacao_legal'),
  ('contrato_assessoria','Contrato de assessoria','contrato','empresa',true,null,null,null,null,'obrigacao_legal'),
  ('contrato_gerado','Contrato gerado pelo sistema','contrato','empresa',true,null,null,null,null,'documento_complementar'),
  ('contrato_assinado','Contrato assinado','contrato','empresa',true,null,null,null,null,'obrigacao_legal'),
  ('nire','NIRE / registro empresarial','societario','empresa',true,null,null,null,null,'obrigacao_legal'),
  ('estatuto','Estatuto social','societario','empresa',true,null,null,null,null,'obrigacao_legal'),
  ('ata','Ata societária','societario','empresa',true,null,null,null,null,'obrigacao_legal'),
  ('procuracao','Procuração','societario','empresa',true,null,null,null,null,'obrigacao_legal'),
  ('registro_oab','Registro/ato da OAB','societario','empresa',true,null,null,null,null,'obrigacao_legal'),
  ('enquadramento_tributario_cnpj','Enquadramento tributário da empresa','fiscal','empresa',true,null,'receita_federal','simples_nacional','simples_extract','obrigacao_legal'),
  ('enquadramento_tributario_cpf','Enquadramento tributário do CPF','fiscal','socio',true,null,null,null,null,'documento_complementar'),
  ('situacao_fiscal_cnpj','Situação fiscal do CNPJ','regularidade','empresa',true,null,null,null,null,'documento_complementar'),
  ('situacao_fiscal_cpf','Situação fiscal do CPF','regularidade','socio',true,null,null,null,null,'documento_complementar'),
  ('documento_socio','Documento de identificação do sócio','socio','socio',true,null,null,null,null,'obrigacao_legal'),
  ('rg','RG','socio','socio',true,null,null,null,null,'obrigacao_legal'),
  ('cpf','CPF','socio','socio',true,null,null,null,null,'obrigacao_legal'),
  ('cnh','CNH','socio','socio',true,null,null,null,null,'obrigacao_legal'),
  ('rg_socio','RG do sócio (legado)','socio','socio',true,'rg',null,null,null,'obrigacao_legal'),
  ('cpf_socio','CPF do sócio (legado)','socio','socio',true,'cpf',null,null,null,'obrigacao_legal'),
  ('cnh_socio','CNH do sócio (legado)','socio','socio',true,'cnh',null,null,null,'obrigacao_legal'),
  ('comprovante_residencia','Comprovante de residência','socio','socio',true,null,null,'comprovante_residencia','comprovante_residencia_extract','obrigacao_legal'),
  ('comprovante_endereco','Comprovante de endereço (legado)','socio','socio',true,'comprovante_residencia',null,'comprovante_residencia','comprovante_residencia_extract','obrigacao_legal'),
  ('comprovante_residencia_socio','Comprovante de residência do sócio (legado)','socio','socio',true,'comprovante_residencia',null,'comprovante_residencia','comprovante_residencia_extract','obrigacao_legal'),
  ('imposto_renda','Imposto de renda da pessoa física','socio','socio',true,null,null,'irpf','irpf_extract','documento_complementar'),
  ('irpf','IRPF','socio','socio',true,'imposto_renda',null,'irpf','irpf_extract','documento_complementar'),
  ('irpf_socio','IRPF do sócio (legado)','socio','socio',true,'imposto_renda',null,'irpf','irpf_extract','documento_complementar'),
  ('recibo_irpf','Recibo de entrega do IRPF','socio','socio',true,null,null,'irpf','irpf_extract','documento_complementar'),
  ('certidao_casamento','Certidão de casamento','socio','socio',true,null,null,null,null,'documento_complementar'),
  ('certidao_nascimento','Certidão de nascimento','socio','socio',true,null,null,null,null,'documento_complementar'),
  ('averbacao_divorcio','Averbação de divórcio','socio','socio',true,null,null,null,null,'documento_complementar'),
  ('certidao_obito','Certidão de óbito','socio','socio',true,null,null,null,null,'documento_complementar'),
  ('cnd_rfb_cnpj','CND/CPEND Federal do CNPJ','regularidade','empresa',true,null,null,'cnd_cpend','cnd_cpend_extract','obrigacao_legal'),
  ('cnd_rfb_cpf','CND/CPEND Federal do CPF','regularidade','socio',true,null,null,'cnd_cpend','cnd_cpend_extract','obrigacao_legal'),
  ('cnd_cpend_federal','CND/CPEND Federal (nome explícito)','regularidade','empresa',true,'cnd_rfb_cnpj',null,'cnd_cpend','cnd_cpend_extract','obrigacao_legal'),
  ('cnd_receita_inss','CND Receita Federal/INSS (legado)','regularidade','empresa',true,'cnd_rfb_cnpj',null,null,null,'obrigacao_legal'),
  ('pgfn_cnpj','Regularidade PGFN / Dívida Ativa da União','regularidade','empresa',true,null,null,'cnd_cpend','cnd_cpend_extract','politica_bancaria'),
  ('pgfn_cpf','Regularidade PGFN do CPF','regularidade','socio',true,null,null,'cnd_cpend','cnd_cpend_extract','politica_bancaria'),
  ('cadin_cnpj','CADIN do CNPJ','regularidade','empresa',true,null,null,'cnd_cpend','cnd_cpend_extract','politica_bancaria'),
  ('cadin_cpf','CADIN do CPF','regularidade','socio',true,null,null,'cnd_cpend','cnd_cpend_extract','politica_bancaria'),
  ('crf_fgts','Certificado de Regularidade do FGTS','regularidade','empresa',true,null,null,'crf_fgts','crf_fgts_extract','obrigacao_legal'),
  ('fgts','FGTS (legado)','regularidade','empresa',true,'crf_fgts',null,'crf_fgts','crf_fgts_extract','obrigacao_legal'),
  ('cndt','Certidão Negativa de Débitos Trabalhistas','regularidade','empresa',true,null,null,'cndt','cndt_extract','politica_bancaria'),
  ('cndt_trabalhista','CNDT Trabalhista (legado)','regularidade','empresa',true,'cndt',null,'cndt','cndt_extract','politica_bancaria'),
  ('certidao_trabalhista','Certidão trabalhista (legado)','regularidade','empresa',true,'cndt',null,'cndt','cndt_extract','politica_bancaria'),
  ('cnd_estadual','CND estadual','regularidade','empresa',true,null,null,'cnd_estadual','cnd_estadual_extract','politica_bancaria'),
  ('certidao_estadual','Certidão estadual (legado)','regularidade','empresa',true,'cnd_estadual',null,'cnd_estadual','cnd_estadual_extract','politica_bancaria'),
  ('cnd_municipal','CND municipal','regularidade','empresa',true,null,null,'cnd_municipal','cnd_municipal_extract','politica_bancaria'),
  ('certidao_municipal','Certidão municipal (legado)','regularidade','empresa',true,'cnd_municipal',null,'cnd_municipal','cnd_municipal_extract','politica_bancaria'),
  ('certidao','Certidão genérica','regularidade','empresa',true,null,null,null,null,'documento_complementar'),
  ('rating_bacen_cnpj','SCR/Rating BACEN do CNPJ','credito','empresa',true,null,null,'scr','scr_extract','boa_pratica_analise'),
  ('scr_cnpj','SCR do CNPJ','credito','empresa',true,'rating_bacen_cnpj',null,'scr','scr_extract','boa_pratica_analise'),
  ('relatorio_scr','Relatório SCR/Registrato','credito','empresa',true,'rating_bacen_cnpj',null,'scr','scr_extract','boa_pratica_analise'),
  ('rating_bacen_cpf','SCR/Rating BACEN do CPF','credito','socio',true,null,null,'scr','scr_extract','boa_pratica_analise'),
  ('scr_cpf','SCR do CPF','credito','socio',true,'rating_bacen_cpf',null,'scr','scr_extract','boa_pratica_analise'),
  ('ccs_cnpj','CCS do CNPJ','credito','empresa',true,null,null,'ccs','ccs_extract','boa_pratica_analise'),
  ('ccs_cpf','CCS do CPF','credito','socio',true,null,null,'ccs','ccs_extract','boa_pratica_analise'),
  ('ccf_cnpj','CCF do CNPJ','credito','empresa',true,null,null,'ccf','ccf_extract','boa_pratica_analise'),
  ('ccf_cpf','CCF do CPF','credito','socio',true,null,null,'ccf','ccf_extract','boa_pratica_analise'),
  ('cenprot_cnpj','CENPROT do CNPJ','credito','empresa',true,null,null,'cenprot','cenprot_extract','politica_bancaria'),
  ('cenprot_cpf','CENPROT do CPF','credito','socio',true,null,null,'cenprot','cenprot_extract','politica_bancaria'),
  ('consulta_serasa_cnpj','Consulta Serasa do CNPJ','credito','empresa',true,null,null,'serasa','serasa_extract','politica_bancaria'),
  ('consulta_serasa_cpf','Consulta Serasa do CPF','credito','socio',true,null,null,'serasa','serasa_extract','politica_bancaria'),
  ('score_serasa','Score Serasa (legado)','credito','empresa',true,'consulta_serasa_cnpj',null,'serasa','serasa_extract','politica_bancaria'),
  ('score_boavista','Score Boa Vista (legado)','credito','empresa',true,null,null,'serasa','serasa_extract','politica_bancaria'),
  ('restricoes_cnpj','Restrições no CNPJ (legado)','credito','empresa',true,null,null,'serasa','serasa_extract','politica_bancaria'),
  ('restricoes_cpf_socio','Restrições no CPF do sócio (legado)','credito','socio',true,null,null,'serasa','serasa_extract','politica_bancaria'),
  ('simples_nacional','Comprovação do Simples Nacional','fiscal','empresa',true,null,null,'simples_nacional','simples_extract','obrigacao_legal'),
  ('pgdas','PGDAS-D','fiscal','empresa',true,null,null,'pgdas','pgdas_extract','obrigacao_legal'),
  ('pgdas_d','PGDAS-D (nome explícito)','fiscal','empresa',true,'pgdas',null,'pgdas','pgdas_extract','obrigacao_legal'),
  ('recibo_pgdas','Recibo PGDAS-D','fiscal','empresa',true,'pgdas',null,'pgdas','pgdas_extract','documento_complementar'),
  ('pgmei','PGMEI','fiscal','empresa',true,null,null,'pgmei','pgmei_extract','obrigacao_legal'),
  ('recibo_pgmei','Recibo PGMEI','fiscal','empresa',true,'pgmei',null,'pgmei','pgmei_extract','documento_complementar'),
  ('das_mei','DAS-MEI','fiscal','empresa',true,null,null,'das_mei','das_mei_extract','obrigacao_legal'),
  ('ecf','ECF','fiscal','empresa',true,null,null,'ecf','ecf_extract','obrigacao_legal'),
  ('recibo_ecf','Recibo ECF','fiscal','empresa',true,'ecf',null,'ecf','ecf_extract','obrigacao_legal'),
  ('ecd','ECD','contabil','empresa',true,null,null,'ecd','ecd_extract','obrigacao_legal'),
  ('recibo_ecd','Recibo ECD','contabil','empresa',true,'ecd',null,'ecd','ecd_extract','obrigacao_legal'),
  ('defis','DEFIS','fiscal','empresa',true,null,null,'defis','defis_extract','obrigacao_legal'),
  ('recibo_defis','Recibo DEFIS','fiscal','empresa',true,'defis',null,'defis','defis_extract','obrigacao_legal'),
  ('dasn_simei','DASN-SIMEI','fiscal','empresa',true,null,null,'dasn_simei','dasn_simei_extract','obrigacao_legal'),
  ('recibo_dasn_simei','Recibo DASN-SIMEI','fiscal','empresa',true,'dasn_simei',null,'dasn_simei','dasn_simei_extract','obrigacao_legal'),
  ('ccmei','CCMEI','fiscal','empresa',true,null,null,'ccmei','ccmei_extract','obrigacao_legal'),
  ('irpj','IRPJ (legado)','fiscal','empresa',true,null,null,'irpj','irpj_extract','obrigacao_legal'),
  ('dctf','DCTF','fiscal','empresa',true,null,null,'dctf_mit','dctf_mit_extract','obrigacao_legal'),
  ('dctfweb','DCTFWeb','fiscal','empresa',true,null,null,'dctf_mit','dctf_mit_extract','obrigacao_legal'),
  ('mit','MIT','fiscal','empresa',true,null,null,'dctf_mit','dctf_mit_extract','obrigacao_legal'),
  ('darf','DARF','fiscal','empresa',true,null,null,'darf','darf_extract','obrigacao_legal'),
  ('efd_contribuicoes','EFD-Contribuições','fiscal','empresa',true,null,null,'efd','efd_extract','obrigacao_legal'),
  ('efd_icms_ipi','EFD ICMS/IPI','fiscal','empresa',true,null,null,'efd','efd_extract','obrigacao_legal'),
  ('esocial','eSocial','trabalhista','empresa',true,null,null,'esocial','esocial_extract','politica_bancaria'),
  ('efd_reinf','EFD-Reinf','trabalhista','empresa',true,null,null,'efd_reinf','efd_reinf_extract','politica_bancaria'),
  ('efd','EFD (legado)','fiscal','empresa',true,'efd_contribuicoes',null,'efd','efd_extract','obrigacao_legal'),
  ('livro_caixa','Livro Caixa','contabil','empresa',true,null,null,'livro_caixa','livro_caixa_extract','obrigacao_legal'),
  ('balanco','Balanço Patrimonial','contabil','empresa',true,null,null,'balanco','balanco_extract','boa_pratica_analise'),
  ('balanco_patrimonial','Balanço Patrimonial (legado)','contabil','empresa',true,'balanco',null,'balanco','balanco_extract','boa_pratica_analise'),
  ('dre','DRE','contabil','empresa',true,null,null,'dre','dre_extract','boa_pratica_analise'),
  ('dfc','DFC','contabil','empresa',true,null,null,'dfc','dfc_extract','boa_pratica_analise'),
  ('dmpl','DMPL','contabil','empresa',true,null,null,'dmpl','dmpl_extract','boa_pratica_analise'),
  ('notas_explicativas','Notas explicativas','contabil','empresa',true,null,null,'notas_explicativas','notas_explicativas_extract','boa_pratica_analise'),
  ('balancete','Balancete','contabil','empresa',true,null,null,'balancete','balancete_extract','boa_pratica_analise'),
  ('razao_contabil','Razão contábil','contabil','empresa',true,null,null,'razao_contabil','razao_contabil_extract','boa_pratica_analise'),
  ('faturamento_12_meses','Faturamento dos últimos 12 meses','financeiro','empresa',true,null,null,'faturamento_12_meses','faturamento_12m_extract','boa_pratica_analise'),
  ('comprovante_faturamento','Comprovante de faturamento (legado)','financeiro','empresa',true,'faturamento_12_meses',null,'faturamento_12_meses','faturamento_12m_extract','boa_pratica_analise'),
  ('declaracao_faturamento','Declaração de faturamento (legado)','financeiro','empresa',true,'faturamento_12_meses',null,'faturamento_12_meses','faturamento_12m_extract','boa_pratica_analise'),
  ('projecao_receitas','Projeção de receitas','financeiro','empresa',true,null,null,'projecao_receitas','projecao_receitas_extract','politica_bancaria'),
  ('demonstrativo_receitas_projetadas','Demonstrativo de receitas projetadas','financeiro','empresa',true,'projecao_receitas',null,'projecao_receitas','projecao_receitas_extract','politica_bancaria'),
  ('relatorio_receitas_mei','Relatório mensal de receitas do MEI','financeiro','empresa',true,null,null,'relatorio_receitas_mei','relatorio_receitas_mei_extract','boa_pratica_analise'),
  ('extrato_bancario','Extrato bancário','financeiro','empresa',true,null,null,'extrato_bancario','extrato_bancario_extract','boa_pratica_analise'),
  ('nf_e','NF-e','fiscal','empresa',true,null,null,'notas_fiscais','notas_fiscais_extract','boa_pratica_analise'),
  ('nfe','NF-e (legado)','fiscal','empresa',true,'nf_e',null,'notas_fiscais','notas_fiscais_extract','boa_pratica_analise'),
  ('nfs_e','NFS-e','fiscal','empresa',true,null,null,'notas_fiscais','notas_fiscais_extract','boa_pratica_analise'),
  ('nfse','NFS-e (legado)','fiscal','empresa',true,'nfs_e',null,'notas_fiscais','notas_fiscais_extract','boa_pratica_analise'),
  ('notas_fiscais','Notas fiscais','fiscal','empresa',true,'nf_e',null,'notas_fiscais','notas_fiscais_extract','boa_pratica_analise'),
  ('recebiveis','Recebíveis','financeiro','empresa',true,null,null,'recebiveis','recebiveis_extract','politica_bancaria'),
  ('contas_receber','Contas a receber','financeiro','empresa',true,null,null,'contas_receber','contas_receber_extract','boa_pratica_analise'),
  ('contas_pagar','Contas a pagar','financeiro','empresa',true,null,null,'contas_pagar','contas_pagar_extract','boa_pratica_analise'),
  ('estoque','Estoque','financeiro','empresa',true,null,null,'estoque','estoque_extract','boa_pratica_analise'),
  ('capital_giro','Memória de necessidade de capital de giro','financeiro','empresa',true,null,null,'capital_giro','capital_giro_extract','boa_pratica_analise'),
  ('garantia','Documento de garantia','garantia','garantia',true,null,null,'garantia','garantia_extract','garantia'),
  ('documento_bem_garantia','Documento do bem em garantia (legado)','garantia','garantia',true,'garantia',null,'garantia','garantia_extract','garantia'),
  ('contrato_garantia','Contrato de garantia','garantia','garantia',true,null,null,'garantia','garantia_extract','garantia'),
  ('alienacao_fiduciaria','Instrumento de alienação fiduciária','garantia','garantia',true,null,null,'garantia','garantia_extract','garantia'),
  ('aval','Aval / garantidor','garantia','garantia',true,null,null,'garantia','garantia_extract','garantia'),
  ('nota_promissoria','Nota promissória','garantia','garantia',true,null,null,'garantia','garantia_extract','garantia'),
  ('patrimonio_garantia','Comprovação patrimonial para garantia','garantia','garantia',true,null,null,'garantia','garantia_extract','garantia'),
  ('compartilhamento_ecac','Compartilhamento eCAC','fiscal','empresa',true,null,null,null,null,'politica_bancaria'),
  ('foto_fachada','Foto da fachada','operacional','empresa',true,null,null,null,null,'documento_complementar'),
  ('foto_interna_1','Foto interna 1','operacional','empresa',true,null,null,null,null,'documento_complementar'),
  ('foto_interna_2','Foto interna 2','operacional','empresa',true,null,null,null,null,'documento_complementar'),
  ('foto_interna_3','Foto interna 3','operacional','empresa',true,null,null,null,null,'documento_complementar'),
  ('outros','Outros documentos','outros','qualquer',true,null,null,null,null,'documento_complementar'),
  ('outro','Outro documento (legado)','outros','qualquer',true,'outros',null,null,null,'documento_complementar')
ON CONFLICT (tipo_documento) DO UPDATE SET
  nome_amigavel = EXCLUDED.nome_amigavel,
  categoria = EXCLUDED.categoria,
  escopo = EXCLUDED.escopo,
  uploadavel = EXCLUDED.uploadavel,
  tipo_canonico = EXCLUDED.tipo_canonico,
  fonte_automatica = EXCLUDED.fonte_automatica,
  analise = EXCLUDED.analise,
  prompt_codigo = EXCLUDED.prompt_codigo,
  tipo_exigencia = EXCLUDED.tipo_exigencia,
  ativo = TRUE,
  catalogo_versao = '2026.08.29',
  atualizado_em = NOW();

CREATE INDEX IF NOT EXISTS idx_documentos_catalogo_categoria ON public.documentos_catalogo (categoria, ativo);
CREATE INDEX IF NOT EXISTS idx_documentos_catalogo_canonico ON public.documentos_catalogo (tipo_canonico);

ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS categoria TEXT;
ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS tipo_exigencia TEXT NOT NULL DEFAULT 'documento_complementar';
ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS regra_validacao JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS regra_cruzamento JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS bloqueia_etapa INTEGER NULL;
ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS vigencia_inicio DATE NULL;
ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS vigencia_fim DATE NULL;
ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS versao TEXT NOT NULL DEFAULT '2026.08.29';
ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS fonte TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_documentos_regras_credito_vigencia ON public.documentos_regras_credito (tipo_documento, ativo, vigencia_inicio, vigencia_fim);

INSERT INTO public.documentos_regras_credito
  (codigo, tipo_documento, nome_amigavel, entidade_tipo, escopo, obrigatorio, permite_multiplos, validade_dias, condicao, descricao, ordem, categoria, tipo_exigencia, regra_validacao, regra_cruzamento, bloqueia_etapa, versao, ativo, fonte)
VALUES
  ('098_empresa_faturamento_12m','faturamento_12_meses','Faturamento dos últimos 12 meses','empresa','empresa',false,true,null,'{"quando_anexado":true}'::jsonb,'Documento opcional universalmente; quando anexado, deve ser analisado.',250,'financeiro','boa_pratica_analise','{"meses":12,"ultimo_mes_fechado":true,"assinaturas_mesma_modalidade":true}'::jsonb,'{"empresa_cnpj":true,"administrador":true,"contador":true}'::jsonb,null,'2.0.0',true,'matriz_estrategica_2026'),
  ('098_empresa_pgdas','pgdas','PGDAS-D','empresa','empresa',false,true,null,'{"regime":"simples_nacional"}'::jsonb,'Aplicável ao Simples Nacional, exceto MEI/SIMEI.',260,'fiscal','obrigacao_legal','{"documento_compativel":true}'::jsonb,'{"regime_tributario":true}'::jsonb,4,'2.0.0',true,'matriz_estrategica_2026'),
  ('098_empresa_defis','defis','DEFIS','empresa','empresa',false,true,null,'{"regime":"simples_nacional","exceto":"mei"}'::jsonb,'Aplicável ao Simples Nacional que não seja MEI.',270,'fiscal','obrigacao_legal','{"documento_compativel":true}'::jsonb,'{"regime_tributario":true}'::jsonb,4,'2.0.0',true,'matriz_estrategica_2026'),
  ('098_empresa_dasn_simei','dasn_simei','DASN-SIMEI','empresa','empresa',false,true,null,'{"regime":"mei"}'::jsonb,'Aplicável ao MEI/SIMEI.',280,'fiscal','obrigacao_legal','{"documento_compativel":true}'::jsonb,'{"regime_tributario":true}'::jsonb,4,'2.0.0',true,'matriz_estrategica_2026'),
  ('098_empresa_ecf','ecf','ECF','empresa','empresa',false,true,null,'{"regime":["lucro_presumido","lucro_real","lucro_arbitrado"]}'::jsonb,'Aplicável aos regimes não optantes conforme obrigação e operação.',290,'fiscal','obrigacao_legal','{"documento_compativel":true}'::jsonb,'{"regime_tributario":true}'::jsonb,4,'2.0.0',true,'matriz_estrategica_2026'),
  ('098_empresa_cndt','cndt','CNDT','empresa','empresa',false,false,null,'{"somente_se":"possui_empregados_ou_linha_exigir"}'::jsonb,'Certidão trabalhista condicional, não hard gate universal.',300,'regularidade','politica_bancaria','{"documento_compativel":true}'::jsonb,'{"empregados_ou_linha":true}'::jsonb,null,'2.0.0',true,'matriz_estrategica_2026'),
  ('098_empresa_cnd_estadual','cnd_estadual','CND estadual','empresa','empresa',false,false,null,'{"somente_se":"possui_inscricao_estadual_ou_atividade_exigir"}'::jsonb,'Certidão estadual condicional à inscrição/atividade ou política da linha.',310,'regularidade','politica_bancaria','{"documento_compativel":true}'::jsonb,'{"inscricao_estadual_ou_atividade":true}'::jsonb,null,'2.0.0',true,'matriz_estrategica_2026'),
  ('098_socio_documento_id','documento_socio','Documento de identificação do sócio','socio','socio',true,true,null,'{"depois_etapa":2}'::jsonb,'Documento pessoal aplicado por sócio somente depois da etapa societária.',320,'socio','obrigacao_legal','{"documento_compativel":true}'::jsonb,'{"socio_id":true}'::jsonb,3,'2.0.0',true,'matriz_estrategica_2026'),
  ('098_socio_comprovante_residencia','comprovante_residencia','Comprovante de residência do sócio','socio','socio',true,false,60,'{"depois_etapa":2}'::jsonb,'Validade máxima de dois meses; titular diferente exige justificativa.',330,'socio','obrigacao_legal','{"mes_referencia":true,"titular":true}'::jsonb,'{"socio_id":true,"nome":true}'::jsonb,3,'2.0.0',true,'matriz_estrategica_2026')
ON CONFLICT (codigo) DO UPDATE SET
  tipo_documento = EXCLUDED.tipo_documento,
  nome_amigavel = EXCLUDED.nome_amigavel,
  obrigatorio = EXCLUDED.obrigatorio,
  permite_multiplos = EXCLUDED.permite_multiplos,
  validade_dias = EXCLUDED.validade_dias,
  condicao = EXCLUDED.condicao,
  descricao = EXCLUDED.descricao,
  categoria = EXCLUDED.categoria,
  tipo_exigencia = EXCLUDED.tipo_exigencia,
  regra_validacao = EXCLUDED.regra_validacao,
  regra_cruzamento = EXCLUDED.regra_cruzamento,
  bloqueia_etapa = EXCLUDED.bloqueia_etapa,
  versao = EXCLUDED.versao,
  ativo = TRUE,
  fonte = EXCLUDED.fonte,
  atualizado_em = NOW();

INSERT INTO public.ia_prompts_documentais
  (bloco_id, codigo, versao, nome, descricao, prompt_sistema, prompt_usuario_template, schema_saida, ativo)
SELECT NULL,
       'catalogo_' || c.tipo_documento,
       '2.0.0',
       'Extrair ' || c.nome_amigavel,
       'Prompt versionado do catálogo documental 2026.08.29.',
       'Analise exclusivamente o documento enviado. Retorne JSON. Separe campos comprovados, evidências com página/trecho/confiança e campos inferidos. Nunca invente dados, não tome decisão final de crédito e peça revisão humana em divergências ou baixa confiança.',
       'Documento: {{tipo_documento}}. Empresa: {{empresa_id}}. Extraia somente fatos observáveis e retorne documento_compativel, campos_comprovados, campos_inferidos, evidencias, competencia, validade, pendencias, divergencias, confianca e revisao_humana_necessaria.',
       '{"type":"object","required":["documento_compativel","campos_comprovados","campos_inferidos","evidencias","revisao_humana_necessaria"]}'::jsonb,
       TRUE
FROM public.documentos_catalogo c
WHERE c.analise IS NOT NULL
ON CONFLICT (codigo, versao) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  prompt_sistema = EXCLUDED.prompt_sistema,
  prompt_usuario_template = EXCLUDED.prompt_usuario_template,
  schema_saida = EXCLUDED.schema_saida,
  ativo = TRUE,
  atualizacao_em = NOW();

ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS arquivo_hash TEXT NULL;
ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS regra_versao TEXT NULL;
ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS evidencias JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS campos_inferidos JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS competencia_inicio DATE NULL;
ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS competencia_fim DATE NULL;
ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS validade_inicio DATE NULL;
ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS validade_fim DATE NULL;
ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS paginas_analisadas INTEGER NULL;
ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS fonte_extracao TEXT NULL;

CREATE TABLE IF NOT EXISTS public.documentos_regras_shadow_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NULL,
  contexto JSONB NOT NULL DEFAULT '{}'::jsonb,
  motor_legado JSONB NOT NULL DEFAULT '{}'::jsonb,
  motor_novo JSONB NOT NULL DEFAULT '{}'::jsonb,
  divergencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  modo TEXT NOT NULL DEFAULT 'shadow',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documentos_regras_shadow_empresa ON public.documentos_regras_shadow_log (empresa_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS public.documentos_financeiros_indicadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  competencia_inicio DATE NULL,
  competencia_fim DATE NULL,
  fonte TEXT NOT NULL DEFAULT 'documentos',
  documentos_utilizados JSONB NOT NULL DEFAULT '[]'::jsonb,
  indicadores JSONB NOT NULL DEFAULT '{}'::jsonb,
  qualidade TEXT NOT NULL DEFAULT 'insuficiente',
  regra_versao TEXT NOT NULL DEFAULT '2026.08.29',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documentos_financeiros_empresa_competencia ON public.documentos_financeiros_indicadores (empresa_id, competencia_fim DESC);

CREATE TABLE IF NOT EXISTS public.documentos_rating_interno (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  nota NUMERIC(5,2) NULL,
  classificacao TEXT NULL,
  pilares JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  limitacoes JSONB NOT NULL DEFAULT '[]'::jsonb,
  regra_versao TEXT NOT NULL DEFAULT '2026.08.29',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documentos_rating_empresa ON public.documentos_rating_interno (empresa_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS public.documentos_elegibilidade_credito (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  programa_codigo TEXT NOT NULL,
  elegivel BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pendente',
  requisitos JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  limitacoes JSONB NOT NULL DEFAULT '[]'::jsonb,
  regra_versao TEXT NOT NULL DEFAULT '2026.08.29',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, programa_codigo)
);
CREATE INDEX IF NOT EXISTS idx_documentos_elegibilidade_empresa ON public.documentos_elegibilidade_credito (empresa_id, status);

CREATE TABLE IF NOT EXISTS public.planos_adequacao_credito (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  prioridade TEXT NOT NULL DEFAULT 'media',
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  impacto TEXT NULL,
  acao TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'motor_documental',
  status TEXT NOT NULL DEFAULT 'aberto',
  prazo_sugerido DATE NULL,
  evidencia JSONB NOT NULL DEFAULT '{}'::jsonb,
  regra_versao TEXT NOT NULL DEFAULT '2026.08.29',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_planos_adequacao_empresa_status ON public.planos_adequacao_credito (empresa_id, status, prioridade);

-- O CHECK legado era uma lista fixa e ficava sempre defasado. A validação de rota
-- e o catálogo compartilhado são a fonte de verdade. Remover apenas o CHECK antigo
-- não exclui documentos; permite aliases legados e novos tipos durante rollout.
DO $$
BEGIN
  IF to_regclass('public.documentos_arquivos') IS NOT NULL THEN
    ALTER TABLE public.documentos_arquivos DROP CONSTRAINT IF EXISTS documentos_arquivos_tipo_documento_check;
    ALTER TABLE public.documentos_arquivos DROP CONSTRAINT IF EXISTS documentos_arquivos_tipo_chk;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.validar_tipo_documento_catalogo()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo_documento IS NULL OR length(trim(NEW.tipo_documento)) = 0 THEN
    RAISE EXCEPTION 'tipo_documento não pode ser vazio';
  END IF;
  -- Tipos ausentes são mantidos para compatibilidade de dados históricos; novos
  -- uploads são validados no backend contra documentos_catalogo.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.documentos_arquivos') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_documentos_arquivos_tipo_catalogo ON public.documentos_arquivos;
    CREATE TRIGGER trg_documentos_arquivos_tipo_catalogo
      BEFORE INSERT OR UPDATE OF tipo_documento ON public.documentos_arquivos
      FOR EACH ROW EXECUTE FUNCTION public.validar_tipo_documento_catalogo();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.atualizar_atualizado_em_098()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT tabela FROM (VALUES
    ('documentos_catalogo'), ('documentos_financeiros_indicadores'), ('documentos_elegibilidade_credito'), ('planos_adequacao_credito')
  ) AS t(tabela)
  LOOP
    IF to_regclass('public.' || rec.tabela) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_atualizado ON public.%I', rec.tabela, rec.tabela);
      EXECUTE format('CREATE TRIGGER trg_%s_atualizado BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizado_em_098()', rec.tabela, rec.tabela);
    END IF;
  END LOOP;
END $$;


-- ============================================================================
-- Migration 099: compatibilidade do módulo de banners
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  image_url TEXT NOT NULL,
  link_url TEXT NULL,
  position TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  start_date TIMESTAMPTZ NULL,
  end_date TIMESTAMPTZ NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT banners_position_chk CHECK (
    position IN (
      'home_top',
      'home_middle',
      'home_bottom',
      'blog_sidebar',
      'blog_top',
      'credito_empresas_banner',
      'credito_pessoal_banner'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_banners_position_active_order
  ON public.banners (position, is_active, display_order, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_banners_schedule
  ON public.banners (start_date, end_date);

COMMENT ON TABLE public.banners IS
  'Conteúdo de banners do site; tabela criada de forma aditiva pela migration 099.';


-- ============================================================================
-- Migrations 100-102 incorporadas do pacote auditado (idempotentes)
-- ============================================================================
-- Migration 100 — linha do tempo do regime tributário (histórico versionado).
-- Idempotente e aditiva. Não apaga nem altera o campo público.empresas.regime_tributario
-- (que continua sendo o "regime vigente" consumido pelo restante do sistema); esta
-- migration ADICIONA um histórico completo ao lado dele, sem substituir nada.
--
-- Contexto (Missão de evolução do Acervo Documental, seção 11): o sistema até aqui só
-- guarda "regime_tributario" como um valor único e atual. Isso não permite responder
-- "qual era o regime da empresa em 12/2025?" nem impede que um documento histórico
-- (ex.: um PGDAS-D de um período em que a empresa ainda era Simples Nacional)
-- contamine, por engano, o regime considerado vigente hoje. Esta tabela guarda cada
-- período do regime tributário com data de início/fim, a fonte da informação, a
-- confiança da leitura e o documento que serviu de evidência -- sem nunca ser
-- reescrita: um novo regime fecha o período anterior (preenchendo data_fim) e abre
-- um novo período, preservando o histórico completo.

CREATE TABLE IF NOT EXISTS public.empresas_regime_tributario_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  regime TEXT NOT NULL,
  data_inicio DATE NULL,
  data_fim DATE NULL,
  fonte TEXT NOT NULL DEFAULT 'documento',
  confianca NUMERIC(4,3) NULL,
  documento_evidencia_id UUID NULL,
  observacao TEXT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF to_regclass('public.empresas') IS NOT NULL
     AND to_regclass('public.empresas_regime_tributario_historico') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'empresas_regime_historico_empresa_fk'
     ) THEN
    ALTER TABLE public.empresas_regime_tributario_historico
      ADD CONSTRAINT empresas_regime_historico_empresa_fk
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.documentos_arquivos') IS NOT NULL
     AND to_regclass('public.empresas_regime_tributario_historico') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'empresas_regime_historico_documento_fk'
     ) THEN
    ALTER TABLE public.empresas_regime_tributario_historico
      ADD CONSTRAINT empresas_regime_historico_documento_fk
      FOREIGN KEY (documento_evidencia_id) REFERENCES public.documentos_arquivos(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_regime_historico_empresa_periodo
  ON public.empresas_regime_tributario_historico (empresa_id, data_inicio, data_fim);

-- No máximo um período "vigente" (data_fim IS NULL) por empresa: o registrador
-- (regimeTributarioTemporalService.ts) sempre fecha o período aberto anterior antes
-- de abrir um novo, e este índice único é a garantia de banco desse invariante.
CREATE UNIQUE INDEX IF NOT EXISTS uq_regime_historico_periodo_vigente
  ON public.empresas_regime_tributario_historico (empresa_id)
  WHERE data_fim IS NULL;

CREATE OR REPLACE FUNCTION public.atualizar_atualizado_em_100()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.empresas_regime_tributario_historico') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_regime_historico_atualizado ON public.empresas_regime_tributario_historico;
    CREATE TRIGGER trg_regime_historico_atualizado
      BEFORE UPDATE ON public.empresas_regime_tributario_historico
      FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizado_em_100();
  END IF;
END $$;

-- Migration 101 — faturamento mensal por competência (base para a janela móvel
-- de 12 meses). Idempotente e aditiva. Não toca em nenhuma tabela ou coluna
-- existente relacionada a faturamento (ex.: os campos extraídos do documento
-- `faturamento_12_meses` em extracaoDocumentalLocal.ts continuam existindo e
-- funcionando exatamente como antes); esta migration ADICIONA um registro
-- estruturado, um valor por competência (ano/mês), ao lado do que já existe.
--
-- Contexto (Missão de evolução do Acervo Documental): o sistema até aqui só
-- guarda o faturamento como texto/metadado dentro do documento anexado, sem
-- um valor por competência que possa ser somado numa janela móvel de 12
-- meses. Isso impede, por exemplo, consolidar meses em que a empresa era
-- Lucro Presumido com meses em que passou a ser Lucro Real dentro da mesma
-- janela de 12 meses (uma mudança de regime no meio do caminho não pode
-- exigir um único tipo de documento cobrindo os 12 meses inteiros). Esta
-- tabela guarda um valor por competência, sem nunca ser sobrescrita por uma
-- evidência mais fraca (ver faturamentoRolling12MesesService.ts).

CREATE TABLE IF NOT EXISTS public.empresas_faturamento_mensal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  valor NUMERIC(18,2) NOT NULL,
  fonte TEXT NOT NULL DEFAULT 'documento',
  documento_id UUID NULL,
  regime_no_periodo TEXT NULL,
  confianca NUMERIC(4,3) NULL,
  observacao TEXT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT empresas_faturamento_mensal_mes_valido CHECK (mes >= 1 AND mes <= 12)
);

DO $$
BEGIN
  IF to_regclass('public.empresas') IS NOT NULL
     AND to_regclass('public.empresas_faturamento_mensal') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'empresas_faturamento_mensal_empresa_fk'
     ) THEN
    ALTER TABLE public.empresas_faturamento_mensal
      ADD CONSTRAINT empresas_faturamento_mensal_empresa_fk
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.documentos_arquivos') IS NOT NULL
     AND to_regclass('public.empresas_faturamento_mensal') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'empresas_faturamento_mensal_documento_fk'
     ) THEN
    ALTER TABLE public.empresas_faturamento_mensal
      ADD CONSTRAINT empresas_faturamento_mensal_documento_fk
      FOREIGN KEY (documento_id) REFERENCES public.documentos_arquivos(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Um único valor por empresa/competência: o serviço faz upsert lógico (nunca
-- duas linhas para o mesmo ano/mês), preservando sempre a evidência de maior
-- confiança já registrada em vez de duplicar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_faturamento_mensal_empresa_competencia
  ON public.empresas_faturamento_mensal (empresa_id, ano, mes);

CREATE INDEX IF NOT EXISTS idx_faturamento_mensal_empresa
  ON public.empresas_faturamento_mensal (empresa_id, ano, mes);

CREATE OR REPLACE FUNCTION public.atualizar_atualizado_em_101()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.empresas_faturamento_mensal') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_faturamento_mensal_atualizado ON public.empresas_faturamento_mensal;
    CREATE TRIGGER trg_faturamento_mensal_atualizado
      BEFORE UPDATE ON public.empresas_faturamento_mensal
      FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizado_em_101();
  END IF;
END $$;

-- Migration 102 — cobertura de evidência entre bureaus (SCR/CCS/CCF/CENPROT/
-- CADIN/PGFN/CND/CNDT/Situação Fiscal/Serasa). Idempotente e aditiva. Não
-- altera em nada o upload por slot já existente (`documentos_arquivos.tipo_documento`
-- continua sendo o mesmo campo, com os mesmos tipos: scr_cnpj, ccs_cnpj,
-- ccf_cnpj etc.) -- esta tabela ADICIONA, por documento, quais requisitos de
-- consulta cadastral aquele arquivo efetivamente comprova, além do próprio
-- slot em que foi anexado.
--
-- Contexto (Missão de evolução do Acervo Documental): hoje um relatório de
-- bureau que já traga SCR + CCF + score numa página só (comum em relatórios
-- consolidados) só é reconhecido como o slot em que foi literalmente anexado
-- -- não há como um único arquivo "contar" para mais de um requisito sem
-- pedir novo upload duplicado para cada um. Esta tabela guarda, para cada
-- documento, a lista de requisitos que ele efetivamente cobre (podem ser
-- vários), com o status de cobertura granular (uma CND negativa não é o
-- mesmo que uma Certidão Positiva com Efeito de Negativa, que por sua vez
-- não é o mesmo que uma Certidão Positiva pura -- tratar as três como
-- equivalentes seria esconder risco).

CREATE TABLE IF NOT EXISTS public.document_evidence_coverage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL,
  requirement_code TEXT NOT NULL,
  coverage_status TEXT NOT NULL,
  confidence NUMERIC(4,3) NULL,
  source_section TEXT NULL,
  extracted_value JSONB NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF to_regclass('public.documentos_arquivos') IS NOT NULL
     AND to_regclass('public.document_evidence_coverage') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'document_evidence_coverage_documento_fk'
     ) THEN
    ALTER TABLE public.document_evidence_coverage
      ADD CONSTRAINT document_evidence_coverage_documento_fk
      FOREIGN KEY (documento_id) REFERENCES public.documentos_arquivos(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Um documento só tem UMA linha de cobertura por requisito (nunca duplica);
-- o serviço faz upsert lógico, preservando sempre a evidência de maior
-- confiança já registrada para aquele par (documento, requisito).
CREATE UNIQUE INDEX IF NOT EXISTS uq_evidence_coverage_documento_requisito
  ON public.document_evidence_coverage (documento_id, requirement_code);

CREATE INDEX IF NOT EXISTS idx_evidence_coverage_requisito
  ON public.document_evidence_coverage (requirement_code);

CREATE OR REPLACE FUNCTION public.atualizar_atualizado_em_102()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.document_evidence_coverage') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_evidence_coverage_atualizado ON public.document_evidence_coverage;
    CREATE TRIGGER trg_evidence_coverage_atualizado
      BEFORE UPDATE ON public.document_evidence_coverage
      FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizado_em_102();
  END IF;
END $$;


-- ============================================================================
-- Migration 103: versionamento de laudos e backfill controlado
-- ============================================================================
-- Migration 103 — versionamento de laudos, classificação fail-closed e backfill controlado.
-- Aditiva e idempotente: nenhuma linha de documento ou laudo é removida.

DO $$
BEGIN
  IF to_regclass('public.documentos_extracoes_ia') IS NOT NULL THEN
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS analysis_signature TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS classifier_version TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS extractor_version TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS rule_version TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS schema_version TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS analysis_status TEXT NOT NULL DEFAULT 'REANALISE_NECESSARIA';
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS tipo_esperado TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS tipo_detectado TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS identidade_status TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS temporalidade_status TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS cobertura_status TEXT;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS satisfaz_requisito BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS stale_at TIMESTAMPTZ;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.documentos_extracoes_ia') IS NOT NULL THEN
    UPDATE public.documentos_extracoes_ia
       SET analysis_status = CASE
         WHEN status IN ('concluido', 'revisao_humana') AND analysis_signature IS NOT NULL THEN 'ATIVO'
         ELSE 'REANALISE_NECESSARIA'
       END
     WHERE analysis_status IS NULL OR analysis_status = '';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.documentos_extracoes_ia') IS NOT NULL THEN
    UPDATE public.documentos_extracoes_ia
       SET analysis_status = 'REANALISE_NECESSARIA',
           stale_at = COALESCE(stale_at, NOW()),
           satisfaz_requisito = FALSE
     WHERE analysis_status = 'ATIVO'
       AND (extractor_version IS NULL OR rule_version IS NULL OR schema_version IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.documentos_extracoes_ia') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'documentos_extracoes_ia_analysis_status_chk'
     ) THEN
    ALTER TABLE public.documentos_extracoes_ia
      ADD CONSTRAINT documentos_extracoes_ia_analysis_status_chk
      CHECK (analysis_status IN ('ATIVO', 'STALE', 'REANALISE_NECESSARIA', 'SUPERSEDED'));
  END IF;
EXCEPTION WHEN check_violation THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_documentos_extracoes_ia_signature
  ON public.documentos_extracoes_ia (arquivo_id, prompt_codigo, analysis_signature);

CREATE INDEX IF NOT EXISTS idx_documentos_extracoes_ia_active
  ON public.documentos_extracoes_ia (arquivo_id, prompt_codigo, analysis_status, atualizado_em DESC);

CREATE TABLE IF NOT EXISTS public.documentos_backfill_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL,
  empresa_id UUID NULL,
  prompt_codigo TEXT NOT NULL,
  prioridade INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  tentativas INTEGER NOT NULL DEFAULT 0,
  disponivel_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bloqueado_em TIMESTAMPTZ NULL,
  bloqueado_por TEXT NULL,
  concluido_em TIMESTAMPTZ NULL,
  ultimo_erro TEXT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT documentos_backfill_jobs_status_chk CHECK (status IN ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'FALHOU'))
);

DO $$
BEGIN
  IF to_regclass('public.documentos_arquivos') IS NOT NULL
     AND to_regclass('public.documentos_backfill_jobs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'documentos_backfill_jobs_documento_fk'
     ) THEN
    ALTER TABLE public.documentos_backfill_jobs
      ADD CONSTRAINT documentos_backfill_jobs_documento_fk
      FOREIGN KEY (documento_id) REFERENCES public.documentos_arquivos(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.empresas') IS NOT NULL
     AND to_regclass('public.documentos_backfill_jobs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'documentos_backfill_jobs_empresa_fk'
     ) THEN
    ALTER TABLE public.documentos_backfill_jobs
      ADD CONSTRAINT documentos_backfill_jobs_empresa_fk
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_documentos_backfill_jobs_documento_prompt
  ON public.documentos_backfill_jobs (documento_id, prompt_codigo);

CREATE INDEX IF NOT EXISTS idx_documentos_backfill_jobs_dispatch
  ON public.documentos_backfill_jobs (status, prioridade, disponivel_em, criado_em);

CREATE OR REPLACE FUNCTION public.atualizar_atualizado_em_103()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.documentos_backfill_jobs') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_documentos_backfill_jobs_atualizado ON public.documentos_backfill_jobs;
    CREATE TRIGGER trg_documentos_backfill_jobs_atualizado
      BEFORE UPDATE ON public.documentos_backfill_jobs
      FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizado_em_103();
  END IF;
END $$;

-- ─── Migration 104: leitura automática integral e fila rearmável ───────────
ALTER TABLE IF EXISTS public.documentos_backfill_jobs
  ADD COLUMN IF NOT EXISTS target_signature TEXT;
ALTER TABLE IF EXISTS public.documentos_backfill_jobs
  ADD COLUMN IF NOT EXISTS target_prompt_version TEXT;
ALTER TABLE IF EXISTS public.documentos_backfill_jobs
  ADD COLUMN IF NOT EXISTS target_engine_version TEXT;

UPDATE public.documentos_backfill_jobs
   SET status = 'PENDENTE', disponivel_em = NOW(), bloqueado_em = NULL,
       bloqueado_por = NULL,
       ultimo_erro = COALESCE(ultimo_erro, 'Job recuperado após expiração do bloqueio')
 WHERE status = 'PROCESSANDO'
   AND bloqueado_em < NOW() - INTERVAL '30 minutes';

CREATE INDEX IF NOT EXISTS idx_documentos_extracoes_ia_retry
  ON public.documentos_extracoes_ia (analysis_status, next_retry_at, retry_count)
  WHERE status = 'falhou';

INSERT INTO public.documentos_catalogo
  (tipo_documento, nome_amigavel, categoria, escopo, uploadavel, analise, prompt_codigo, tipo_exigencia, catalogo_versao)
VALUES
  ('requerimento_empresario', 'Requerimento de Empresário / Instrumento de Inscrição', 'societario', 'empresa', TRUE, 'documento_generico', 'catalogo_requerimento_empresario_extract', 'obrigacao_legal', '2026.09.05'),
  ('registro_cartorio_pj', 'Registro no RCPJ / Cartório de Pessoas Jurídicas', 'societario', 'empresa', TRUE, 'documento_generico', 'catalogo_registro_cartorio_pj_extract', 'obrigacao_legal', '2026.09.05')
ON CONFLICT (tipo_documento) DO UPDATE SET
  nome_amigavel = EXCLUDED.nome_amigavel, categoria = EXCLUDED.categoria,
  escopo = EXCLUDED.escopo, uploadavel = TRUE,
  analise = COALESCE(public.documentos_catalogo.analise, EXCLUDED.analise),
  prompt_codigo = COALESCE(public.documentos_catalogo.prompt_codigo, EXCLUDED.prompt_codigo),
  tipo_exigencia = EXCLUDED.tipo_exigencia, ativo = TRUE,
  catalogo_versao = EXCLUDED.catalogo_versao, atualizado_em = NOW();

UPDATE public.documentos_catalogo
   SET analise = COALESCE(analise, 'documento_generico'),
       prompt_codigo = COALESCE(prompt_codigo, 'catalogo_' || COALESCE(tipo_canonico, tipo_documento) || '_extract'),
       catalogo_versao = '2026.09.05', atualizado_em = NOW()
 WHERE uploadavel = TRUE AND ativo = TRUE;

INSERT INTO public.ia_prompts_documentais
  (bloco_id, codigo, versao, nome, descricao, prompt_sistema, prompt_usuario_template, schema_saida, ativo)
SELECT NULL, c.prompt_codigo,
       CASE
         WHEN c.prompt_codigo = 'qsa_extract' THEN '5.1.0'
         WHEN LEFT(c.prompt_codigo, 9) = 'catalogo_' THEN '2.0.0'
         ELSE '1.0.0'
       END,
       'Leitura automática — ' || c.nome_amigavel,
       'Extração auditável por tipo e categoria documental. Versão 2026.09.05.',
       'Analise exclusivamente o arquivo recebido. Não invente dados. Separe fatos comprovados de inferências, informe evidência textual, página quando disponível, competência, emissão, validade, situação documental e necessidade de revisão humana.',
       'Tipo declarado: {{tipo_documento}}. Empresa: {{empresa_id}}. Retorne documento_compativel, tipo_detectado, campos_comprovados, campos_inferidos, evidencias, competencia, validade, pendencias, divergencias, confianca e revisao_humana_necessaria.',
       '{"type":"object","required":["documento_compativel","campos_comprovados","campos_inferidos","evidencias","revisao_humana_necessaria"]}'::jsonb,
       TRUE
  FROM public.documentos_catalogo c
 WHERE c.uploadavel = TRUE AND c.ativo = TRUE AND c.prompt_codigo IS NOT NULL
ON CONFLICT (codigo, versao) DO UPDATE SET
  nome = EXCLUDED.nome, descricao = EXCLUDED.descricao,
  prompt_sistema = EXCLUDED.prompt_sistema,
  prompt_usuario_template = EXCLUDED.prompt_usuario_template,
  schema_saida = EXCLUDED.schema_saida, ativo = TRUE, atualizacao_em = NOW();

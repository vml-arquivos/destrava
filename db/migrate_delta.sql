-- ============================================================
-- DESTRAVA CRÉDITO — Migração Delta (schema real da VPS)
-- Adiciona APENAS colunas faltantes ao banco existente.
-- NÃO recria tabelas, NÃO faz DROP, NÃO altera colunas existentes.
-- Idempotente: seguro para executar múltiplas vezes.
--
-- Executar no container PostgreSQL:
--   docker cp supabase/migrate_delta.sql tr3go0jqyc5h3tuvz7f46zkc:/tmp/
--   docker exec -it tr3go0jqyc5h3tuvz7f46zkc \
--     psql -U destravadb -d postgres -f /tmp/migrate_delta.sql
-- ============================================================

\echo '── Iniciando migração delta...'

-- ── Extensão pgcrypto (para gen_random_uuid) ─────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ════════════════════════════════════════════════════════════
-- TABELA: leads
-- Schema real tem: valor_desejado (text), prazo (text)
-- Servidor precisa: valor_solicitado (numeric), prazo_meses (int),
--   utm_source, utm_medium, utm_campaign, pagina_origem
-- Estratégia: adicionar colunas novas; manter as antigas intactas
-- ════════════════════════════════════════════════════════════

-- valor_solicitado (numeric) — servidor usa este nome no INSERT
ALTER TABLE leads ADD COLUMN IF NOT EXISTS valor_solicitado NUMERIC(15,2);

-- Migra dados existentes de valor_desejado → valor_solicitado (uma vez)
UPDATE leads
SET valor_solicitado = NULLIF(TRIM(valor_desejado), '')::NUMERIC
WHERE valor_solicitado IS NULL
  AND valor_desejado IS NOT NULL
  AND valor_desejado ~ '^[0-9]+(\.[0-9]+)?$';

-- prazo_meses (int) — servidor usa este nome no INSERT
ALTER TABLE leads ADD COLUMN IF NOT EXISTS prazo_meses INTEGER;

-- Migra dados existentes de prazo → prazo_meses (uma vez)
UPDATE leads
SET prazo_meses = NULLIF(TRIM(prazo), '')::INTEGER
WHERE prazo_meses IS NULL
  AND prazo IS NOT NULL
  AND prazo ~ '^[0-9]+$';

-- Colunas UTM e rastreamento (enviadas pelo SimuladorPublico)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_source    TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_medium    TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_campaign  TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pagina_origem TEXT;

-- score_efetivo como coluna regular (não GENERATED ALWAYS — banco existente não suporta)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_efetivo INTEGER;

-- Sincroniza score_efetivo com score_manual ou score_ia
UPDATE leads
SET score_efetivo = COALESCE(score_manual, score_ia, 0)
WHERE score_efetivo IS NULL;

-- Colunas de IA (usadas pelo PATCH /api/leads/:id/ia)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS proxima_acao_ia          TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS linha_recomendada         TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS probabilidade_aprovacao   NUMERIC(5,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS probabilidade_conversao   NUMERIC(5,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS prazo_aprovacao_estimado  TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS analise_credito_ia        TEXT;

-- n8n_notificado (controle de envio ao webhook)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS n8n_notificado BOOLEAN NOT NULL DEFAULT FALSE;

\echo '  ✅ leads: colunas delta adicionadas'

-- ════════════════════════════════════════════════════════════
-- TABELA: colaboradores
-- Verifica se senha_hash existe (necessária para auth JWT/bcrypt)
-- ════════════════════════════════════════════════════════════
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS senha_hash TEXT;
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

\echo '  ✅ colaboradores: colunas delta adicionadas'

-- ════════════════════════════════════════════════════════════
-- TABELA: crm_atividades
-- Verifica colunas necessárias para o servidor
-- ════════════════════════════════════════════════════════════
ALTER TABLE crm_atividades ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

\echo '  ✅ crm_atividades: colunas delta adicionadas'

-- ════════════════════════════════════════════════════════════
-- TABELA: crm_documentos
-- Verifica colunas necessárias para o servidor
-- ════════════════════════════════════════════════════════════
ALTER TABLE crm_documentos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

\echo '  ✅ crm_documentos: colunas delta adicionadas'

-- ════════════════════════════════════════════════════════════
-- TABELA: crm_qualificacoes_ia
-- Verifica colunas necessárias para o servidor
-- ════════════════════════════════════════════════════════════
ALTER TABLE crm_qualificacoes_ia ADD COLUMN IF NOT EXISTS versao_modelo TEXT;
ALTER TABLE crm_qualificacoes_ia ADD COLUMN IF NOT EXISTS modelo_ia     TEXT;

\echo '  ✅ crm_qualificacoes_ia: colunas delta adicionadas'

-- ════════════════════════════════════════════════════════════
-- TABELAS NOVAS (se não existirem — crm_score_historico, crm_recomendacoes_ia)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS crm_score_historico (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  score      INTEGER     NOT NULL CHECK (score BETWEEN 0 AND 100),
  tipo       TEXT        NOT NULL DEFAULT 'ia' CHECK (tipo IN ('ia','manual','sistema')),
  motivo     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_recomendacoes_ia (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  linha_recomendada TEXT,
  probabilidade     NUMERIC(5,2),
  motivo            TEXT,
  pontos_atencao    TEXT[],
  proximos_passos   TEXT[],
  modelo_ia         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_historico_funil (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  colaborador_id UUID        REFERENCES colaboradores(id) ON DELETE SET NULL,
  etapa_anterior TEXT,
  etapa_nova     TEXT        NOT NULL,
  motivo         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

\echo '  ✅ tabelas novas criadas (se ausentes)'

-- ════════════════════════════════════════════════════════════
-- TRIGGERS: updated_at automático
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION set_updated_at()
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
      BEFORE UPDATE ON leads
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_colaboradores_updated_at') THEN
    CREATE TRIGGER trg_colaboradores_updated_at
      BEFORE UPDATE ON colaboradores
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_ativ_updated_at') THEN
    CREATE TRIGGER trg_crm_ativ_updated_at
      BEFORE UPDATE ON crm_atividades
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

\echo '  ✅ triggers updated_at configurados'

-- ════════════════════════════════════════════════════════════
-- ÍNDICES
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_leads_etapa_funil  ON leads(etapa_funil);
CREATE INDEX IF NOT EXISTS idx_leads_origem       ON leads(origem);
CREATE INDEX IF NOT EXISTS idx_leads_status       ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_responsavel  ON leads(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at   ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_utm_source   ON leads(utm_source) WHERE utm_source IS NOT NULL;

\echo '  ✅ índices criados'

-- ════════════════════════════════════════════════════════════
-- VIEW: vw_crm_pipeline (recria para usar colunas reais)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW vw_crm_pipeline AS
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
  -- Usa valor_solicitado (nova coluna) com fallback para valor_desejado (coluna original)
  COALESCE(l.valor_solicitado, NULLIF(TRIM(l.valor_desejado),'')::NUMERIC) AS valor_solicitado,
  COALESCE(l.prazo_meses, NULLIF(TRIM(l.prazo),'')::INTEGER)               AS prazo_meses,
  l.etapa_funil,
  l.temperatura,
  l.score_ia,
  l.score_manual,
  COALESCE(l.score_manual, l.score_ia, 0)                                  AS score_efetivo,
  l.tags,
  l.proximo_followup,
  l.ultimo_contato_em,
  l.resumo_ia,
  l.observacoes_ia,
  l.chatwoot_conv_id,
  l.responsavel_id,
  c.nome                                                                    AS responsavel_nome,
  l.origem,
  l.status,
  l.utm_source,
  l.utm_medium,
  l.utm_campaign,
  l.pagina_origem,
  l.created_at,
  l.updated_at,
  COALESCE(d.total_docs, 0)                                                 AS total_docs,
  COALESCE(d.docs_recebidos, 0)                                             AS docs_recebidos,
  COALESCE(d.docs_pendentes_obrig, 0)                                       AS docs_pendentes_obrig,
  a.titulo                                                                  AS ultima_atividade,
  a.created_at                                                              AS ultima_atividade_em,
  EXTRACT(DAY FROM NOW() - COALESCE(l.ultimo_contato_em, l.created_at))::INTEGER AS dias_sem_contato
FROM leads l
LEFT JOIN colaboradores c ON c.id = l.responsavel_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                                                    AS total_docs,
    COUNT(*) FILTER (WHERE status IN ('recebido','aprovado'))   AS docs_recebidos,
    COUNT(*) FILTER (WHERE obrigatorio AND status = 'pendente') AS docs_pendentes_obrig
  FROM crm_documentos WHERE lead_id = l.id
) d ON TRUE
LEFT JOIN LATERAL (
  SELECT titulo, created_at
  FROM crm_atividades
  WHERE lead_id = l.id
  ORDER BY created_at DESC LIMIT 1
) a ON TRUE
WHERE l.etapa_funil NOT IN ('inativo');

\echo '  ✅ view vw_crm_pipeline criada/atualizada'

-- ════════════════════════════════════════════════════════════
-- VIEW: vw_leads_para_ia
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW vw_leads_para_ia AS
SELECT
  l.id,
  l.nome,
  l.empresa,
  l.tipo_pessoa,
  l.produto_interesse,
  COALESCE(l.valor_solicitado, NULLIF(TRIM(l.valor_desejado),'')::NUMERIC) AS valor_solicitado,
  COALESCE(l.prazo_meses, NULLIF(TRIM(l.prazo),'')::INTEGER)               AS prazo_meses,
  l.origem,
  l.etapa_funil,
  l.temperatura,
  l.score_ia,
  COALESCE(l.score_manual, l.score_ia, 0)                                  AS score_efetivo,
  l.created_at,
  l.updated_at,
  (l.score_ia = 0 OR l.score_ia IS NULL)                                   AS precisa_score,
  EXTRACT(DAY FROM NOW() - l.created_at)::INTEGER                          AS dias_desde_criacao
FROM leads l
WHERE l.etapa_funil NOT IN ('ganho','perdido','inativo');

\echo '  ✅ view vw_leads_para_ia criada/atualizada'

-- ════════════════════════════════════════════════════════════
-- NORMALIZA etapa_funil: maiúsculo → minúsculo
-- ════════════════════════════════════════════════════════════
UPDATE leads
SET etapa_funil = LOWER(etapa_funil)
WHERE etapa_funil IS DISTINCT FROM LOWER(etapa_funil);

UPDATE leads SET etapa_funil = 'novo' WHERE etapa_funil IS NULL;

\echo '  ✅ etapa_funil normalizado para minúsculo'

-- ════════════════════════════════════════════════════════════
-- RESUMO FINAL
-- ════════════════════════════════════════════════════════════
\echo ''
\echo '════════════════════════════════════════════════════════════════════════'
\echo '  ✅ MIGRAÇÃO DELTA CONCLUÍDA'
\echo '  Colunas adicionadas: valor_solicitado, prazo_meses, utm_source,'
\echo '  utm_medium, utm_campaign, pagina_origem, score_efetivo, n8n_notificado'
\echo '  Views: vw_crm_pipeline, vw_leads_para_ia'
\echo '  Próximo passo: redeploy do container da aplicação'
\echo '════════════════════════════════════════════════════════════════════════'
\echo ''

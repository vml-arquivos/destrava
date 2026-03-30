-- ============================================================
-- SCHEMA IA FOUNDATION — DESTRAVA CRÉDITO
-- Versão: 1.0 | Data: 2026-03-29
-- Prepara a base para Score Proprietário, Qualificação IA e
-- Copiloto Comercial sem quebrar o schema existente.
-- Todos os comandos usam IF NOT EXISTS / OR REPLACE.
-- ============================================================

-- ── 1. Colunas de IA e Score na tabela leads ─────────────────

-- Probabilidade de aprovação de crédito (0-100)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS probabilidade_aprovacao INTEGER
  CHECK (probabilidade_aprovacao BETWEEN 0 AND 100);

-- Probabilidade de conversão comercial (0-100)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS probabilidade_conversao INTEGER
  CHECK (probabilidade_conversao BETWEEN 0 AND 100);

-- Próxima ação sugerida pela IA
ALTER TABLE leads ADD COLUMN IF NOT EXISTS proxima_acao_ia TEXT;

-- Linha de crédito recomendada pela IA
ALTER TABLE leads ADD COLUMN IF NOT EXISTS linha_recomendada TEXT;

-- Prazo estimado de aprovação (texto livre: "3 a 10 dias úteis")
ALTER TABLE leads ADD COLUMN IF NOT EXISTS prazo_aprovacao_estimado TEXT;

-- Resumo da análise de crédito gerado pela IA
ALTER TABLE leads ADD COLUMN IF NOT EXISTS analise_credito_ia TEXT;

-- Dados de UTM para rastreabilidade de origem de campanha
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_source   TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_medium   TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

-- Página de origem da captura
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pagina_origem TEXT;

-- Índices para queries de IA e score
CREATE INDEX IF NOT EXISTS idx_leads_prob_aprovacao  ON leads(probabilidade_aprovacao DESC);
CREATE INDEX IF NOT EXISTS idx_leads_prob_conversao  ON leads(probabilidade_conversao DESC);
CREATE INDEX IF NOT EXISTS idx_leads_origem          ON leads(origem);
CREATE INDEX IF NOT EXISTS idx_leads_utm_source      ON leads(utm_source) WHERE utm_source IS NOT NULL;

-- ── 2. Tabela de eventos de score (histórico de scoring) ─────

CREATE TABLE IF NOT EXISTS crm_score_historico (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  score_anterior  INTEGER,
  score_novo      INTEGER NOT NULL CHECK (score_novo BETWEEN 0 AND 100),
  motivo          TEXT,
  fonte           TEXT NOT NULL DEFAULT 'manual'
    CHECK (fonte IN ('manual','ia','receita_federal','serasa','spc','boa_vista','scr_bacen','comportamento','tributario')),
  dados_brutos    JSONB,
  criado_por      UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_score_lead ON crm_score_historico(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_score_data ON crm_score_historico(created_at DESC);

-- ── 3. Tabela de recomendações IA (copiloto comercial) ────────

CREATE TABLE IF NOT EXISTS crm_recomendacoes_ia (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id              UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo                 TEXT NOT NULL DEFAULT 'proxima_acao'
    CHECK (tipo IN ('proxima_acao','mensagem_sugerida','alerta_risco','reativacao','redistribuicao','linha_credito')),
  titulo               TEXT NOT NULL,
  conteudo             TEXT NOT NULL,
  prioridade           TEXT DEFAULT 'normal' CHECK (prioridade IN ('baixa','normal','alta','urgente')),
  aplicada             BOOLEAN DEFAULT FALSE,
  aplicada_em          TIMESTAMPTZ,
  modelo_ia            TEXT DEFAULT 'gpt-4.1-mini',
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_recom_lead     ON crm_recomendacoes_ia(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_recom_tipo     ON crm_recomendacoes_ia(tipo);
CREATE INDEX IF NOT EXISTS idx_crm_recom_aplicada ON crm_recomendacoes_ia(aplicada) WHERE aplicada = FALSE;

-- ── 4. Tabela de eventos de webhook (idempotência n8n) ────────

CREATE TABLE IF NOT EXISTS crm_eventos_webhook (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento        TEXT NOT NULL,
  source        TEXT,
  lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,
  payload       JSONB,
  processado    BOOLEAN DEFAULT FALSE,
  erro          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_eventos_evento    ON crm_eventos_webhook(evento);
CREATE INDEX IF NOT EXISTS idx_crm_eventos_lead      ON crm_eventos_webhook(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_eventos_data      ON crm_eventos_webhook(created_at DESC);

-- ── 5. View: Leads prontos para qualificação IA ──────────────

CREATE OR REPLACE VIEW vw_leads_para_ia AS
SELECT
  l.id,
  l.nome,
  l.telefone,
  l.email,
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
  l.probabilidade_aprovacao,
  l.probabilidade_conversao,
  l.proxima_acao_ia,
  l.linha_recomendada,
  l.resumo_ia,
  l.created_at,
  l.updated_at,
  -- Indica se o lead precisa de qualificação IA
  (l.score_ia = 0 OR l.score_ia IS NULL)                  AS precisa_score,
  (l.resumo_ia IS NULL OR l.resumo_ia = '')                AS precisa_resumo,
  (l.proxima_acao_ia IS NULL)                              AS precisa_proxima_acao,
  -- Contagem de qualificações anteriores
  COALESCE(q.total_qualificacoes, 0)                       AS total_qualificacoes,
  q.ultima_qualificacao_em
FROM leads l
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS total_qualificacoes, MAX(created_at) AS ultima_qualificacao_em
  FROM crm_qualificacoes_ia WHERE lead_id = l.id
) q ON TRUE
WHERE l.etapa_funil NOT IN ('inativo', 'perdido', 'ganho');

-- ── 6. Função: registrar evento de webhook com idempotência ──

CREATE OR REPLACE FUNCTION registrar_evento_webhook(
  p_evento   TEXT,
  p_source   TEXT,
  p_lead_id  UUID DEFAULT NULL,
  p_payload  JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO crm_eventos_webhook (evento, source, lead_id, payload)
  VALUES (p_evento, p_source, p_lead_id, p_payload)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ── 7. Comentários de documentação ───────────────────────────

COMMENT ON COLUMN leads.probabilidade_aprovacao IS 'Score 0-100 de probabilidade de aprovação de crédito (calculado por IA ou manualmente)';
COMMENT ON COLUMN leads.probabilidade_conversao IS 'Score 0-100 de probabilidade de conversão comercial';
COMMENT ON COLUMN leads.proxima_acao_ia IS 'Próxima ação sugerida pela IA para avançar o lead no funil';
COMMENT ON COLUMN leads.linha_recomendada IS 'Linha de crédito recomendada pela IA com base no perfil do lead';
COMMENT ON COLUMN leads.utm_source IS 'Origem UTM da campanha que gerou o lead';
COMMENT ON COLUMN leads.utm_medium IS 'Meio UTM da campanha que gerou o lead';
COMMENT ON COLUMN leads.utm_campaign IS 'Nome UTM da campanha que gerou o lead';
COMMENT ON TABLE crm_score_historico IS 'Histórico de scoring do lead — base para Score Proprietário Destrava';
COMMENT ON TABLE crm_recomendacoes_ia IS 'Recomendações geradas pelo copiloto IA para ação comercial';
COMMENT ON TABLE crm_eventos_webhook IS 'Log de eventos recebidos via webhook (n8n, Chatwoot, etc.) com suporte a idempotência';

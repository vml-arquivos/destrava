-- ============================================================
-- SCHEMA CRM INTELIGENTE — DESTRAVA CRÉDITO
-- Versão: 3.0 | Data: 2026-03-25
-- Compatível com banco existente (usa IF NOT EXISTS em tudo)
-- ============================================================

-- ── 1. Adicionar colunas CRM na tabela leads existente ───────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tipo_pessoa       TEXT DEFAULT 'pj' CHECK (tipo_pessoa IN ('pf','pj'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cpf_cnpj          TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cargo             TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cidade            TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS estado            CHAR(2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS canal_origem      TEXT DEFAULT 'site';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS produto_interesse TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS valor_solicitado  NUMERIC(15,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS prazo_meses       INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS etapa_funil       TEXT DEFAULT 'novo'
  CHECK (etapa_funil IN ('novo','contato_feito','qualificado','proposta_enviada','negociacao','documentacao','aprovacao','ganho','perdido','inativo'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS temperatura       TEXT DEFAULT 'frio'
  CHECK (temperatura IN ('frio','morno','quente','urgente'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_ia          INTEGER DEFAULT 0 CHECK (score_ia BETWEEN 0 AND 100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_manual      INTEGER CHECK (score_manual BETWEEN 0 AND 100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_efetivo     INTEGER GENERATED ALWAYS AS (COALESCE(score_manual, score_ia)) STORED;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags              TEXT[] DEFAULT '{}';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS proximo_followup  TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ultimo_contato_em TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS resumo_ia         TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS observacoes_ia    TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS chatwoot_conv_id  BIGINT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_jid      TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS responsavel_id    UUID REFERENCES colaboradores(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();

-- Índices para performance do CRM
CREATE INDEX IF NOT EXISTS idx_leads_etapa_funil    ON leads(etapa_funil);
CREATE INDEX IF NOT EXISTS idx_leads_temperatura    ON leads(temperatura);
CREATE INDEX IF NOT EXISTS idx_leads_score_efetivo  ON leads(score_efetivo DESC);
CREATE INDEX IF NOT EXISTS idx_leads_telefone       ON leads(telefone);
CREATE INDEX IF NOT EXISTS idx_leads_responsavel    ON leads(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_leads_followup       ON leads(proximo_followup) WHERE proximo_followup IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_chatwoot       ON leads(chatwoot_conv_id) WHERE chatwoot_conv_id IS NOT NULL;

-- ── 2. Atividades do CRM ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_atividades (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  tipo          TEXT NOT NULL DEFAULT 'nota'
    CHECK (tipo IN ('nota','ligacao','whatsapp','email','reuniao','proposta','documento','status_change','ia_acao','followup','outro')),
  titulo        TEXT NOT NULL,
  descricao     TEXT,
  resultado     TEXT CHECK (resultado IN ('positivo','neutro','negativo','sem_resposta',NULL)),
  origem_ia     BOOLEAN DEFAULT FALSE,
  concluido     BOOLEAN DEFAULT TRUE,
  agendado_para TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_atividades_lead     ON crm_atividades(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_atividades_tipo     ON crm_atividades(tipo);
CREATE INDEX IF NOT EXISTS idx_crm_atividades_data     ON crm_atividades(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_atividades_ia       ON crm_atividades(lead_id) WHERE origem_ia = TRUE;

-- ── 3. Documentos do CRM ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_documentos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  tipo          TEXT NOT NULL DEFAULT 'outro',
  status        TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','solicitado','recebido','aprovado','rejeitado')),
  obrigatorio   BOOLEAN DEFAULT FALSE,
  observacao    TEXT,
  url_arquivo   TEXT,
  recebido_em   TIMESTAMPTZ,
  aprovado_em   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_documentos_lead   ON crm_documentos(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_documentos_status ON crm_documentos(status);

-- ── 4. Qualificações da IA ───────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_qualificacoes_ia (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id              UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  score                INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  temperatura          TEXT NOT NULL CHECK (temperatura IN ('frio','morno','quente','urgente')),
  etapa_sugerida       TEXT NOT NULL,
  resumo               TEXT NOT NULL,
  proxima_acao         TEXT,
  pontos_positivos     TEXT[] DEFAULT '{}',
  pontos_atencao       TEXT[] DEFAULT '{}',
  documentos_faltando  TEXT[] DEFAULT '{}',
  probabilidade_conv   INTEGER CHECK (probabilidade_conv BETWEEN 0 AND 100),
  modelo_ia            TEXT DEFAULT 'gemini-2.5-pro',
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_qualif_lead ON crm_qualificacoes_ia(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_qualif_data ON crm_qualificacoes_ia(created_at DESC);

-- ── 5. Histórico de movimentações do funil ───────────────────
CREATE TABLE IF NOT EXISTS crm_historico_funil (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  etapa_de     TEXT,
  etapa_para   TEXT NOT NULL,
  motivo       TEXT,
  colaborador_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  origem_ia    BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_funil_lead ON crm_historico_funil(lead_id);

-- ── 6. Metas e performance dos colaboradores ─────────────────
CREATE TABLE IF NOT EXISTS crm_metas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  periodo         DATE NOT NULL,
  meta_leads      INTEGER DEFAULT 0,
  meta_convertidos INTEGER DEFAULT 0,
  meta_valor      NUMERIC(15,2) DEFAULT 0,
  real_leads      INTEGER DEFAULT 0,
  real_convertidos INTEGER DEFAULT 0,
  real_valor      NUMERIC(15,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(colaborador_id, periodo)
);

-- ── 7. Funções auxiliares do CRM ─────────────────────────────

-- Função: mover lead no funil com registro de histórico
CREATE OR REPLACE FUNCTION crm_mover_funil(
  p_lead_id    UUID,
  p_nova_etapa TEXT,
  p_motivo     TEXT DEFAULT NULL,
  p_collab_id  UUID DEFAULT NULL,
  p_origem_ia  BOOLEAN DEFAULT FALSE
) RETURNS UUID AS $$
DECLARE
  v_etapa_atual TEXT;
  v_hist_id     UUID;
BEGIN
  SELECT etapa_funil INTO v_etapa_atual FROM leads WHERE id = p_lead_id;

  IF v_etapa_atual = p_nova_etapa THEN RETURN NULL; END IF;

  -- Registrar histórico
  INSERT INTO crm_historico_funil (lead_id, etapa_de, etapa_para, motivo, colaborador_id, origem_ia)
  VALUES (p_lead_id, v_etapa_atual, p_nova_etapa, p_motivo, p_collab_id, p_origem_ia)
  RETURNING id INTO v_hist_id;

  -- Atualizar lead
  UPDATE leads SET
    etapa_funil  = p_nova_etapa,
    updated_at   = NOW(),
    status       = p_nova_etapa
  WHERE id = p_lead_id;

  -- Registrar atividade automática
  INSERT INTO crm_atividades (lead_id, colaborador_id, tipo, titulo, descricao, origem_ia, concluido)
  VALUES (
    p_lead_id, p_collab_id, 'status_change',
    'Movido para: ' || p_nova_etapa,
    COALESCE(p_motivo, 'Movimentação no funil'),
    p_origem_ia, TRUE
  );

  RETURN v_hist_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função: atualizar qualificação da IA e propagar para o lead
CREATE OR REPLACE FUNCTION crm_atualizar_qualificacao(
  p_lead_id          UUID,
  p_score            INTEGER,
  p_temperatura      TEXT,
  p_etapa_sugerida   TEXT,
  p_resumo           TEXT,
  p_proxima_acao     TEXT DEFAULT NULL,
  p_docs_faltando    TEXT[] DEFAULT '{}',
  p_prob_conv        INTEGER DEFAULT NULL,
  p_pontos_pos       TEXT[] DEFAULT '{}',
  p_pontos_atencao   TEXT[] DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_qualif_id UUID;
BEGIN
  -- Inserir qualificação
  INSERT INTO crm_qualificacoes_ia (
    lead_id, score, temperatura, etapa_sugerida, resumo,
    proxima_acao, documentos_faltando, probabilidade_conv,
    pontos_positivos, pontos_atencao
  ) VALUES (
    p_lead_id, p_score, p_temperatura, p_etapa_sugerida, p_resumo,
    p_proxima_acao, p_docs_faltando, p_prob_conv,
    p_pontos_pos, p_pontos_atencao
  ) RETURNING id INTO v_qualif_id;

  -- Atualizar lead com dados da IA
  UPDATE leads SET
    score_ia       = p_score,
    temperatura    = p_temperatura,
    resumo_ia      = p_resumo,
    observacoes_ia = p_proxima_acao,
    updated_at     = NOW()
  WHERE id = p_lead_id;

  -- Mover funil automaticamente se score alto e etapa diferente
  IF p_score >= 60 THEN
    PERFORM crm_mover_funil(p_lead_id, p_etapa_sugerida, 'Qualificação automática IA', NULL, TRUE);
  END IF;

  RETURN v_qualif_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leads_updated_at') THEN
    CREATE TRIGGER trg_leads_updated_at
      BEFORE UPDATE ON leads
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_docs_updated_at') THEN
    CREATE TRIGGER trg_crm_docs_updated_at
      BEFORE UPDATE ON crm_documentos
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ── 8. View: Pipeline CRM (usada pelo frontend) ──────────────
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
  c.nome AS responsavel_nome,
  l.origem,
  l.status,
  l.created_at,
  l.updated_at,
  -- Contagem de documentos
  COALESCE(d.total_docs, 0)          AS total_docs,
  COALESCE(d.docs_recebidos, 0)      AS docs_recebidos,
  COALESCE(d.docs_pendentes_obrig, 0) AS docs_pendentes_obrig,
  -- Última atividade
  a.titulo                           AS ultima_atividade,
  a.created_at                       AS ultima_atividade_em,
  -- Dias sem contato
  EXTRACT(DAY FROM NOW() - COALESCE(l.ultimo_contato_em, l.created_at))::INTEGER AS dias_sem_contato
FROM leads l
LEFT JOIN colaboradores c ON c.id = l.responsavel_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                                                   AS total_docs,
    COUNT(*) FILTER (WHERE status IN ('recebido','aprovado')) AS docs_recebidos,
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

-- ── 9. View: Dashboard de métricas CRM ──────────────────────
CREATE OR REPLACE VIEW vw_crm_metricas AS
SELECT
  etapa_funil,
  temperatura,
  COUNT(*)                    AS total_leads,
  SUM(valor_solicitado)       AS valor_total_pipeline,
  AVG(score_efetivo)::INTEGER AS score_medio,
  COUNT(*) FILTER (WHERE proximo_followup <= NOW()) AS followups_atrasados,
  COUNT(*) FILTER (WHERE dias_sem_contato > 7)      AS sem_contato_7d
FROM vw_crm_pipeline
GROUP BY etapa_funil, temperatura;

-- ── 10. RLS: Políticas de segurança ─────────────────────────
ALTER TABLE crm_atividades     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_documentos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_qualificacoes_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_historico_funil ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_metas          ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_atividades' AND policyname = 'colaboradores_crm_atividades') THEN
    CREATE POLICY colaboradores_crm_atividades ON crm_atividades
      FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_documentos' AND policyname = 'colaboradores_crm_documentos') THEN
    CREATE POLICY colaboradores_crm_documentos ON crm_documentos
      FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_qualificacoes_ia' AND policyname = 'colaboradores_crm_qualif') THEN
    CREATE POLICY colaboradores_crm_qualif ON crm_qualificacoes_ia
      FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_historico_funil' AND policyname = 'colaboradores_crm_funil') THEN
    CREATE POLICY colaboradores_crm_funil ON crm_historico_funil
      FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_metas' AND policyname = 'colaboradores_crm_metas') THEN
    CREATE POLICY colaboradores_crm_metas ON crm_metas
      FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
  END IF;
END $$;

-- ── 11. Permissões para service_role (n8n) ───────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_atividades      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_documentos      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_qualificacoes_ia TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_historico_funil TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_metas           TO service_role;
GRANT SELECT ON vw_crm_pipeline  TO authenticated, service_role;
GRANT SELECT ON vw_crm_metricas  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION crm_mover_funil TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION crm_atualizar_qualificacao TO authenticated, service_role;

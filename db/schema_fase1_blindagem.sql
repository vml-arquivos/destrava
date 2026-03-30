-- ============================================================
-- DESTRAVA CRÉDITO — FASE 1: BLINDAGEM OPERACIONAL
-- ============================================================

-- ── 1. Eventos de Webhook (Trilha Auditável e Idempotência) ──
CREATE TABLE IF NOT EXISTS crm_eventos_webhook (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            TEXT UNIQUE NOT NULL, -- ID único do evento (ex: do Chatwoot/WhatsApp) para deduplicação
  origem              TEXT NOT NULL, -- ex: 'chatwoot', 'whatsapp_api'
  tipo_evento         TEXT NOT NULL, -- ex: 'message_created', 'conversation_status_changed'
  payload             JSONB NOT NULL, -- Payload completo original
  status_processamento TEXT NOT NULL DEFAULT 'pendente' CHECK (status_processamento IN ('pendente', 'processado', 'erro', 'ignorado')),
  erro_detalhe        TEXT, -- Trilha de erro de processamento
  processado_em       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_eventos_status ON crm_eventos_webhook(status_processamento);
CREATE INDEX IF NOT EXISTS idx_crm_eventos_created ON crm_eventos_webhook(created_at DESC);

-- ── 2. Conversas Canônicas ───────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_conversas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             UUID REFERENCES leads(id) ON DELETE CASCADE,
  canal               TEXT NOT NULL, -- ex: 'whatsapp', 'instagram'
  canal_id_externo    TEXT UNIQUE NOT NULL, -- ID da conversa no Chatwoot ou JID no WhatsApp
  status              TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada', 'pendente_ia', 'escalada_humano')),
  resumo_contexto     TEXT, -- Resumo contínuo da conversa mantido pela IA
  iniciada_em         TIMESTAMPTZ DEFAULT NOW(),
  ultima_interacao_em TIMESTAMPTZ DEFAULT NOW(),
  fechada_em          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_conversas_lead ON crm_conversas(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_conversas_status ON crm_conversas(status);
CREATE INDEX IF NOT EXISTS idx_crm_conversas_ultima_int ON crm_conversas(ultima_interacao_em DESC);

-- ── 3. Mensagens Canônicas ───────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_mensagens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id         UUID NOT NULL REFERENCES crm_conversas(id) ON DELETE CASCADE,
  message_id_externo  TEXT UNIQUE NOT NULL, -- ID da mensagem no Chatwoot/WhatsApp para deduplicação forte
  direcao             TEXT NOT NULL CHECK (direcao IN ('inbound', 'outbound')), -- inbound (cliente -> empresa), outbound (empresa -> cliente)
  remetente_tipo      TEXT NOT NULL CHECK (remetente_tipo IN ('cliente', 'ia', 'humano', 'sistema')),
  remetente_id        TEXT, -- ID do colaborador, se humano
  tipo_conteudo       TEXT NOT NULL DEFAULT 'texto' CHECK (tipo_conteudo IN ('texto', 'audio', 'imagem', 'documento', 'template', 'outro')),
  conteudo            TEXT, -- Texto da mensagem ou URL da mídia
  metadados           JSONB, -- Dados extras (ex: duração do áudio, nome do arquivo)
  status_envio        TEXT CHECK (status_envio IN ('enviado', 'entregue', 'lido', 'falha')), -- Apenas para outbound
  evento_id           UUID REFERENCES crm_eventos_webhook(id) ON DELETE SET NULL, -- Vínculo com o evento que gerou a mensagem
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_mensagens_conversa ON crm_mensagens(conversa_id);
CREATE INDEX IF NOT EXISTS idx_crm_mensagens_direcao ON crm_mensagens(direcao);
CREATE INDEX IF NOT EXISTS idx_crm_mensagens_created ON crm_mensagens(created_at DESC);

-- ── 4. Triggers e Funções de Apoio ───────────────────────────

-- Atualizar updated_at da conversa
CREATE OR REPLACE FUNCTION trg_update_conversa_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_conversas_updated_at') THEN
    CREATE TRIGGER trg_crm_conversas_updated_at
      BEFORE UPDATE ON crm_conversas
      FOR EACH ROW EXECUTE FUNCTION trg_update_conversa_timestamp();
  END IF;
END $$;

-- Atualizar ultima_interacao_em da conversa ao inserir mensagem
CREATE OR REPLACE FUNCTION trg_update_conversa_ultima_interacao()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE crm_conversas 
  SET ultima_interacao_em = NEW.created_at 
  WHERE id = NEW.conversa_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_mensagens_interacao') THEN
    CREATE TRIGGER trg_crm_mensagens_interacao
      AFTER INSERT ON crm_mensagens
      FOR EACH ROW EXECUTE FUNCTION trg_update_conversa_ultima_interacao();
  END IF;
END $$;

-- Criar atividade no CRM automaticamente para interações relevantes
CREATE OR REPLACE FUNCTION crm_registrar_interacao_atividade(
  p_lead_id UUID,
  p_direcao TEXT,
  p_resumo TEXT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO crm_atividades (
    lead_id, tipo, titulo, descricao, origem_ia, concluido
  ) VALUES (
    p_lead_id, 
    'whatsapp', 
    CASE WHEN p_direcao = 'inbound' THEN 'Mensagem recebida do cliente' ELSE 'Mensagem enviada ao cliente' END,
    p_resumo,
    TRUE,
    TRUE
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- DESTRAVA CRÉDITO — Migração de Integração v2.0
-- Objetivo: Persistência de conversas, mensagens, eventos webhook
--           com idempotência, trilha de erro e ownership.
-- Segurança: 100% idempotente (IF NOT EXISTS em tudo)
-- Não altera nem destrói nenhuma tabela existente.
-- Executar com: psql -U postgres -d postgres
-- ============================================================

BEGIN;

-- ─── ETAPA 1: Evoluir crm_eventos_webhook existente ──────────
-- A tabela já existe mas sem event_id único, sem erro_detalhe,
-- sem origem e sem status_processamento. Adicionamos cirurgicamente.

ALTER TABLE public.crm_eventos_webhook
  ADD COLUMN IF NOT EXISTS event_id            TEXT,
  ADD COLUMN IF NOT EXISTS origem              TEXT DEFAULT 'n8n',
  ADD COLUMN IF NOT EXISTS tipo_evento         TEXT,
  ADD COLUMN IF NOT EXISTS status_processamento TEXT DEFAULT 'pendente'
    CHECK (status_processamento IN ('pendente','processado','erro','ignorado')),
  ADD COLUMN IF NOT EXISTS erro_detalhe        TEXT,
  ADD COLUMN IF NOT EXISTS processado_em       TIMESTAMPTZ;

-- Índice único para idempotência (só se event_id não for null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_eventos_event_id
  ON public.crm_eventos_webhook(event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_eventos_status_proc
  ON public.crm_eventos_webhook(status_processamento);

CREATE INDEX IF NOT EXISTS idx_crm_eventos_origem
  ON public.crm_eventos_webhook(origem);

-- ─── ETAPA 2: Criar crm_conversas ────────────────────────────
-- Tabela canônica de conversas. Vincula lead, empresa, responsável,
-- canal e ID externo (Chatwoot conv_id ou WhatsApp JID).

CREATE TABLE IF NOT EXISTS public.crm_conversas (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             UUID        REFERENCES public.leads(id) ON DELETE SET NULL,
  empresa_id          UUID        REFERENCES public.empresas(id) ON DELETE SET NULL,
  responsavel_id      UUID        REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  canal               TEXT        NOT NULL DEFAULT 'whatsapp',
  canal_id_externo    TEXT        NOT NULL,  -- chatwoot_conv_id ou JID
  origem_campanha     TEXT,
  status              TEXT        NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta','fechada','pendente_ia','escalada_humano','resolvida')),
  status_atendimento  TEXT        DEFAULT 'bot'
    CHECK (status_atendimento IN ('bot','humano','aguardando','encerrado')),
  resumo_contexto     TEXT,
  contexto_resumido   TEXT,
  metadados           JSONB       DEFAULT '{}',
  humano_assumiu      BOOLEAN     NOT NULL DEFAULT FALSE,
  nao_automatizar     BOOLEAN     NOT NULL DEFAULT FALSE,
  labels              TEXT[]      DEFAULT '{}',
  iniciada_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultima_interacao_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fechada_em          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canal, canal_id_externo)
);

CREATE INDEX IF NOT EXISTS idx_crm_conversas_lead
  ON public.crm_conversas(lead_id) WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_conversas_empresa
  ON public.crm_conversas(empresa_id) WHERE empresa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_conversas_responsavel
  ON public.crm_conversas(responsavel_id) WHERE responsavel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_conversas_status
  ON public.crm_conversas(status);

CREATE INDEX IF NOT EXISTS idx_crm_conversas_ultima_int
  ON public.crm_conversas(ultima_interacao_em DESC);

CREATE INDEX IF NOT EXISTS idx_crm_conversas_canal_ext
  ON public.crm_conversas(canal_id_externo);

-- Trigger: atualizar updated_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_conversas_updated_at') THEN
    CREATE TRIGGER trg_crm_conversas_updated_at
      BEFORE UPDATE ON public.crm_conversas
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ─── ETAPA 3: Criar crm_mensagens ────────────────────────────
-- Tabela canônica de mensagens. Cada mensagem tem ID externo único
-- para deduplicação forte (idempotência por message_id_externo).

CREATE TABLE IF NOT EXISTS public.crm_mensagens (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id         UUID        NOT NULL REFERENCES public.crm_conversas(id) ON DELETE CASCADE,
  evento_id           UUID        REFERENCES public.crm_eventos_webhook(id) ON DELETE SET NULL,
  message_id_externo  TEXT        UNIQUE NOT NULL,  -- ID do Chatwoot/WhatsApp
  direcao             TEXT        NOT NULL CHECK (direcao IN ('inbound','outbound')),
  remetente_tipo      TEXT        NOT NULL DEFAULT 'cliente'
    CHECK (remetente_tipo IN ('cliente','ia','humano','sistema')),
  remetente_id        TEXT,       -- UUID do colaborador se humano
  tipo_conteudo       TEXT        NOT NULL DEFAULT 'texto'
    CHECK (tipo_conteudo IN ('texto','audio','imagem','documento','template','interativo','outro')),
  conteudo            TEXT,
  media_url           TEXT,
  metadados           JSONB       DEFAULT '{}',
  status_envio        TEXT        CHECK (status_envio IN ('enviado','entregue','lido','falha')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_mensagens_conversa
  ON public.crm_mensagens(conversa_id);

CREATE INDEX IF NOT EXISTS idx_crm_mensagens_created
  ON public.crm_mensagens(created_at DESC);

-- Trigger: atualizar ultima_interacao_em da conversa ao inserir mensagem
CREATE OR REPLACE FUNCTION public.crm_atualizar_ultima_interacao()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.crm_conversas
  SET ultima_interacao_em = NEW.created_at,
      updated_at = NOW()
  WHERE id = NEW.conversa_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_mensagens_interacao') THEN
    CREATE TRIGGER trg_crm_mensagens_interacao
      AFTER INSERT ON public.crm_mensagens
      FOR EACH ROW EXECUTE FUNCTION public.crm_atualizar_ultima_interacao();
  END IF;
END $$;

-- ─── ETAPA 4: Adicionar campo de role/perfil em colaboradores ─
-- Adiciona coluna 'perfil' para RBAC: admin, gestor, colaborador.
-- Preserva cargo existente. Popula a partir do cargo atual.

ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS perfil TEXT NOT NULL DEFAULT 'colaborador'
    CHECK (perfil IN ('admin','gestor','colaborador'));

-- Migrar cargos existentes para o perfil correto
UPDATE public.colaboradores
SET perfil = 'admin'
WHERE lower(cargo) IN ('admin','administrador','diretor','gerente','gestor')
  AND perfil = 'colaborador';

-- ─── ETAPA 5: Adicionar campos de rastreabilidade em leads ────
-- Campos que podem não existir em produção mas são necessários.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS chatwoot_contact_id  BIGINT,
  ADD COLUMN IF NOT EXISTS whatsapp_jid         TEXT,
  ADD COLUMN IF NOT EXISTS status_atendimento   TEXT DEFAULT 'nenhum'
    CHECK (status_atendimento IN ('nenhum','bot','humano','aguardando','encerrado')),
  ADD COLUMN IF NOT EXISTS ultimo_canal         TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_chatwoot_contact
  ON public.leads(chatwoot_contact_id) WHERE chatwoot_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_jid
  ON public.leads(whatsapp_jid) WHERE whatsapp_jid IS NOT NULL;

-- ─── ETAPA 6: Adicionar campos de rastreabilidade em empresas ─

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS owner_principal_id   UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS compartilhada        BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_empresas_owner
  ON public.empresas(owner_principal_id) WHERE owner_principal_id IS NOT NULL;

COMMIT;

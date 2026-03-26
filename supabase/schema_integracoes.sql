-- ============================================================
-- DESTRAVA CRÉDITO — Schema de Integrações
-- WhatsApp (Baileys) + Chatwoot + n8n + Agentes de IA
-- Execute APÓS o schema.sql principal
-- ============================================================

-- ─── Extensões adicionais ─────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- busca textual eficiente
CREATE EXTENSION IF NOT EXISTS "unaccent";   -- normalização de acentos

-- ============================================================
-- BLOCO 1: TABELAS DE SUPORTE PÚBLICO (leads e contatos)
-- Necessárias para o server/index.ts v3.0
-- ============================================================

-- ─── Tabela: leads (pública — captura do site) ────────────────
-- Complementa a tabela leads já existente com campos adicionais
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TRIGGER IF NOT EXISTS trg_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Tabela: simulacoes_publicas ─────────────────────────────
-- Simulações feitas pelo simulador público (sem autenticação)
CREATE TABLE IF NOT EXISTS public.simulacoes_publicas (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome              TEXT NOT NULL,
  email             TEXT,
  telefone          TEXT NOT NULL,
  empresa           TEXT,
  cpf_cnpj          TEXT,
  tipo_pessoa       TEXT NOT NULL DEFAULT 'pf' CHECK (tipo_pessoa IN ('pf', 'pj')),
  produto           TEXT NOT NULL,
  valor_solicitado  NUMERIC(15,2) NOT NULL,
  prazo             INTEGER NOT NULL,
  taxa_aplicada     NUMERIC(8,4),
  parcela_mensal    NUMERIC(15,2),
  total_pagar       NUMERIC(15,2),
  origem            TEXT NOT NULL DEFAULT 'simulador_publico',
  n8n_notificado    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.simulacoes_publicas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inserção pública de simulações"
  ON public.simulacoes_publicas FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Colaboradores autenticados podem ver simulações públicas"
  ON public.simulacoes_publicas FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_sims_publicas_created_at
  ON public.simulacoes_publicas(created_at DESC);

-- ─── Tabela: contatos ─────────────────────────────────────────
-- Mensagens do formulário de contato do site
CREATE TABLE IF NOT EXISTS public.contatos (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome      TEXT NOT NULL,
  email     TEXT NOT NULL,
  telefone  TEXT,
  assunto   TEXT NOT NULL,
  mensagem  TEXT NOT NULL,
  status    TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'respondido', 'arquivado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inserção pública de contatos"
  ON public.contatos FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Colaboradores autenticados podem ver contatos"
  ON public.contatos FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Colaboradores autenticados podem atualizar contatos"
  ON public.contatos FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_contatos_created_at
  ON public.contatos(created_at DESC);

-- ============================================================
-- BLOCO 2: WHATSAPP / BAILEYS
-- Gerenciamento de sessões, conversas e mensagens
-- ============================================================

-- ─── Tabela: whatsapp_sessoes ─────────────────────────────────
-- Sessões ativas do Baileys (uma por número de WhatsApp)
CREATE TABLE IF NOT EXISTS public.whatsapp_sessoes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome            TEXT NOT NULL,                    -- ex: "Destrava Principal"
  numero          TEXT NOT NULL UNIQUE,             -- ex: "5561986055223"
  status          TEXT NOT NULL DEFAULT 'desconectado'
                    CHECK (status IN ('conectado','desconectado','aguardando_qr','erro')),
  qr_code         TEXT,                             -- base64 do QR para escanear
  webhook_url     TEXT,                             -- URL do n8n para receber eventos
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_ping     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_sessoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaboradores autenticados gerenciam sessões WhatsApp"
  ON public.whatsapp_sessoes FOR ALL
  USING (auth.role() = 'authenticated');

CREATE TRIGGER trg_whatsapp_sessoes_updated_at
  BEFORE UPDATE ON public.whatsapp_sessoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Tabela: whatsapp_contatos ────────────────────────────────
-- Contatos do WhatsApp (sincronizados pelo Baileys)
CREATE TABLE IF NOT EXISTS public.whatsapp_contatos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sessao_id       UUID NOT NULL REFERENCES public.whatsapp_sessoes(id) ON DELETE CASCADE,
  jid             TEXT NOT NULL,                    -- ex: "5561999999999@s.whatsapp.net"
  numero          TEXT NOT NULL,
  nome_push       TEXT,                             -- nome salvo no WhatsApp
  nome_negocio    TEXT,                             -- nome comercial (se disponível)
  foto_url        TEXT,
  is_grupo        BOOLEAN NOT NULL DEFAULT FALSE,
  cliente_id      UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  lead_id         UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  tags            TEXT[] DEFAULT '{}',
  bloqueado       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sessao_id, jid)
);

ALTER TABLE public.whatsapp_contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaboradores autenticados gerenciam contatos WhatsApp"
  ON public.whatsapp_contatos FOR ALL
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_wa_contatos_sessao ON public.whatsapp_contatos(sessao_id);
CREATE INDEX IF NOT EXISTS idx_wa_contatos_numero ON public.whatsapp_contatos(numero);
CREATE INDEX IF NOT EXISTS idx_wa_contatos_cliente ON public.whatsapp_contatos(cliente_id);

CREATE TRIGGER trg_wa_contatos_updated_at
  BEFORE UPDATE ON public.whatsapp_contatos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Tabela: whatsapp_conversas ───────────────────────────────
-- Threads de conversa (agrupam mensagens)
CREATE TABLE IF NOT EXISTS public.whatsapp_conversas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sessao_id       UUID NOT NULL REFERENCES public.whatsapp_sessoes(id) ON DELETE CASCADE,
  contato_id      UUID NOT NULL REFERENCES public.whatsapp_contatos(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'aberta'
                    CHECK (status IN ('aberta','aguardando','em_atendimento','resolvida','arquivada')),
  atribuido_a     UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  canal           TEXT NOT NULL DEFAULT 'whatsapp',
  etiquetas       TEXT[] DEFAULT '{}',
  ultima_mensagem TEXT,
  ultima_msg_em   TIMESTAMPTZ,
  nao_lidas       INTEGER NOT NULL DEFAULT 0,
  -- Integração com Chatwoot
  chatwoot_conv_id INTEGER,
  -- Integração com CRM
  cliente_id      UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  lead_id         UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_conversas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaboradores autenticados gerenciam conversas"
  ON public.whatsapp_conversas FOR ALL
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_wa_conversas_sessao ON public.whatsapp_conversas(sessao_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversas_status ON public.whatsapp_conversas(status);
CREATE INDEX IF NOT EXISTS idx_wa_conversas_atribuido ON public.whatsapp_conversas(atribuido_a);
CREATE INDEX IF NOT EXISTS idx_wa_conversas_ultima_msg ON public.whatsapp_conversas(ultima_msg_em DESC);

CREATE TRIGGER trg_wa_conversas_updated_at
  BEFORE UPDATE ON public.whatsapp_conversas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Tabela: whatsapp_mensagens ───────────────────────────────
-- Histórico completo de mensagens
CREATE TABLE IF NOT EXISTS public.whatsapp_mensagens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversa_id     UUID NOT NULL REFERENCES public.whatsapp_conversas(id) ON DELETE CASCADE,
  sessao_id       UUID NOT NULL REFERENCES public.whatsapp_sessoes(id) ON DELETE CASCADE,
  message_id      TEXT NOT NULL,                    -- ID original do WhatsApp
  jid_remetente   TEXT NOT NULL,
  direcao         TEXT NOT NULL CHECK (direcao IN ('entrada','saida')),
  tipo            TEXT NOT NULL DEFAULT 'texto'
                    CHECK (tipo IN ('texto','imagem','audio','video','documento','sticker','localizacao','contato','template','interativo','sistema')),
  conteudo        TEXT,                             -- texto da mensagem
  caption         TEXT,                             -- legenda de mídia
  media_url       TEXT,                             -- URL do arquivo de mídia
  media_mime      TEXT,                             -- MIME type
  media_tamanho   INTEGER,                          -- tamanho em bytes
  respondendo_a   TEXT,                             -- message_id da mensagem citada
  status          TEXT NOT NULL DEFAULT 'enviado'
                    CHECK (status IN ('enviado','entregue','lido','falhou')),
  enviado_por_ia  BOOLEAN NOT NULL DEFAULT FALSE,
  enviado_por_bot BOOLEAN NOT NULL DEFAULT FALSE,
  agente_id       UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  metadados       JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaboradores autenticados veem mensagens"
  ON public.whatsapp_mensagens FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Inserção de mensagens (sistema/API)"
  ON public.whatsapp_mensagens FOR INSERT
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_wa_msgs_conversa ON public.whatsapp_mensagens(conversa_id);
CREATE INDEX IF NOT EXISTS idx_wa_msgs_created_at ON public.whatsapp_mensagens(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_msgs_message_id ON public.whatsapp_mensagens(message_id);
CREATE INDEX IF NOT EXISTS idx_wa_msgs_direcao ON public.whatsapp_mensagens(direcao);

-- ─── Trigger: atualizar última mensagem na conversa ───────────
CREATE OR REPLACE FUNCTION public.atualizar_ultima_mensagem()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.whatsapp_conversas
  SET
    ultima_mensagem = CASE
      WHEN NEW.tipo = 'texto' THEN LEFT(NEW.conteudo, 100)
      WHEN NEW.tipo = 'imagem' THEN '📷 Imagem'
      WHEN NEW.tipo = 'audio' THEN '🎵 Áudio'
      WHEN NEW.tipo = 'video' THEN '🎬 Vídeo'
      WHEN NEW.tipo = 'documento' THEN '📄 Documento'
      ELSE '💬 Mensagem'
    END,
    ultima_msg_em = NEW.created_at,
    nao_lidas = CASE
      WHEN NEW.direcao = 'entrada' THEN nao_lidas + 1
      ELSE nao_lidas
    END,
    updated_at = NOW()
  WHERE id = NEW.conversa_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_nova_mensagem_wa
  AFTER INSERT ON public.whatsapp_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_ultima_mensagem();

-- ============================================================
-- BLOCO 3: CHATWOOT INTEGRATION
-- Sincronização de conversas e eventos do Chatwoot
-- ============================================================

-- ─── Tabela: chatwoot_eventos ─────────────────────────────────
-- Log de webhooks recebidos do Chatwoot
CREATE TABLE IF NOT EXISTS public.chatwoot_eventos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo_evento     TEXT NOT NULL,                    -- ex: "conversation_created"
  conversa_id     INTEGER,                          -- ID da conversa no Chatwoot
  contato_id      INTEGER,                          -- ID do contato no Chatwoot
  agente_id       INTEGER,                          -- ID do agente no Chatwoot
  payload         JSONB NOT NULL DEFAULT '{}',
  processado      BOOLEAN NOT NULL DEFAULT FALSE,
  erro            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.chatwoot_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inserção de eventos Chatwoot (sistema)"
  ON public.chatwoot_eventos FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Colaboradores autenticados veem eventos Chatwoot"
  ON public.chatwoot_eventos FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_chatwoot_tipo ON public.chatwoot_eventos(tipo_evento);
CREATE INDEX IF NOT EXISTS idx_chatwoot_created_at ON public.chatwoot_eventos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chatwoot_processado ON public.chatwoot_eventos(processado);

-- ─── Tabela: chatwoot_mapeamento ──────────────────────────────
-- Mapeamento entre contatos do Chatwoot e clientes/leads do CRM
CREATE TABLE IF NOT EXISTS public.chatwoot_mapeamento (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatwoot_contato_id INTEGER NOT NULL UNIQUE,
  chatwoot_conv_id    INTEGER,
  cliente_id          UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  lead_id             UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  wa_contato_id       UUID REFERENCES public.whatsapp_contatos(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.chatwoot_mapeamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaboradores autenticados gerenciam mapeamento Chatwoot"
  ON public.chatwoot_mapeamento FOR ALL
  USING (auth.role() = 'authenticated');

CREATE TRIGGER trg_chatwoot_mapeamento_updated_at
  BEFORE UPDATE ON public.chatwoot_mapeamento
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- BLOCO 4: n8n AUTOMAÇÕES
-- Controle de fluxos e execuções do n8n
-- ============================================================

-- ─── Tabela: n8n_fluxos ───────────────────────────────────────
-- Catálogo de fluxos n8n configurados
CREATE TABLE IF NOT EXISTS public.n8n_fluxos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome            TEXT NOT NULL,
  descricao       TEXT,
  webhook_url     TEXT NOT NULL,
  evento_gatilho  TEXT NOT NULL,                    -- ex: "novo_lead", "nova_simulacao"
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  timeout_ms      INTEGER NOT NULL DEFAULT 8000,
  retry_max       INTEGER NOT NULL DEFAULT 3,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.n8n_fluxos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaboradores autenticados gerenciam fluxos n8n"
  ON public.n8n_fluxos FOR ALL
  USING (auth.role() = 'authenticated');

-- ─── Tabela: n8n_execucoes ────────────────────────────────────
-- Log de execuções dos webhooks n8n
CREATE TABLE IF NOT EXISTS public.n8n_execucoes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fluxo_id        UUID REFERENCES public.n8n_fluxos(id) ON DELETE SET NULL,
  evento          TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','enviado','falhou','timeout')),
  tentativas      INTEGER NOT NULL DEFAULT 0,
  resposta_status INTEGER,
  resposta_body   TEXT,
  erro            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executado_em    TIMESTAMPTZ
);

ALTER TABLE public.n8n_execucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inserção de execuções n8n (sistema)"
  ON public.n8n_execucoes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Colaboradores autenticados veem execuções n8n"
  ON public.n8n_execucoes FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_n8n_exec_evento ON public.n8n_execucoes(evento);
CREATE INDEX IF NOT EXISTS idx_n8n_exec_status ON public.n8n_execucoes(status);
CREATE INDEX IF NOT EXISTS idx_n8n_exec_created_at ON public.n8n_execucoes(created_at DESC);

-- ─── Tabela: n8n_fila_reenvio ─────────────────────────────────
-- Fila de eventos que falharam e precisam ser reenviados
CREATE TABLE IF NOT EXISTS public.n8n_fila_reenvio (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execucao_id     UUID REFERENCES public.n8n_execucoes(id) ON DELETE CASCADE,
  evento          TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  tentativas      INTEGER NOT NULL DEFAULT 0,
  max_tentativas  INTEGER NOT NULL DEFAULT 5,
  proximo_envio   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolvido       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.n8n_fila_reenvio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sistema gerencia fila de reenvio n8n"
  ON public.n8n_fila_reenvio FOR ALL
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_n8n_fila_proximo ON public.n8n_fila_reenvio(proximo_envio)
  WHERE resolvido = FALSE;

-- ============================================================
-- BLOCO 5: AGENTES DE IA
-- Contexto, memória e logs dos agentes LLM
-- ============================================================

-- ─── Tabela: ia_agentes ───────────────────────────────────────
-- Configuração dos agentes de IA disponíveis
CREATE TABLE IF NOT EXISTS public.ia_agentes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome            TEXT NOT NULL,                    -- ex: "Destrava Assistente"
  descricao       TEXT,
  modelo          TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
  system_prompt   TEXT NOT NULL,
  temperatura     NUMERIC(3,2) NOT NULL DEFAULT 0.7,
  max_tokens      INTEGER NOT NULL DEFAULT 1024,
  canal           TEXT NOT NULL DEFAULT 'whatsapp'
                    CHECK (canal IN ('whatsapp','web','email','todos')),
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  -- Configurações de comportamento
  responder_fora_horario BOOLEAN NOT NULL DEFAULT FALSE,
  horario_inicio  TIME DEFAULT '08:00',
  horario_fim     TIME DEFAULT '18:00',
  dias_semana     INTEGER[] DEFAULT '{1,2,3,4,5}',  -- 0=Dom, 1=Seg...
  -- Escalada para humano
  escalar_apos_msgs INTEGER DEFAULT 5,
  escalar_palavras  TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ia_agentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaboradores autenticados gerenciam agentes IA"
  ON public.ia_agentes FOR ALL
  USING (auth.role() = 'authenticated');

CREATE TRIGGER trg_ia_agentes_updated_at
  BEFORE UPDATE ON public.ia_agentes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Tabela: ia_sessoes ───────────────────────────────────────
-- Sessões de conversa com agentes de IA (por contato)
CREATE TABLE IF NOT EXISTS public.ia_sessoes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agente_id       UUID NOT NULL REFERENCES public.ia_agentes(id) ON DELETE CASCADE,
  conversa_id     UUID REFERENCES public.whatsapp_conversas(id) ON DELETE SET NULL,
  contato_jid     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'ativa'
                    CHECK (status IN ('ativa','pausada','escalada','encerrada')),
  total_msgs      INTEGER NOT NULL DEFAULT 0,
  tokens_usados   INTEGER NOT NULL DEFAULT 0,
  custo_usd       NUMERIC(10,6) DEFAULT 0,
  escalada_em     TIMESTAMPTZ,
  encerrada_em    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ia_sessoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaboradores autenticados veem sessões IA"
  ON public.ia_sessoes FOR ALL
  USING (auth.role() = 'authenticated');

CREATE POLICY "Inserção de sessões IA (sistema)"
  ON public.ia_sessoes FOR INSERT
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ia_sessoes_agente ON public.ia_sessoes(agente_id);
CREATE INDEX IF NOT EXISTS idx_ia_sessoes_jid ON public.ia_sessoes(contato_jid);
CREATE INDEX IF NOT EXISTS idx_ia_sessoes_status ON public.ia_sessoes(status);

CREATE TRIGGER trg_ia_sessoes_updated_at
  BEFORE UPDATE ON public.ia_sessoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Tabela: ia_mensagens ─────────────────────────────────────
-- Histórico de mensagens trocadas com o agente de IA
CREATE TABLE IF NOT EXISTS public.ia_mensagens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sessao_id       UUID NOT NULL REFERENCES public.ia_sessoes(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  conteudo        TEXT NOT NULL,
  tokens_entrada  INTEGER DEFAULT 0,
  tokens_saida    INTEGER DEFAULT 0,
  latencia_ms     INTEGER,
  modelo_usado    TEXT,
  tool_calls      JSONB DEFAULT '[]',               -- chamadas de ferramentas (function calling)
  metadados       JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ia_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaboradores autenticados veem mensagens IA"
  ON public.ia_mensagens FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Inserção de mensagens IA (sistema)"
  ON public.ia_mensagens FOR INSERT
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ia_msgs_sessao ON public.ia_mensagens(sessao_id);
CREATE INDEX IF NOT EXISTS idx_ia_msgs_created_at ON public.ia_mensagens(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ia_msgs_role ON public.ia_mensagens(role);

-- ─── Tabela: ia_memoria ───────────────────────────────────────
-- Memória persistente dos agentes por contato (RAG simplificado)
CREATE TABLE IF NOT EXISTS public.ia_memoria (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agente_id       UUID NOT NULL REFERENCES public.ia_agentes(id) ON DELETE CASCADE,
  contato_jid     TEXT NOT NULL,
  chave           TEXT NOT NULL,                    -- ex: "nome_cliente", "produto_interesse"
  valor           TEXT NOT NULL,
  confianca       NUMERIC(3,2) DEFAULT 1.0,         -- 0.0 a 1.0
  expira_em       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agente_id, contato_jid, chave)
);

ALTER TABLE public.ia_memoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sistema gerencia memória IA"
  ON public.ia_memoria FOR ALL
  WITH CHECK (true);

CREATE POLICY "Colaboradores autenticados veem memória IA"
  ON public.ia_memoria FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_ia_memoria_agente_jid ON public.ia_memoria(agente_id, contato_jid);

CREATE TRIGGER trg_ia_memoria_updated_at
  BEFORE UPDATE ON public.ia_memoria
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Tabela: ia_base_conhecimento ────────────────────────────
-- Base de conhecimento para RAG (Retrieval-Augmented Generation)
CREATE TABLE IF NOT EXISTS public.ia_base_conhecimento (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titulo          TEXT NOT NULL,
  conteudo        TEXT NOT NULL,
  categoria       TEXT NOT NULL DEFAULT 'geral'
                    CHECK (categoria IN ('produto','processo','faq','script_venda','objecao','politica','geral')),
  tags            TEXT[] DEFAULT '{}',
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  vezes_usado     INTEGER NOT NULL DEFAULT 0,
  criado_por      UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ia_base_conhecimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaboradores autenticados gerenciam base de conhecimento"
  ON public.ia_base_conhecimento FOR ALL
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_ia_conhecimento_categoria ON public.ia_base_conhecimento(categoria);
CREATE INDEX IF NOT EXISTS idx_ia_conhecimento_tags ON public.ia_base_conhecimento USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_ia_conhecimento_texto ON public.ia_base_conhecimento
  USING gin(to_tsvector('portuguese', titulo || ' ' || conteudo));

CREATE TRIGGER trg_ia_conhecimento_updated_at
  BEFORE UPDATE ON public.ia_base_conhecimento
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- BLOCO 6: DADOS INICIAIS
-- Configurações padrão para o ambiente de produção
-- ============================================================

-- Agente IA padrão da Destrava
INSERT INTO public.ia_agentes (nome, descricao, modelo, system_prompt, temperatura, canal, ativo)
VALUES (
  'Destrava Assistente',
  'Agente de atendimento inicial para qualificação de leads via WhatsApp',
  'gpt-4.1-mini',
  'Você é um assistente especializado da Destrava Crédito, empresa de assessoria em crédito empresarial e pessoal localizada em Brasília-DF.

Seu papel é:
1. Recepcionar o cliente de forma cordial e profissional
2. Entender a necessidade de crédito (valor, prazo, tipo de pessoa PF/PJ)
3. Apresentar brevemente as soluções disponíveis
4. Coletar: nome completo, empresa (se PJ), telefone, valor desejado e prazo
5. Informar que um especialista entrará em contato em breve

Regras importantes:
- NUNCA informe taxas ou condições específicas sem consultar um especialista
- NUNCA faça promessas de aprovação
- Seja objetivo: máximo 3 parágrafos por resposta
- Use linguagem formal mas acessível
- Se o cliente perguntar algo fora do escopo de crédito, redirecione gentilmente

Produtos disponíveis:
- Capital de Giro (PJ)
- Crédito Pessoal / Consignado (PF)
- PRONAMPE (MEI/ME/EPP)
- Antecipação de Recebíveis
- Crédito com Garantia de Imóvel',
  0.7,
  'whatsapp',
  TRUE
) ON CONFLICT DO NOTHING;

-- Fluxos n8n padrão
INSERT INTO public.n8n_fluxos (nome, descricao, webhook_url, evento_gatilho, ativo)
VALUES
  ('Notificação Novo Lead', 'Envia alerta no WhatsApp quando um novo lead é capturado', 'https://n8n.destrava.permupay.com.br/webhook/novo-lead', 'novo_lead', FALSE),
  ('Notificação Nova Simulação', 'Envia alerta quando alguém usa o simulador público', 'https://n8n.destrava.permupay.com.br/webhook/nova-simulacao', 'nova_simulacao', FALSE),
  ('Notificação Contato', 'Envia alerta quando alguém envia mensagem pelo formulário', 'https://n8n.destrava.permupay.com.br/webhook/novo-contato', 'novo_contato', FALSE)
ON CONFLICT DO NOTHING;

-- Base de conhecimento inicial
INSERT INTO public.ia_base_conhecimento (titulo, conteudo, categoria, tags)
VALUES
  (
    'Capital de Giro - Informações Gerais',
    'Capital de Giro é uma linha de crédito para empresas cobrirem despesas operacionais do dia a dia. Ideal para: pagar fornecedores, cobrir folha de pagamento, estoque e despesas fixas. Valores: a partir de R$ 10.000. Prazo: 12 a 60 meses. Perfil: empresas com CNPJ ativo há mais de 12 meses, faturamento mínimo de R$ 10.000/mês.',
    'produto',
    ARRAY['capital_giro', 'pj', 'empresarial']
  ),
  (
    'PRONAMPE - Programa Nacional de Apoio às Microempresas',
    'O PRONAMPE é um programa do governo federal para MEI, ME e EPP. Taxa: a partir de Selic + 6% ao ano. Prazo: até 48 meses. Carência: até 11 meses. Garantia: Fundo Garantidor (FGO). Documentos: CNPJ, DRE ou faturamento dos últimos 12 meses, certidões negativas.',
    'produto',
    ARRAY['pronampe', 'mei', 'me', 'epp', 'governo']
  ),
  (
    'Objeção: Taxa muito alta',
    'Quando o cliente reclamar da taxa, responder: "Entendo sua preocupação. A taxa depende do perfil de crédito da empresa, histórico bancário e garantias disponíveis. Nossa equipe faz uma análise personalizada para encontrar a melhor condição para o seu caso. Posso agendar uma conversa com nosso especialista?"',
    'objecao',
    ARRAY['taxa', 'juros', 'caro', 'objecao']
  ),
  (
    'Script de Qualificação de Lead',
    'Olá! Sou o assistente virtual da Destrava Crédito. Vi que você tem interesse em crédito. Para te ajudar melhor, preciso de algumas informações:\n1. Você precisa de crédito para pessoa física ou jurídica (empresa)?\n2. Qual valor aproximado você precisa?\n3. Em quantos meses prefere pagar?\n\nCom essas informações, nosso especialista poderá te apresentar as melhores opções disponíveis.',
    'script_venda',
    ARRAY['qualificacao', 'lead', 'primeiro_contato']
  )
ON CONFLICT DO NOTHING;

-- ============================================================
-- BLOCO 7: VIEWS ÚTEIS
-- ============================================================

-- View: Dashboard de atendimento WhatsApp
CREATE OR REPLACE VIEW public.vw_dashboard_whatsapp AS
SELECT
  s.nome AS sessao,
  s.numero,
  s.status AS status_sessao,
  COUNT(DISTINCT c.id) AS total_conversas,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'aberta') AS conversas_abertas,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'em_atendimento') AS em_atendimento,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'resolvida') AS resolvidas,
  SUM(c.nao_lidas) AS total_nao_lidas,
  COUNT(DISTINCT m.id) FILTER (WHERE m.created_at > NOW() - INTERVAL '24 hours') AS msgs_ultimas_24h
FROM public.whatsapp_sessoes s
LEFT JOIN public.whatsapp_conversas c ON c.sessao_id = s.id
LEFT JOIN public.whatsapp_mensagens m ON m.sessao_id = s.id
GROUP BY s.id, s.nome, s.numero, s.status;

-- View: Leads com última atividade
CREATE OR REPLACE VIEW public.vw_leads_resumo AS
SELECT
  l.id,
  l.nome,
  l.telefone,
  l.empresa,
  l.produto,
  l.valor_solicitado,
  l.status,
  l.origem,
  l.created_at,
  l.updated_at,
  wc.id AS wa_contato_id,
  wconv.id AS wa_conversa_id,
  wconv.status AS status_conversa,
  wconv.nao_lidas
FROM public.leads l
LEFT JOIN public.whatsapp_contatos wc ON wc.lead_id = l.id
LEFT JOIN public.whatsapp_conversas wconv ON wconv.lead_id = l.id
ORDER BY l.created_at DESC;

-- View: Uso e custo dos agentes IA
CREATE OR REPLACE VIEW public.vw_ia_uso AS
SELECT
  a.nome AS agente,
  COUNT(DISTINCT s.id) AS total_sessoes,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'ativa') AS sessoes_ativas,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'escalada') AS escaladas,
  SUM(s.tokens_usados) AS total_tokens,
  SUM(s.custo_usd) AS custo_total_usd,
  AVG(s.total_msgs) AS media_msgs_por_sessao
FROM public.ia_agentes a
LEFT JOIN public.ia_sessoes s ON s.agente_id = a.id
GROUP BY a.id, a.nome;

-- ============================================================
-- FIM DO SCHEMA DE INTEGRAÇÕES
-- ============================================================

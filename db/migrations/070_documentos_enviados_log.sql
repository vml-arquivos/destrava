BEGIN;

-- Registro de envios de documentos (e-mail e WhatsApp) diretamente pelo sistema.
-- Cobre orçamentos, contratos, simulações, propostas bancárias, faturamento e
-- qualquer outro documento gerado pela assessoria. Não substitui o arquivo em
-- si (que continua no acervo/uploads) -- é só o log de "quem mandou o quê,
-- pra quem, por qual canal, e quando".
--
-- Idempotente: seguro rodar de novo.

CREATE TABLE IF NOT EXISTS documentos_enviados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tipo do documento de origem: 'orcamento', 'contrato', 'simulacao',
  -- 'proposta_bancaria', 'faturamento', 'dossie_assessoria', etc.
  -- Não usamos FK aqui de propósito -- cada tipo de documento vive numa
  -- tabela diferente (orcamentos, contratos_gerados, simulacoes, ...) e não
  -- faz sentido uma FK polimórfica só pra log.
  tipo_documento VARCHAR(50) NOT NULL,
  documento_id UUID NOT NULL,

  -- Vínculo opcional com o cadastro do destinatário, quando existir
  -- (pode ser NULL se o envio foi pra um e-mail/telefone avulso digitado na hora).
  empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL,
  cliente_pf_id UUID REFERENCES clientes_pf(id) ON DELETE SET NULL,

  canal VARCHAR(20) NOT NULL CHECK (canal IN ('email', 'whatsapp')),
  destinatario VARCHAR(255) NOT NULL, -- e-mail ou telefone/whatsapp usado de fato
  destinatario_nome VARCHAR(255),

  assunto VARCHAR(300),
  mensagem TEXT,

  status VARCHAR(20) NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado', 'falhou', 'link_gerado')),
  erro TEXT,
  provedor_resposta JSONB,

  -- Token de acesso público, usado só no canal WhatsApp: como wa.me não permite anexar
  -- arquivo, o link enviado aponta pra uma rota pública (sem login) que resolve esse
  -- token e serve o documento. Nulo pro canal e-mail (que anexa o arquivo direto).
  token VARCHAR(64) UNIQUE,
  token_expira_em TIMESTAMPTZ,

  enviado_por UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documentos_enviados_token ON documentos_enviados (token);

CREATE INDEX IF NOT EXISTS idx_documentos_enviados_documento ON documentos_enviados (tipo_documento, documento_id);
CREATE INDEX IF NOT EXISTS idx_documentos_enviados_empresa ON documentos_enviados (empresa_id);
CREATE INDEX IF NOT EXISTS idx_documentos_enviados_enviado_por ON documentos_enviados (enviado_por);
CREATE INDEX IF NOT EXISTS idx_documentos_enviados_enviado_em ON documentos_enviados (enviado_em DESC);

COMMIT;

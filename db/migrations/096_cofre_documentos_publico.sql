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

-- Onda: coleta pública guiada de documentos
-- Aditiva: não altera nem remove tabelas, colunas, constraints ou dados existentes.
-- O arquivo recebido pelo link é mantido em documentos_arquivos apenas como staging,
-- identificado por metadados, e só passa a valer no Acervo após promoção explícita.

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

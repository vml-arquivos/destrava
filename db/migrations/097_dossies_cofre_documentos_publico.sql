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

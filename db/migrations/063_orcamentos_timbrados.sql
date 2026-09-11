-- 063_orcamentos_timbrados.sql
-- Orçamentos timbrados Destrava / PermuPay com clientes PJ/PF, edição livre, assinaturas e anexos.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.orcamentos_timbrados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE,
  tipo_cliente TEXT NOT NULL DEFAULT 'empresa'
    CHECK (tipo_cliente IN ('empresa','pessoa_fisica','livre')),
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  cliente_pf_id UUID REFERENCES public.clientes_pf(id) ON DELETE SET NULL,
  cliente_nome TEXT,
  cliente_documento TEXT,
  cliente_email TEXT,
  cliente_telefone TEXT,
  marca TEXT NOT NULL DEFAULT 'destrava'
    CHECK (marca IN ('destrava','permupay')),
  titulo TEXT NOT NULL DEFAULT 'Orçamento de Serviços',
  descricao TEXT,
  conteudo TEXT NOT NULL DEFAULT '',
  valor_total NUMERIC(14,2) DEFAULT 0,
  validade_dias INTEGER DEFAULT 7,
  validade_ate DATE,
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','finalizado','enviado','cancelado')),
  assinaturas JSONB NOT NULL DEFAULT '[]'::jsonb,
  anexos_count INTEGER NOT NULL DEFAULT 0,
  pdf_path TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_por UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalizado_em TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.orcamentos_timbrados_anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID NOT NULL REFERENCES public.orcamentos_timbrados(id) ON DELETE CASCADE,
  tipo TEXT DEFAULT 'anexo',
  descricao TEXT,
  nome_original TEXT NOT NULL,
  mime_type TEXT,
  tamanho_bytes BIGINT,
  storage_path TEXT NOT NULL,
  url TEXT,
  hash_sha256 TEXT,
  criado_por UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orcamentos_timbrados_status ON public.orcamentos_timbrados(status);
CREATE INDEX IF NOT EXISTS idx_orcamentos_timbrados_empresa ON public.orcamentos_timbrados(empresa_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_timbrados_cliente_pf ON public.orcamentos_timbrados(cliente_pf_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_timbrados_criado_em ON public.orcamentos_timbrados(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_orcamentos_timbrados_anexos_orcamento ON public.orcamentos_timbrados_anexos(orcamento_id);

CREATE OR REPLACE FUNCTION public.atualizar_timestamp_orcamentos_timbrados()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orcamentos_timbrados_atualizado_em ON public.orcamentos_timbrados;

CREATE TRIGGER trg_orcamentos_timbrados_atualizado_em
BEFORE UPDATE ON public.orcamentos_timbrados
FOR EACH ROW
EXECUTE FUNCTION public.atualizar_timestamp_orcamentos_timbrados();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamentos_timbrados TO destravadb;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamentos_timbrados_anexos TO destravadb;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO destravadb;

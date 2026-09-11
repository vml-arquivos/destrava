-- 037_simulacoes_pdf_reimpressao.sql
-- Armazena PDFs gerados nas simulações para reimpressão futura.
-- Seguro para produção: não remove nem altera dados existentes.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.simulacao_pdfs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulacao_id   UUID NOT NULL REFERENCES public.simulacoes_colaborador(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  nome_arquivo   TEXT NOT NULL,
  mime_type      TEXT NOT NULL DEFAULT 'application/pdf',
  pdf_base64     TEXT NOT NULL,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_simulacao_pdfs_simulacao_id
  ON public.simulacao_pdfs(simulacao_id);

CREATE INDEX IF NOT EXISTS idx_simulacao_pdfs_colaborador_id
  ON public.simulacao_pdfs(colaborador_id) WHERE colaborador_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_simulacao_pdfs_criado_em
  ON public.simulacao_pdfs(criado_em DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulacao_pdfs TO destravadb;

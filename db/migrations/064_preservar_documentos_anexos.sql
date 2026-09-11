-- 064_preservar_documentos_anexos.sql
-- Regra de segurança: anexos/documentos não devem ser apagados fisicamente.
-- Esta migration permite arquivamento lógico dos anexos de orçamentos.

ALTER TABLE public.orcamentos_timbrados_anexos
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ativo';

ALTER TABLE public.orcamentos_timbrados_anexos
  ADD COLUMN IF NOT EXISTS arquivado_em TIMESTAMPTZ;

ALTER TABLE public.orcamentos_timbrados_anexos
  ADD COLUMN IF NOT EXISTS arquivado_por UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL;

UPDATE public.orcamentos_timbrados_anexos
   SET status = 'ativo'
 WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_orcamentos_timbrados_anexos_status
  ON public.orcamentos_timbrados_anexos(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamentos_timbrados_anexos TO destravadb;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO destravadb;

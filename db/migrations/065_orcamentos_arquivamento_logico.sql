-- 065_orcamentos_arquivamento_logico.sql
-- Regra inquebrável: orçamentos e anexos devem ser arquivados, nunca apagados fisicamente.

ALTER TABLE public.orcamentos_timbrados
  ADD COLUMN IF NOT EXISTS arquivado_em TIMESTAMPTZ;

ALTER TABLE public.orcamentos_timbrados
  ADD COLUMN IF NOT EXISTS arquivado_por UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orcamentos_timbrados_arquivado_em
  ON public.orcamentos_timbrados(arquivado_em);

-- Garante as colunas de arquivamento lógico dos anexos mesmo que a migration 064
-- ainda não tenha sido executada no ambiente.
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamentos_timbrados TO destravadb;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamentos_timbrados_anexos TO destravadb;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO destravadb;

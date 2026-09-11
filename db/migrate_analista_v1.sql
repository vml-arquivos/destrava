-- ============================================================
-- migrate_analista_v1.sql
-- Adiciona analista_id na tabela empresas
-- (captador_id e telefone em colaboradores já foram adicionados
--  pelo migrate_captadores_v1.sql)
-- IDEMPOTENTE — pode ser executado múltiplas vezes sem erro
-- ============================================================

BEGIN;

-- 1. Adicionar analista_id em empresas (FK para colaboradores)
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS analista_id UUID
    REFERENCES public.colaboradores(id)
    ON DELETE SET NULL;

-- 2. Índice para filtros por analista
CREATE INDEX IF NOT EXISTS idx_empresas_analista_id
  ON public.empresas(analista_id)
  WHERE analista_id IS NOT NULL;

-- 3. Garantir que a coluna telefone existe em colaboradores
--    (caso migrate_captadores_v1 ainda não tenha sido executado)
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS telefone TEXT;

CREATE INDEX IF NOT EXISTS idx_colaboradores_telefone
  ON public.colaboradores(telefone)
  WHERE telefone IS NOT NULL;

-- 4. Garantir que captador_id existe em empresas
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS captador_id UUID
    REFERENCES public.colaboradores(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_empresas_captador_id
  ON public.empresas(captador_id)
  WHERE captador_id IS NOT NULL;

COMMIT;

-- Verificação final
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('empresas', 'colaboradores')
  AND column_name IN ('analista_id', 'captador_id', 'telefone')
ORDER BY table_name, column_name;

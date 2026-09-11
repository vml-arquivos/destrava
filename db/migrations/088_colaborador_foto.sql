-- MIGRAÇÃO 088: foto opcional do colaborador para ficha cadastral/PDF
-- A coluna guarda somente o caminho relativo do arquivo persistente; nunca bytes.
ALTER TABLE IF EXISTS public.colaboradores
  ADD COLUMN IF NOT EXISTS foto_url TEXT;

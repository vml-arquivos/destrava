-- Onda 1: links seguros de cadastro para parceiros e captadores.
-- O cadastro cria acesso inativo e exige aprovação posterior; não há sessão automática.

CREATE TABLE IF NOT EXISTS public.convites_cadastro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('parceiro', 'captador')),
  cargo TEXT NOT NULL DEFAULT 'Captador Externo',
  criado_por UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  usado_por UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  revogado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_convites_cadastro_expira
  ON public.convites_cadastro (expira_em);
CREATE INDEX IF NOT EXISTS idx_convites_cadastro_usado_por
  ON public.convites_cadastro (usado_por)
  WHERE usado_por IS NOT NULL;

ALTER TABLE IF EXISTS public.colaboradores
  ADD COLUMN IF NOT EXISTS convite_cadastro_id UUID;
ALTER TABLE IF EXISTS public.parceiros_comerciais
  ADD COLUMN IF NOT EXISTS colaborador_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_parceiros_colaborador_id
  ON public.parceiros_comerciais (colaborador_id)
  WHERE colaborador_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_colaboradores_convite_cadastro
  ON public.colaboradores (convite_cadastro_id)
  WHERE convite_cadastro_id IS NOT NULL;

-- 033_fix_socios_empresa_bulk.sql
-- Correção cirúrgica para erro 500 em POST /api/empresas/:id/socios/bulk
-- Garante tabela/base mínima usada pelo backend sem quebrar dados existentes.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.socios_empresa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf_cnpj TEXT,
  qualificacao_socio TEXT,
  percentual_capital NUMERIC(5,2),
  representante_legal BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.socios_empresa
  ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS qualificacao_socio TEXT,
  ADD COLUMN IF NOT EXISTS percentual_capital NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS representante_legal BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_socios_empresa_empresa_id
  ON public.socios_empresa(empresa_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_socios_empresa_updated_at') THEN
    CREATE TRIGGER trg_socios_empresa_updated_at
      BEFORE UPDATE ON public.socios_empresa
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

COMMIT;

-- Migration 048 — Unificação de Clientes e origem de cadastro PF
-- Sistema Destrava Crédito
-- Prepara clientes_pf para aparecerem na tela unificada de Clientes com origem, canal e usuário cadastrador.

BEGIN;

ALTER TABLE clientes_pf
  ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'painel_interno',
  ADD COLUMN IF NOT EXISTS canal_origem TEXT NULL,
  ADD COLUMN IF NOT EXISTS fonte_cadastro TEXT DEFAULT 'Cliente PF cadastrado manualmente',
  ADD COLUMN IF NOT EXISTS cadastrado_por UUID NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'colaboradores'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'clientes_pf_cadastrado_por_fkey'
    ) THEN
      ALTER TABLE clientes_pf
        ADD CONSTRAINT clientes_pf_cadastrado_por_fkey
        FOREIGN KEY (cadastrado_por) REFERENCES colaboradores(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

UPDATE clientes_pf
SET origem = COALESCE(NULLIF(origem, ''), 'painel_interno'),
    fonte_cadastro = COALESCE(NULLIF(fonte_cadastro, ''), 'Cliente PF cadastrado manualmente')
WHERE origem IS NULL OR origem = '' OR fonte_cadastro IS NULL OR fonte_cadastro = '';

CREATE INDEX IF NOT EXISTS idx_clientes_pf_origem ON clientes_pf (origem);
CREATE INDEX IF NOT EXISTS idx_clientes_pf_cadastrado_por ON clientes_pf (cadastrado_por);
CREATE INDEX IF NOT EXISTS idx_clientes_pf_created_at ON clientes_pf (created_at DESC);

COMMIT;

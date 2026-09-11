-- 054_acompanhamento_sincronizar_dados_empresa.sql
-- Garante que o módulo de Acompanhamento Bancário consiga usar os mesmos
-- dados cadastrais já sincronizados no cadastro de Empresas.
-- Idempotente e seguro para produção: não apaga nem reseta dados.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS public.acompanhamentos_bancarios
  ADD COLUMN IF NOT EXISTS empresa_id UUID NULL,
  ADD COLUMN IF NOT EXISTS lead_id UUID NULL,
  ADD COLUMN IF NOT EXISTS cnpj TEXT,
  ADD COLUMN IF NOT EXISTS telefone_cliente TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_cliente TEXT,
  ADD COLUMN IF NOT EXISTS email_cliente TEXT,
  ADD COLUMN IF NOT EXISTS gerente_banco TEXT,
  ADD COLUMN IF NOT EXISTS contato_banco TEXT,
  ADD COLUMN IF NOT EXISTS data_abertura_conta DATE,
  ADD COLUMN IF NOT EXISTS valor_credito_pretendido NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS linha_credito_pretendida TEXT,
  ADD COLUMN IF NOT EXISTS faturamento_anual NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS media_mensal NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS margem_seguranca_30 NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS percentual_operacional NUMERIC(8,2) DEFAULT 30,
  ADD COLUMN IF NOT EXISTS ultimo_update_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'acompanhamentos_bancarios_empresa_id_fkey'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'empresas'
  ) THEN
    ALTER TABLE public.acompanhamentos_bancarios
      ADD CONSTRAINT acompanhamentos_bancarios_empresa_id_fkey
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_acompanhamentos_bancarios_empresa_id
  ON public.acompanhamentos_bancarios(empresa_id)
  WHERE empresa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acompanhamentos_bancarios_cnpj_digits
  ON public.acompanhamentos_bancarios((regexp_replace(COALESCE(cnpj, ''), '[^0-9]', '', 'g')))
  WHERE cnpj IS NOT NULL;

COMMIT;

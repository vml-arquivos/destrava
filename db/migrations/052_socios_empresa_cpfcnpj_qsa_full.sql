BEGIN;

ALTER TABLE public.socios_empresa
  ADD COLUMN IF NOT EXISTS cpfcnpj_consultado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cpfcnpj_status TEXT,
  ADD COLUMN IF NOT EXISTS cpfcnpj_fonte TEXT,
  ADD COLUMN IF NOT EXISTS cpfcnpj_payload_resumo JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_socios_empresa_cpfcnpj_status
  ON public.socios_empresa(cpfcnpj_status);

CREATE INDEX IF NOT EXISTS idx_socios_empresa_cpfcnpj_consultado_at
  ON public.socios_empresa(cpfcnpj_consultado_at);

CREATE INDEX IF NOT EXISTS idx_socios_empresa_cpf_completo_manual_digits
  ON public.socios_empresa ((regexp_replace(COALESCE(cpf_completo_manual, ''), '\D', '', 'g')));

COMMIT;

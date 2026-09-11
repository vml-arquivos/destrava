CREATE TABLE IF NOT EXISTS public.prestadores_servico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_pessoa TEXT NOT NULL DEFAULT 'pj',
  razao_social TEXT,
  nome_fantasia TEXT,
  nome TEXT,
  cnpj TEXT,
  cpf TEXT,
  email TEXT,
  telefone TEXT,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  representante_nome TEXT,
  representante_cpf TEXT,
  representante_cargo TEXT,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.contratos_gerados
  ADD COLUMN IF NOT EXISTS contratada_id UUID
  REFERENCES public.prestadores_servico(id) ON DELETE SET NULL;

ALTER TABLE public.contratos_gerados
  ADD COLUMN IF NOT EXISTS contratada_snapshot JSONB;

ALTER TABLE public.contratos_gerados
  ADD COLUMN IF NOT EXISTS responsavel_contrato_id UUID
  REFERENCES public.colaboradores(id) ON DELETE SET NULL;

ALTER TABLE public.contratos_gerados
  ADD COLUMN IF NOT EXISTS responsavel_contrato_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_prestadores_servico_ativo
  ON public.prestadores_servico(ativo);

CREATE INDEX IF NOT EXISTS idx_contratos_contratada
  ON public.contratos_gerados(contratada_id);

CREATE INDEX IF NOT EXISTS idx_contratos_responsavel_contrato
  ON public.contratos_gerados(responsavel_contrato_id);

INSERT INTO public.prestadores_servico (
  tipo_pessoa,
  razao_social,
  nome_fantasia,
  cnpj,
  endereco,
  cidade,
  uf,
  cep,
  representante_nome,
  representante_cargo,
  ativo
)
SELECT
  'pj',
  'DESTRAVA CREDITO LTDA',
  'Destrava Crédito',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.prestadores_servico
  WHERE razao_social = 'DESTRAVA CREDITO LTDA'
);

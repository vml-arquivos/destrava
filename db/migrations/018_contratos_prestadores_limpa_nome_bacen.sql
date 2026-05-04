-- ============================================================
-- MIGRATION 018: Contratadas/Prestadoras para Limpa Nome e Limpa BACEN
-- Data: 2026-05-04
-- Objetivo:
--   1) Criar cadastro de empresas/PFs prestadoras de serviço que podem aparecer
--      como CONTRATADA nos contratos de Limpa Nome e Limpa BACEN.
--   2) Guardar snapshot da contratada e do responsável operacional no contrato.
--   3) Manter Destrava Crédito como contratada padrão já cadastrada.
-- ============================================================
-- Execução sugerida:
--   docker exec -i -u postgres <container_postgres> psql -d postgres < db/migrations/018_contratos_prestadores_limpa_nome_bacen.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.prestadores_servico (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_pessoa           TEXT NOT NULL DEFAULT 'pj'
    CHECK (tipo_pessoa IN ('pj', 'pf')),
  razao_social          TEXT,
  nome_fantasia         TEXT,
  nome                  TEXT,
  cnpj                  TEXT,
  cpf                   TEXT,
  email                 TEXT,
  telefone              TEXT,
  endereco              TEXT,
  cidade                TEXT,
  uf                    CHAR(2),
  cep                   TEXT,
  representante_nome    TEXT,
  representante_cpf     TEXT,
  representante_cargo   TEXT,
  observacoes           TEXT,
  ativo                 BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prestadores_servico_ativo
  ON public.prestadores_servico(ativo);

CREATE INDEX IF NOT EXISTS idx_prestadores_servico_nome
  ON public.prestadores_servico(razao_social, nome);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prestadores_servico_cnpj_unico
  ON public.prestadores_servico ((regexp_replace(COALESCE(cnpj, ''), '\D', '', 'g')))
  WHERE cnpj IS NOT NULL AND cnpj <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_prestadores_servico_cpf_unico
  ON public.prestadores_servico ((regexp_replace(COALESCE(cpf, ''), '\D', '', 'g')))
  WHERE cpf IS NOT NULL AND cpf <> '';

INSERT INTO public.prestadores_servico (
  tipo_pessoa,
  razao_social,
  nome_fantasia,
  cnpj,
  email,
  telefone,
  endereco,
  cidade,
  uf,
  cep,
  representante_nome,
  representante_cpf,
  representante_cargo,
  observacoes,
  ativo
)
SELECT
  'pj',
  'DESTRAVA CREDITO LTDA',
  'Destrava Crédito',
  '35.427.182/0001-66',
  'fernandoelipro@gmail.com',
  NULL,
  'St. D Norte QND 25 LOTE 40 - Taguatinga',
  'Brasília',
  'DF',
  '72120-250',
  'FERNANDO ELI OLIVEIRA MARQUES',
  '718.517.041-91',
  'Sócio Administrador',
  'Contratada padrão migrada dos contratos legados.',
  TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM public.prestadores_servico
  WHERE regexp_replace(COALESCE(cnpj, ''), '\D', '', 'g') = '35427182000166'
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

CREATE INDEX IF NOT EXISTS idx_contratos_contratada
  ON public.contratos_gerados(contratada_id);

CREATE INDEX IF NOT EXISTS idx_contratos_responsavel_contrato
  ON public.contratos_gerados(responsavel_contrato_id);

COMMENT ON TABLE public.prestadores_servico IS
  'Cadastro de empresas ou pessoas físicas que podem aparecer como CONTRATADA/PRESTADORA nos contratos.';

COMMENT ON COLUMN public.contratos_gerados.contratada_id IS
  'Prestador/contratada escolhido para aparecer como CONTRATADA nos contratos Limpa Nome e Limpa BACEN.';

COMMENT ON COLUMN public.contratos_gerados.contratada_snapshot IS
  'Cópia dos dados da contratada no momento da geração do contrato, para preservar histórico.';

COMMENT ON COLUMN public.contratos_gerados.responsavel_contrato_id IS
  'Colaborador responsável operacional pela assessoria/contrato.';

COMMENT ON COLUMN public.contratos_gerados.responsavel_contrato_snapshot IS
  'Cópia dos dados do colaborador responsável no momento da geração do contrato.';

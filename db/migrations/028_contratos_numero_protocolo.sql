-- 028_contratos_numero_protocolo.sql
-- Identificação operacional dos contratos gerados:
-- - número do contrato
-- - protocolo do contrato
-- - código do tipo do contrato
-- - sequencial global

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.contratos_gerados_sequencial_global_seq
  START WITH 1
  INCREMENT BY 1;

ALTER TABLE public.contratos_gerados
  ADD COLUMN IF NOT EXISTS numero_contrato TEXT;

ALTER TABLE public.contratos_gerados
  ADD COLUMN IF NOT EXISTS protocolo_contrato TEXT;

ALTER TABLE public.contratos_gerados
  ADD COLUMN IF NOT EXISTS codigo_tipo_contrato TEXT;

ALTER TABLE public.contratos_gerados
  ADD COLUMN IF NOT EXISTS sequencial_contrato INTEGER;

COMMENT ON COLUMN public.contratos_gerados.numero_contrato IS
  'Número operacional legível do contrato. Exemplo: ASS-2026-000001.';

COMMENT ON COLUMN public.contratos_gerados.protocolo_contrato IS
  'Protocolo único para rastreio do contrato. Exemplo: DC-ASS-20260519-DOC0148-000001.';

COMMENT ON COLUMN public.contratos_gerados.codigo_tipo_contrato IS
  'Código do tipo do contrato: ASS, LNR, SCR, RAT, PAR.';

COMMENT ON COLUMN public.contratos_gerados.sequencial_contrato IS
  'Sequencial global usado na composição do número e protocolo do contrato.';

-- Código operacional por tipo de contrato.
UPDATE public.contratos_gerados
   SET codigo_tipo_contrato = CASE tipo_contrato
     WHEN 'assessoria' THEN 'ASS'
     WHEN 'limpa_nome' THEN 'LNR'
     WHEN 'limpa_bacen' THEN 'SCR'
     WHEN 'rating' THEN 'RAT'
     WHEN 'parceria_comercial' THEN 'PAR'
     ELSE 'CTR'
   END
 WHERE codigo_tipo_contrato IS NULL
    OR btrim(codigo_tipo_contrato) = '';

-- Preenche sequencial para contratos antigos que ainda não possuem identificação.
UPDATE public.contratos_gerados
   SET sequencial_contrato = nextval('public.contratos_gerados_sequencial_global_seq')::integer
 WHERE sequencial_contrato IS NULL;

-- Gera número e protocolo para contratos já existentes.
WITH base AS (
  SELECT
    id,
    COALESCE(codigo_tipo_contrato, 'CTR') AS codigo_tipo_contrato,
    COALESCE(sequencial_contrato, 0) AS sequencial_contrato,
    COALESCE(created_at, NOW()) AS criado_em,
    LPAD(
      RIGHT(
        REGEXP_REPLACE(
          COALESCE(
            payload_snapshot -> 'contratante' ->> 'cnpj',
            payload_snapshot -> 'contratante' ->> 'cpf',
            payload_snapshot -> 'contratante' ->> 'cpf_representante',
            payload_snapshot -> 'representante' ->> 'cpf',
            payload_snapshot -> 'parceiro' ->> 'cpf',
            payload_snapshot -> 'parceiro' ->> 'cnpj',
            '0000'
          ),
          '\D',
          '',
          'g'
        ),
        4
      ),
      4,
      '0'
    ) AS doc_codigo
  FROM public.contratos_gerados
)
UPDATE public.contratos_gerados cg
   SET numero_contrato = COALESCE(
         NULLIF(cg.numero_contrato, ''),
         base.codigo_tipo_contrato || '-' ||
         TO_CHAR(base.criado_em, 'YYYY') || '-' ||
         LPAD(base.sequencial_contrato::text, 6, '0')
       ),
       protocolo_contrato = COALESCE(
         NULLIF(cg.protocolo_contrato, ''),
         'DC-' ||
         base.codigo_tipo_contrato || '-' ||
         TO_CHAR(base.criado_em, 'YYYYMMDD') || '-' ||
         'DOC' || base.doc_codigo || '-' ||
         LPAD(base.sequencial_contrato::text, 6, '0')
       )
  FROM base
 WHERE cg.id = base.id
   AND (
     cg.numero_contrato IS NULL
     OR btrim(cg.numero_contrato) = ''
     OR cg.protocolo_contrato IS NULL
     OR btrim(cg.protocolo_contrato) = ''
   );

-- Garante que o próximo nextval continue depois do maior sequencial já existente.
SELECT setval(
  'public.contratos_gerados_sequencial_global_seq',
  GREATEST((SELECT COALESCE(MAX(sequencial_contrato), 0) FROM public.contratos_gerados), 1),
  true
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contratos_numero_contrato_unique
  ON public.contratos_gerados(numero_contrato)
  WHERE numero_contrato IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contratos_protocolo_contrato_unique
  ON public.contratos_gerados(protocolo_contrato)
  WHERE protocolo_contrato IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contratos_codigo_tipo_contrato
  ON public.contratos_gerados(codigo_tipo_contrato);

COMMIT;

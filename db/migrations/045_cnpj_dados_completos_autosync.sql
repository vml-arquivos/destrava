-- Migration 045 — CNPJ completo, capital social correto e sincronização robusta
-- Idempotente. Pode ser executada mais de uma vez.

BEGIN;

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS inscricao_estadual TEXT,
  ADD COLUMN IF NOT EXISTS inscricao_municipal TEXT,
  ADD COLUMN IF NOT EXISTS natureza_juridica TEXT,
  ADD COLUMN IF NOT EXISTS capital_social NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS cnae_principal TEXT,
  ADD COLUMN IF NOT EXISTS cnaes_secundarios TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS data_abertura DATE,
  ADD COLUMN IF NOT EXISTS situacao_cadastral TEXT,
  ADD COLUMN IF NOT EXISTS data_situacao_cadastral DATE,
  ADD COLUMN IF NOT EXISTS motivo_situacao_cadastral TEXT,
  ADD COLUMN IF NOT EXISTS matriz_filial TEXT,
  ADD COLUMN IF NOT EXISTS regime_tributario TEXT,
  ADD COLUMN IF NOT EXISTS telefone_2 TEXT,
  ADD COLUMN IF NOT EXISTS dados_extra_receita JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ultima_sincronizacao_receita TIMESTAMPTZ;

-- Corrige capitais sociais inflados por bug de parsing anterior.
-- Ex.: 50000.00 lido como 5000000.00. Usa o payload bruto/normalizado salvo quando existir.
WITH fonte AS (
  SELECT
    id,
    COALESCE(
      NULLIF(dados_extra_receita #>> '{payload_normalizado,capital_social}', ''),
      NULLIF(dados_extra_receita #>> '{dados_fontes,brasilapi,capital_social}', ''),
      NULLIF(dados_extra_receita #>> '{dados_fontes,cnpja_open,company,equity}', ''),
      NULLIF(dados_extra_receita #>> '{dados_fontes,cnpja_open,equity}', ''),
      NULLIF(dados_extra_receita #>> '{dados_fontes,opencnpj,capital_social}', '')
    ) AS capital_texto
  FROM public.empresas
  WHERE dados_extra_receita IS NOT NULL
), normalizado AS (
  SELECT
    id,
    CASE
      WHEN capital_texto ~ '^[0-9]+([.][0-9]{1,2})?$' THEN capital_texto::numeric
      WHEN capital_texto ~ '^[0-9]+(,[0-9]{1,2})?$' THEN replace(capital_texto, ',', '.')::numeric
      WHEN capital_texto IS NOT NULL THEN NULLIF(regexp_replace(replace(replace(capital_texto, '.', ''), ',', '.'), '[^0-9.-]', '', 'g'), '')::numeric
      ELSE NULL
    END AS capital_correto
  FROM fonte
)
UPDATE public.empresas e
SET capital_social = n.capital_correto
FROM normalizado n
WHERE e.id = n.id
  AND n.capital_correto IS NOT NULL
  AND (
    e.capital_social IS NULL
    OR e.capital_social = 0
    OR e.capital_social >= n.capital_correto * 10
  );

CREATE INDEX IF NOT EXISTS idx_empresas_cnpj_digits
ON public.empresas (regexp_replace(COALESCE(cnpj, ''), '[^0-9]', '', 'g'));

CREATE INDEX IF NOT EXISTS idx_empresas_ultima_sincronizacao_receita
ON public.empresas (ultima_sincronizacao_receita DESC);

COMMIT;

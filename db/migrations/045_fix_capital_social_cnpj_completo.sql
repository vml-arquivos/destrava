-- 045_fix_capital_social_cnpj_completo.sql
-- Corrige capital_social inflado por parsing de NUMERIC vindo como string decimal
-- Ex.: "50000.00" não pode virar 5.000.000,00.
-- Também garante colunas usadas pela página completa de Empresas/CNPJ.

BEGIN;

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS natureza_juridica TEXT,
  ADD COLUMN IF NOT EXISTS capital_social NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS cnae_principal TEXT,
  ADD COLUMN IF NOT EXISTS cnaes_secundarios TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS data_abertura DATE,
  ADD COLUMN IF NOT EXISTS situacao_cadastral TEXT,
  ADD COLUMN IF NOT EXISTS matriz_filial TEXT,
  ADD COLUMN IF NOT EXISTS ultima_sincronizacao_receita TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_situacao_cadastral DATE,
  ADD COLUMN IF NOT EXISTS motivo_situacao_cadastral TEXT,
  ADD COLUMN IF NOT EXISTS regime_tributario TEXT,
  ADD COLUMN IF NOT EXISTS telefone_2 TEXT,
  ADD COLUMN IF NOT EXISTS dados_extra_receita JSONB DEFAULT '{}'::jsonb;

-- Corrige empresas cujo JSON da Receita já possui capital_social correto.
-- Atualiza somente quando o valor gravado está claramente inflado em 100x
-- ou quando a coluna está vazia.
WITH fonte AS (
  SELECT
    id,
    NULLIF(regexp_replace(dados_extra_receita->>'capital_social', '[^0-9.,-]', '', 'g'), '') AS capital_raw
  FROM public.empresas
  WHERE dados_extra_receita IS NOT NULL
    AND dados_extra_receita <> '{}'::jsonb
    AND dados_extra_receita ? 'capital_social'
), normalizada AS (
  SELECT
    id,
    CASE
      WHEN capital_raw IS NULL THEN NULL
      WHEN capital_raw LIKE '%,%' THEN replace(replace(capital_raw, '.', ''), ',', '.')::numeric
      WHEN capital_raw ~ '^[-]?[0-9]+\.[0-9]{1,2}$' THEN capital_raw::numeric
      WHEN capital_raw ~ '^[-]?[0-9]+$' THEN capital_raw::numeric
      ELSE NULL
    END AS capital_receita
  FROM fonte
)
UPDATE public.empresas e
SET capital_social = n.capital_receita
FROM normalizada n
WHERE e.id = n.id
  AND n.capital_receita IS NOT NULL
  AND (
    e.capital_social IS NULL
    OR e.capital_social = n.capital_receita * 100
    OR e.capital_social > n.capital_receita * 10
  );

CREATE INDEX IF NOT EXISTS idx_empresas_capital_social ON public.empresas(capital_social) WHERE capital_social IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_empresas_cnae_principal ON public.empresas(cnae_principal) WHERE cnae_principal IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_empresas_dados_extra_receita_gin ON public.empresas USING GIN (dados_extra_receita);

COMMIT;

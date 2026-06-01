-- Migration 046 SAFE — Cadastros únicos, incompletos e bloqueio operacional
-- Sistema Destrava Crédito
-- Execute antes do deploy da versão que usa a nova regra de cadastros.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- EMPRESAS
-- ============================================================
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS cadastro_completo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cadastro_status TEXT DEFAULT 'incompleto',
  ADD COLUMN IF NOT EXISTS cadastro_pendencias TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS bloqueado_operacional BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS duplicado_de UUID NULL,
  ADD COLUMN IF NOT EXISTS arquivado_por_duplicidade BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS saneado_em TIMESTAMPTZ NULL;

UPDATE empresas
SET cadastro_pendencias = array_remove(ARRAY[
      CASE WHEN length(regexp_replace(COALESCE(cnpj,''), '\D', '', 'g')) <> 14 THEN 'CNPJ obrigatório/ inválido' END,
      CASE WHEN trim(COALESCE(razao_social,'')) = '' THEN 'Razão social obrigatória' END,
      CASE WHEN trim(COALESCE(cnae_principal,'')) = '' THEN 'CNAE principal não sincronizado' END,
      CASE WHEN trim(COALESCE(natureza_juridica,'')) = '' THEN 'Natureza jurídica não sincronizada' END,
      CASE WHEN capital_social IS NULL OR capital_social <= 0 THEN 'Capital social não sincronizado' END,
      CASE WHEN trim(COALESCE(situacao_cadastral,'')) = '' THEN 'Situação cadastral não sincronizada' END
    ]::TEXT[], NULL),
    cadastro_completo = (
      length(regexp_replace(COALESCE(cnpj,''), '\D', '', 'g')) = 14
      AND trim(COALESCE(razao_social,'')) <> ''
      AND trim(COALESCE(cnae_principal,'')) <> ''
      AND trim(COALESCE(natureza_juridica,'')) <> ''
      AND capital_social IS NOT NULL AND capital_social > 0
      AND trim(COALESCE(situacao_cadastral,'')) <> ''
    ),
    cadastro_status = CASE WHEN (
      length(regexp_replace(COALESCE(cnpj,''), '\D', '', 'g')) = 14
      AND trim(COALESCE(razao_social,'')) <> ''
      AND trim(COALESCE(cnae_principal,'')) <> ''
      AND trim(COALESCE(natureza_juridica,'')) <> ''
      AND capital_social IS NOT NULL AND capital_social > 0
      AND trim(COALESCE(situacao_cadastral,'')) <> ''
    ) THEN 'completo' ELSE 'incompleto' END,
    bloqueado_operacional = NOT (
      length(regexp_replace(COALESCE(cnpj,''), '\D', '', 'g')) = 14
      AND trim(COALESCE(razao_social,'')) <> ''
      AND trim(COALESCE(cnae_principal,'')) <> ''
      AND trim(COALESCE(natureza_juridica,'')) <> ''
      AND capital_social IS NOT NULL AND capital_social > 0
      AND trim(COALESCE(situacao_cadastral,'')) <> ''
    ),
    saneado_em = CASE WHEN (
      length(regexp_replace(COALESCE(cnpj,''), '\D', '', 'g')) = 14
      AND trim(COALESCE(razao_social,'')) <> ''
      AND trim(COALESCE(cnae_principal,'')) <> ''
      AND trim(COALESCE(natureza_juridica,'')) <> ''
      AND capital_social IS NOT NULL AND capital_social > 0
      AND trim(COALESCE(situacao_cadastral,'')) <> ''
    ) THEN COALESCE(saneado_em, NOW()) ELSE saneado_em END;

DROP TABLE IF EXISTS tmp_empresas_duplicadas_046;
CREATE TEMP TABLE tmp_empresas_duplicadas_046 AS
WITH ranked AS (
  SELECT id,
         FIRST_VALUE(id) OVER (
           PARTITION BY regexp_replace(COALESCE(cnpj,''), '\D', '', 'g')
           ORDER BY COALESCE(ultima_sincronizacao_receita, updated_at, created_at) DESC NULLS LAST, created_at ASC NULLS LAST, id
         ) AS master_id,
         ROW_NUMBER() OVER (
           PARTITION BY regexp_replace(COALESCE(cnpj,''), '\D', '', 'g')
           ORDER BY COALESCE(ultima_sincronizacao_receita, updated_at, created_at) DESC NULLS LAST, created_at ASC NULLS LAST, id
         ) AS rn
    FROM empresas
   WHERE length(regexp_replace(COALESCE(cnpj,''), '\D', '', 'g')) = 14
)
SELECT id AS duplicado_id, master_id
FROM ranked
WHERE rn > 1;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'empresa_id'
      AND table_name IN ('leads','triagem_leads','simulacoes_colaborador','contratos_gerados','contratos','simulacoes')
  LOOP
    EXECUTE format(
      'UPDATE %I t SET empresa_id = d.master_id FROM tmp_empresas_duplicadas_046 d WHERE t.empresa_id = d.duplicado_id',
      r.table_name
    );
  END LOOP;
END $$;

UPDATE empresas e
SET arquivado_por_duplicidade = true,
    duplicado_de = d.master_id,
    bloqueado_operacional = true,
    cadastro_completo = false,
    cadastro_status = 'duplicado',
    cadastro_pendencias = ARRAY['Cadastro duplicado arquivado. Usar cadastro principal: ' || d.master_id::text]
FROM tmp_empresas_duplicadas_046 d
WHERE e.id = d.duplicado_id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_empresas_cnpj_unico_ativo
ON empresas ((regexp_replace(COALESCE(cnpj,''), '\D', '', 'g')))
WHERE length(regexp_replace(COALESCE(cnpj,''), '\D', '', 'g')) = 14
  AND COALESCE(arquivado_por_duplicidade, false) = false;

CREATE INDEX IF NOT EXISTS idx_empresas_cadastro_status ON empresas (cadastro_status);
CREATE INDEX IF NOT EXISTS idx_empresas_cadastro_completo ON empresas (cadastro_completo, bloqueado_operacional);
CREATE INDEX IF NOT EXISTS idx_empresas_duplicado_de ON empresas (duplicado_de);

-- ============================================================
-- CLIENTES PF
-- ============================================================
DO $$
BEGIN
  IF to_regclass('public.clientes_pf') IS NOT NULL THEN
    ALTER TABLE clientes_pf
      ADD COLUMN IF NOT EXISTS cadastro_completo BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS cadastro_status TEXT DEFAULT 'incompleto',
      ADD COLUMN IF NOT EXISTS cadastro_pendencias TEXT[] DEFAULT ARRAY[]::TEXT[],
      ADD COLUMN IF NOT EXISTS bloqueado_operacional BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS duplicado_de UUID NULL,
      ADD COLUMN IF NOT EXISTS arquivado_por_duplicidade BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS saneado_em TIMESTAMPTZ NULL;

    UPDATE clientes_pf
    SET cadastro_pendencias = array_remove(ARRAY[
          CASE WHEN length(regexp_replace(COALESCE(cpf,''), '\D', '', 'g')) <> 11 THEN 'CPF obrigatório/ inválido' END,
          CASE WHEN trim(COALESCE(nome,'')) = '' THEN 'Nome obrigatório' END
        ]::TEXT[], NULL),
        cadastro_completo = (length(regexp_replace(COALESCE(cpf,''), '\D', '', 'g')) = 11 AND trim(COALESCE(nome,'')) <> ''),
        cadastro_status = CASE WHEN (length(regexp_replace(COALESCE(cpf,''), '\D', '', 'g')) = 11 AND trim(COALESCE(nome,'')) <> '') THEN 'completo' ELSE 'incompleto' END,
        bloqueado_operacional = NOT (length(regexp_replace(COALESCE(cpf,''), '\D', '', 'g')) = 11 AND trim(COALESCE(nome,'')) <> ''),
        saneado_em = CASE WHEN (length(regexp_replace(COALESCE(cpf,''), '\D', '', 'g')) = 11 AND trim(COALESCE(nome,'')) <> '') THEN COALESCE(saneado_em, NOW()) ELSE saneado_em END;

    DROP TABLE IF EXISTS tmp_clientes_pf_duplicados_046;
    CREATE TEMP TABLE tmp_clientes_pf_duplicados_046 AS
    WITH ranked AS (
      SELECT id,
             FIRST_VALUE(id) OVER (PARTITION BY regexp_replace(COALESCE(cpf,''), '\D', '', 'g') ORDER BY updated_at DESC NULLS LAST, created_at ASC NULLS LAST, id) AS master_id,
             ROW_NUMBER() OVER (PARTITION BY regexp_replace(COALESCE(cpf,''), '\D', '', 'g') ORDER BY updated_at DESC NULLS LAST, created_at ASC NULLS LAST, id) AS rn
      FROM clientes_pf
      WHERE length(regexp_replace(COALESCE(cpf,''), '\D', '', 'g')) = 11
    )
    SELECT id AS duplicado_id, master_id
    FROM ranked
    WHERE rn > 1;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contratos_gerados' AND column_name='cliente_pf_id') THEN
      UPDATE contratos_gerados c SET cliente_pf_id = d.master_id
      FROM tmp_clientes_pf_duplicados_046 d
      WHERE c.cliente_pf_id = d.duplicado_id;
    END IF;

    UPDATE clientes_pf c
    SET arquivado_por_duplicidade = true,
        duplicado_de = d.master_id,
        ativo = false,
        bloqueado_operacional = true,
        cadastro_completo = false,
        cadastro_status = 'duplicado',
        cadastro_pendencias = ARRAY['Cadastro duplicado arquivado. Usar cadastro principal: ' || d.master_id::text]
    FROM tmp_clientes_pf_duplicados_046 d
    WHERE c.id = d.duplicado_id;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_pf_cpf_unico_ativo
    ON clientes_pf ((regexp_replace(COALESCE(cpf,''), '\D', '', 'g')))
    WHERE length(regexp_replace(COALESCE(cpf,''), '\D', '', 'g')) = 11
      AND COALESCE(arquivado_por_duplicidade, false) = false;

    CREATE INDEX IF NOT EXISTS idx_clientes_pf_cadastro_status ON clientes_pf (cadastro_status);
    CREATE INDEX IF NOT EXISTS idx_clientes_pf_cadastro_completo ON clientes_pf (cadastro_completo, bloqueado_operacional);
  END IF;
END $$;

-- ============================================================
-- LEADS / CLIENTES CRM
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  IF to_regclass('public.leads') IS NOT NULL THEN
    ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS cadastro_completo BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS cadastro_status TEXT DEFAULT 'incompleto',
      ADD COLUMN IF NOT EXISTS cadastro_pendencias TEXT[] DEFAULT ARRAY[]::TEXT[],
      ADD COLUMN IF NOT EXISTS bloqueado_operacional BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS duplicado_de UUID NULL,
      ADD COLUMN IF NOT EXISTS arquivado_por_duplicidade BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS saneado_em TIMESTAMPTZ NULL;

    UPDATE leads
    SET cadastro_pendencias = array_remove(ARRAY[
          CASE WHEN trim(COALESCE(nome,'')) = '' THEN 'Nome obrigatório' END,
          CASE WHEN COALESCE(tipo_pessoa,'pf') = 'pj' AND length(regexp_replace(COALESCE(cpf_cnpj,''), '\D', '', 'g')) <> 14 THEN 'CNPJ obrigatório/ inválido' END,
          CASE WHEN COALESCE(tipo_pessoa,'pf') <> 'pj' AND length(regexp_replace(COALESCE(cpf_cnpj,''), '\D', '', 'g')) <> 11 THEN 'CPF obrigatório/ inválido' END
        ]::TEXT[], NULL),
        cadastro_completo = (
          trim(COALESCE(nome,'')) <> '' AND (
            (COALESCE(tipo_pessoa,'pf') = 'pj' AND length(regexp_replace(COALESCE(cpf_cnpj,''), '\D', '', 'g')) = 14)
            OR (COALESCE(tipo_pessoa,'pf') <> 'pj' AND length(regexp_replace(COALESCE(cpf_cnpj,''), '\D', '', 'g')) = 11)
          )
        ),
        cadastro_status = CASE WHEN (
          trim(COALESCE(nome,'')) <> '' AND (
            (COALESCE(tipo_pessoa,'pf') = 'pj' AND length(regexp_replace(COALESCE(cpf_cnpj,''), '\D', '', 'g')) = 14)
            OR (COALESCE(tipo_pessoa,'pf') <> 'pj' AND length(regexp_replace(COALESCE(cpf_cnpj,''), '\D', '', 'g')) = 11)
          )
        ) THEN 'completo' ELSE 'incompleto' END,
        bloqueado_operacional = NOT (
          trim(COALESCE(nome,'')) <> '' AND (
            (COALESCE(tipo_pessoa,'pf') = 'pj' AND length(regexp_replace(COALESCE(cpf_cnpj,''), '\D', '', 'g')) = 14)
            OR (COALESCE(tipo_pessoa,'pf') <> 'pj' AND length(regexp_replace(COALESCE(cpf_cnpj,''), '\D', '', 'g')) = 11)
          )
        ),
        saneado_em = CASE WHEN (
          trim(COALESCE(nome,'')) <> '' AND (
            (COALESCE(tipo_pessoa,'pf') = 'pj' AND length(regexp_replace(COALESCE(cpf_cnpj,''), '\D', '', 'g')) = 14)
            OR (COALESCE(tipo_pessoa,'pf') <> 'pj' AND length(regexp_replace(COALESCE(cpf_cnpj,''), '\D', '', 'g')) = 11)
          )
        ) THEN COALESCE(saneado_em, NOW()) ELSE saneado_em END;

    DROP TABLE IF EXISTS tmp_leads_duplicados_046;
    CREATE TEMP TABLE tmp_leads_duplicados_046 AS
    WITH ranked AS (
      SELECT id,
             FIRST_VALUE(id) OVER (PARTITION BY regexp_replace(COALESCE(cpf_cnpj,''), '\D', '', 'g') ORDER BY updated_at DESC NULLS LAST, created_at ASC NULLS LAST, id) AS master_id,
             ROW_NUMBER() OVER (PARTITION BY regexp_replace(COALESCE(cpf_cnpj,''), '\D', '', 'g') ORDER BY updated_at DESC NULLS LAST, created_at ASC NULLS LAST, id) AS rn
      FROM leads
      WHERE length(regexp_replace(COALESCE(cpf_cnpj,''), '\D', '', 'g')) IN (11,14)
    )
    SELECT id AS duplicado_id, master_id
    FROM ranked
    WHERE rn > 1;

    FOR r IN
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'lead_id'
        AND table_name IN ('crm_atividades','contratos_gerados','simulacoes_colaborador','triagem_leads')
    LOOP
      EXECUTE format(
        'UPDATE %I t SET lead_id = d.master_id FROM tmp_leads_duplicados_046 d WHERE t.lead_id = d.duplicado_id',
        r.table_name
      );
    END LOOP;

    UPDATE leads l
    SET arquivado_por_duplicidade = true,
        duplicado_de = d.master_id,
        bloqueado_operacional = true,
        cadastro_completo = false,
        cadastro_status = 'duplicado',
        cadastro_pendencias = ARRAY['Cadastro duplicado arquivado. Usar cadastro principal: ' || d.master_id::text]
    FROM tmp_leads_duplicados_046 d
    WHERE l.id = d.duplicado_id;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_leads_documento_unico_ativo
    ON leads ((regexp_replace(COALESCE(cpf_cnpj,''), '\D', '', 'g')))
    WHERE length(regexp_replace(COALESCE(cpf_cnpj,''), '\D', '', 'g')) IN (11,14)
      AND COALESCE(arquivado_por_duplicidade, false) = false;

    CREATE INDEX IF NOT EXISTS idx_leads_cadastro_status ON leads (cadastro_status);
    CREATE INDEX IF NOT EXISTS idx_leads_cadastro_completo ON leads (cadastro_completo, bloqueado_operacional);
  END IF;
END $$;

COMMIT;

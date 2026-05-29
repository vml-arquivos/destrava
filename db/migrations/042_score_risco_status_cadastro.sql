-- ============================================================
-- Migration 042 — Score manual, classificação de risco e
--                 status_cadastro em leads e empresas
-- Autor : Manus AI
-- Data  : 2026-05-29
-- ============================================================
-- INSTRUÇÕES DE EXECUÇÃO:
--   docker exec <container_postgres> psql -U destravadb -d postgres -f /tmp/042.sql
-- ============================================================

BEGIN;

-- ─── 1. Tabela leads ─────────────────────────────────────────────────────────

-- score_manual: pontuação definida manualmente pelo analista (0-100)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS score_manual INTEGER
    CHECK (score_manual IS NULL OR score_manual BETWEEN 0 AND 100);

-- risco_classificacao: classificação de risco derivada do score efetivo
--   valores: 'critico' | 'alto' | 'medio' | 'baixo' | NULL
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS risco_classificacao VARCHAR(20)
    CHECK (risco_classificacao IS NULL OR
           risco_classificacao IN ('critico', 'alto', 'medio', 'baixo'));

-- status_cadastro: completude do cadastro
--   valores: 'incompleto' | 'basico' | 'completo' | 'verificado'
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS status_cadastro VARCHAR(20)
    DEFAULT 'incompleto'
    CHECK (status_cadastro IN ('incompleto', 'basico', 'completo', 'verificado'));

-- ─── 2. Tabela empresas ──────────────────────────────────────────────────────

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS score_interno INTEGER
    CHECK (score_interno IS NULL OR score_interno BETWEEN 0 AND 100);

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS risco_classificacao VARCHAR(20)
    CHECK (risco_classificacao IS NULL OR
           risco_classificacao IN ('critico', 'alto', 'medio', 'baixo'));

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS status_cadastro VARCHAR(20)
    DEFAULT 'incompleto'
    CHECK (status_cadastro IN ('incompleto', 'basico', 'completo', 'verificado'));

-- ─── 3. Índices para consultas rápidas ───────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_leads_risco_classificacao
  ON leads (risco_classificacao)
  WHERE risco_classificacao IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_status_cadastro
  ON leads (status_cadastro);

CREATE INDEX IF NOT EXISTS idx_leads_score_manual
  ON leads (score_manual)
  WHERE score_manual IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_empresas_risco_classificacao
  ON empresas (risco_classificacao)
  WHERE risco_classificacao IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_empresas_score_interno
  ON empresas (score_interno)
  WHERE score_interno IS NOT NULL;

-- ─── 4. Função para calcular status_cadastro de leads ────────────────────────
-- Recalcula automaticamente ao inserir ou atualizar um lead.
-- Critérios:
--   incompleto : nome ou telefone ausente
--   basico     : nome + telefone presentes
--   completo   : basico + email + (empresa ou cpf_cnpj)
--   verificado : completo + cpf_cnpj validado (não nulo) + email presente

CREATE OR REPLACE FUNCTION fn_calcular_status_cadastro_lead()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.status_cadastro :=
    CASE
      WHEN NEW.nome IS NULL OR TRIM(NEW.nome) = ''
        OR NEW.telefone IS NULL OR TRIM(NEW.telefone) = ''
        THEN 'incompleto'
      WHEN NEW.email IS NOT NULL AND TRIM(NEW.email) <> ''
        AND NEW.cpf_cnpj IS NOT NULL AND TRIM(NEW.cpf_cnpj) <> ''
        THEN 'verificado'
      WHEN NEW.email IS NOT NULL AND TRIM(NEW.email) <> ''
        AND (NEW.empresa IS NOT NULL OR NEW.cpf_cnpj IS NOT NULL)
        THEN 'completo'
      ELSE 'basico'
    END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_status_cadastro ON leads;
CREATE TRIGGER trg_leads_status_cadastro
  BEFORE INSERT OR UPDATE OF nome, telefone, email, empresa, cpf_cnpj
  ON leads
  FOR EACH ROW EXECUTE FUNCTION fn_calcular_status_cadastro_lead();

-- ─── 5. Função para calcular risco_classificacao de leads ────────────────────
-- Baseado no score_efetivo = COALESCE(score_ia, score_manual, 0)
-- Crítico: 0-24 | Alto: 25-49 | Médio: 50-74 | Baixo: 75-100

CREATE OR REPLACE FUNCTION fn_calcular_risco_lead()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_score INTEGER;
BEGIN
  v_score := COALESCE(NEW.score_ia, NEW.score_manual, 0);
  NEW.risco_classificacao :=
    CASE
      WHEN v_score >= 75 THEN 'baixo'
      WHEN v_score >= 50 THEN 'medio'
      WHEN v_score >= 25 THEN 'alto'
      ELSE 'critico'
    END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_risco ON leads;
CREATE TRIGGER trg_leads_risco
  BEFORE INSERT OR UPDATE OF score_ia, score_manual
  ON leads
  FOR EACH ROW EXECUTE FUNCTION fn_calcular_risco_lead();

-- ─── 6. Backfill: preencher status_cadastro e risco em registros existentes ──

UPDATE leads SET
  status_cadastro = CASE
    WHEN nome IS NULL OR TRIM(nome) = ''
      OR telefone IS NULL OR TRIM(telefone) = ''
      THEN 'incompleto'
    WHEN email IS NOT NULL AND TRIM(email) <> ''
      AND cpf_cnpj IS NOT NULL AND TRIM(cpf_cnpj) <> ''
      THEN 'verificado'
    WHEN email IS NOT NULL AND TRIM(email) <> ''
      AND (empresa IS NOT NULL OR cpf_cnpj IS NOT NULL)
      THEN 'completo'
    ELSE 'basico'
  END,
  risco_classificacao = CASE
    WHEN COALESCE(score_ia, 0) >= 75 THEN 'baixo'
    WHEN COALESCE(score_ia, 0) >= 50 THEN 'medio'
    WHEN COALESCE(score_ia, 0) >= 25 THEN 'alto'
    ELSE 'critico'
  END
WHERE status_cadastro IS NULL OR risco_classificacao IS NULL;

UPDATE empresas SET
  status_cadastro = CASE
    WHEN razao_social IS NULL OR TRIM(razao_social) = ''
      THEN 'incompleto'
    WHEN email IS NOT NULL AND cnpj IS NOT NULL
      THEN 'verificado'
    WHEN email IS NOT NULL OR cnpj IS NOT NULL
      THEN 'completo'
    ELSE 'basico'
  END
WHERE status_cadastro IS NULL;

COMMIT;

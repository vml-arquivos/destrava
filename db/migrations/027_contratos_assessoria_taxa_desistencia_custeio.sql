-- ============================================================
-- MIGRATION 027: Contrato de Assessoria — taxa de desistência e custeio mensal
-- Data: 2026-05-18
-- ============================================================
-- Idempotente. Alinha o banco ao novo ContratoAssessoria.tsx.
-- ============================================================

ALTER TABLE contratos_gerados
  ADD COLUMN IF NOT EXISTS taxa_desistencia NUMERIC(5, 2) DEFAULT 5.00;

ALTER TABLE contratos_gerados
  ADD COLUMN IF NOT EXISTS custeio_mensal NUMERIC(15, 2) DEFAULT 250.00;

COMMENT ON COLUMN contratos_gerados.taxa_desistencia IS
  'Percentual aplicado sobre o valor de referência em caso de desistência / honorário mínimo do contrato de assessoria.';

COMMENT ON COLUMN contratos_gerados.custeio_mensal IS
  'Valor mensal de custeio quando o Rating Bancário interno ficar abaixo de C no contrato de assessoria.';

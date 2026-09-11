-- ============================================================
-- MIGRATION 025: Compensação e Aderência Financeira
-- Módulo: Acompanhamento Bancário
-- Compatibilidade: idempotente (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- Não remove dados existentes. Não altera colunas existentes.
-- ============================================================

-- ── 1. Adicionar campos de referência e compensação à tabela de atualizações ──
ALTER TABLE acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS faturamento_anual_ref       NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_anual_movimentacao     NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS faturamento_mensal_base     NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_mensal_movimentacao    NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referencia_semanal_base     NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_semanal_movimentacao   NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS semanas_no_mes              INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS acumulado_mensal            NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acumulado_anual             NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_abaixo_semana         NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_excedente_semana      NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_faltante_ref_mensal   NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_disponivel_teto_mensal NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS semanas_restantes_mes       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_base_dinamica          NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_dinamico_proxima       NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_semanal      NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_mensal       NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_anual        NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_aderencia            TEXT DEFAULT 'dentro_da_faixa',
  ADD COLUMN IF NOT EXISTS alerta_aderencia            BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_alerta_aderencia     TEXT,
  ADD COLUMN IF NOT EXISTS diagnostico_tecnico         TEXT;

-- ── 2. Criar tabela de histórico de compensações (se não existir) ──────────────
CREATE TABLE IF NOT EXISTS acompanhamento_compensacoes_historico (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  acompanhamento_id           UUID         NOT NULL REFERENCES acompanhamentos_bancarios(id) ON DELETE CASCADE,
  numero_semana               INTEGER      NOT NULL,
  data_referencia_inicio      DATE,
  data_referencia_fim         DATE,
  entrada_realizada           NUMERIC(15,2) DEFAULT 0,
  faturamento_anual_ref       NUMERIC(15,2) DEFAULT 0,
  teto_anual_movimentacao     NUMERIC(15,2) DEFAULT 0,
  faturamento_mensal_base     NUMERIC(15,2) DEFAULT 0,
  teto_mensal_movimentacao    NUMERIC(15,2) DEFAULT 0,
  referencia_semanal_base     NUMERIC(15,2) DEFAULT 0,
  teto_semanal_movimentacao   NUMERIC(15,2) DEFAULT 0,
  acumulado_mensal            NUMERIC(15,2) DEFAULT 0,
  valor_abaixo_semana         NUMERIC(15,2) DEFAULT 0,
  valor_excedente_semana      NUMERIC(15,2) DEFAULT 0,
  saldo_faltante_ref_mensal   NUMERIC(15,2) DEFAULT 0,
  saldo_disponivel_teto_mensal NUMERIC(15,2) DEFAULT 0,
  meta_base_dinamica          NUMERIC(15,2) DEFAULT 0,
  teto_dinamico_proxima       NUMERIC(15,2) DEFAULT 0,
  percentual_uso_semanal      NUMERIC(8,2) DEFAULT 0,
  percentual_uso_mensal       NUMERIC(8,2) DEFAULT 0,
  percentual_uso_anual        NUMERIC(8,2) DEFAULT 0,
  status_aderencia            TEXT DEFAULT 'dentro_da_faixa',
  alerta_aderencia            BOOLEAN DEFAULT false,
  motivo_alerta               TEXT,
  diagnostico_tecnico         TEXT,
  criado_por                  UUID,
  created_at                  TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(acompanhamento_id, numero_semana)
);

-- ── 3. Índices para a tabela de histórico ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_comp_hist_acomp     ON acompanhamento_compensacoes_historico(acompanhamento_id);
CREATE INDEX IF NOT EXISTS idx_comp_hist_semana    ON acompanhamento_compensacoes_historico(numero_semana);
CREATE INDEX IF NOT EXISTS idx_comp_hist_alerta    ON acompanhamento_compensacoes_historico(alerta_aderencia);
CREATE INDEX IF NOT EXISTS idx_comp_hist_created   ON acompanhamento_compensacoes_historico(created_at DESC);

-- ── 4. Garantir que acompanhamentos_bancarios tenha campo percentual_operacional ─
ALTER TABLE acompanhamentos_bancarios
  ADD COLUMN IF NOT EXISTS percentual_operacional NUMERIC(5,2) DEFAULT 30;

-- ── FIM DA MIGRATION 025 ──────────────────────────────────────────────────────

-- 026_acompanhamento_bancario_dinamico.sql
-- Módulo de Acompanhamento Bancário Dinâmico.
-- Seguro para rodar mais de uma vez: usa IF NOT EXISTS e não remove dados.

ALTER TABLE acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS saldo_faltante_mes NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_dinamica_proxima_semana NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_excedente_mes NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alerta_rating BOOLEAN NOT NULL DEFAULT false;

-- Garante colunas base caso a migration 024 ainda não tenha sido aplicada no ambiente.
ALTER TABLE acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS media_mensal_referencia NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limite_mensal_referencia NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS media_semanal_referencia NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantidade_semanas_mes INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS compensacao_semana_anterior NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entrada_com_compensacao NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS diferenca_referencia_semanal NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compensacao_necessaria_proxima NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_limite_semanal NUMERIC(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_limite_mensal NUMERIC(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_limite_anual NUMERIC(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alerta_aderencia BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_alerta_aderencia TEXT,
  ADD COLUMN IF NOT EXISTS diagnostico_compensacao TEXT,
  ADD COLUMN IF NOT EXISTS status_compensacao TEXT;

CREATE TABLE IF NOT EXISTS acompanhamento_compensacoes_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acompanhamento_id UUID NOT NULL REFERENCES acompanhamentos_bancarios(id) ON DELETE CASCADE,
  atualizacao_id UUID REFERENCES acompanhamento_bancario_atualizacoes(id) ON DELETE SET NULL,
  numero_semana INTEGER NOT NULL,
  data_referencia_inicio DATE,
  data_referencia_fim DATE,
  entrada_realizada NUMERIC(15,2) NOT NULL DEFAULT 0,
  saida_realizada NUMERIC(15,2) NOT NULL DEFAULT 0,
  saldo_semanal NUMERIC(15,2) NOT NULL DEFAULT 0,
  media_mensal_referencia NUMERIC(15,2) NOT NULL DEFAULT 0,
  limite_mensal_referencia NUMERIC(15,2) NOT NULL DEFAULT 0,
  media_semanal_referencia NUMERIC(15,2) NOT NULL DEFAULT 0,
  quantidade_semanas_mes INTEGER NOT NULL DEFAULT 4,
  compensacao_anterior NUMERIC(15,2) NOT NULL DEFAULT 0,
  entrada_com_compensacao NUMERIC(15,2) NOT NULL DEFAULT 0,
  diferenca_referencia_semanal NUMERIC(15,2) NOT NULL DEFAULT 0,
  compensacao_necessaria NUMERIC(15,2) NOT NULL DEFAULT 0,
  saldo_faltante_mes NUMERIC(15,2) NOT NULL DEFAULT 0,
  meta_dinamica_proxima_semana NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_excedente_mes NUMERIC(15,2) NOT NULL DEFAULT 0,
  percentual_limite_semanal NUMERIC(8,2) NOT NULL DEFAULT 0,
  percentual_limite_mensal NUMERIC(8,2) NOT NULL DEFAULT 0,
  percentual_limite_anual NUMERIC(8,2) NOT NULL DEFAULT 0,
  alerta_aderencia BOOLEAN NOT NULL DEFAULT false,
  alerta_rating BOOLEAN NOT NULL DEFAULT false,
  motivo_alerta TEXT,
  status_compensacao TEXT,
  criado_por UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE acompanhamento_compensacoes_historico
  ADD COLUMN IF NOT EXISTS atualizacao_id UUID REFERENCES acompanhamento_bancario_atualizacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS saida_realizada NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_semanal NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_faltante_mes NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_dinamica_proxima_semana NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_excedente_mes NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alerta_rating BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_compensacao TEXT;

CREATE INDEX IF NOT EXISTS idx_acomp_hist_acomp ON acompanhamento_compensacoes_historico(acompanhamento_id);
CREATE INDEX IF NOT EXISTS idx_acomp_hist_semana ON acompanhamento_compensacoes_historico(acompanhamento_id, numero_semana);
CREATE INDEX IF NOT EXISTS idx_acomp_hist_alerta ON acompanhamento_compensacoes_historico(alerta_aderencia, alerta_rating);
CREATE INDEX IF NOT EXISTS idx_acomp_hist_created ON acompanhamento_compensacoes_historico(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname = 'ux_acomp_comp_hist_acomp_semana'
  ) THEN
    CREATE UNIQUE INDEX ux_acomp_comp_hist_acomp_semana
      ON acompanhamento_compensacoes_historico(acompanhamento_id, numero_semana);
  END IF;
END $$;

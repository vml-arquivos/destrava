-- Migration 026 - Acompanhamento Bancário Dinâmico
-- Idempotente e retrocompatível.
-- Aplicar antes do deploy do backend.

ALTER TABLE acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS media_mensal_referencia NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limite_mensal_referencia NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS media_semanal_referencia NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantidade_semanas_mes INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS compensacao_semana_anterior NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entrada_com_compensacao NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS diferenca_referencia_semanal NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compensacao_necessaria_proxima NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_faltante_mes NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_dinamica_proxima_semana NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_excedente_mes NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_limite_semanal NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_limite_mensal NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_limite_anual NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alerta_aderencia BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS alerta_rating BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_alerta_aderencia TEXT,
  ADD COLUMN IF NOT EXISTS diagnostico_compensacao TEXT,
  ADD COLUMN IF NOT EXISTS status_compensacao TEXT DEFAULT 'aguardando_atualizacao';

CREATE TABLE IF NOT EXISTS acompanhamento_compensacoes_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acompanhamento_id UUID NOT NULL REFERENCES acompanhamentos_bancarios(id) ON DELETE CASCADE,
  atualizacao_id UUID REFERENCES acompanhamento_bancario_atualizacoes(id) ON DELETE SET NULL,
  numero_semana INTEGER NOT NULL,
  data_referencia_inicio DATE,
  data_referencia_fim DATE,
  entrada_realizada NUMERIC(15,2) DEFAULT 0,
  saida_realizada NUMERIC(15,2) DEFAULT 0,
  saldo_semanal NUMERIC(15,2) DEFAULT 0,
  media_mensal_referencia NUMERIC(15,2) DEFAULT 0,
  limite_mensal_referencia NUMERIC(15,2) DEFAULT 0,
  media_semanal_referencia NUMERIC(15,2) DEFAULT 0,
  quantidade_semanas_mes INTEGER DEFAULT 4,
  compensacao_anterior NUMERIC(15,2) DEFAULT 0,
  entrada_com_compensacao NUMERIC(15,2) DEFAULT 0,
  diferenca_referencia_semanal NUMERIC(15,2) DEFAULT 0,
  compensacao_necessaria NUMERIC(15,2) DEFAULT 0,
  saldo_faltante_mes NUMERIC(15,2) DEFAULT 0,
  meta_dinamica_proxima_semana NUMERIC(15,2) DEFAULT 0,
  valor_excedente_mes NUMERIC(15,2) DEFAULT 0,
  percentual_limite_semanal NUMERIC(8,2) DEFAULT 0,
  percentual_limite_mensal NUMERIC(8,2) DEFAULT 0,
  percentual_limite_anual NUMERIC(8,2) DEFAULT 0,
  alerta_aderencia BOOLEAN DEFAULT false,
  alerta_rating BOOLEAN DEFAULT false,
  motivo_alerta TEXT,
  status_compensacao TEXT,
  criado_por UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acomp_comp_hist_acompanhamento ON acompanhamento_compensacoes_historico(acompanhamento_id);
CREATE INDEX IF NOT EXISTS idx_acomp_comp_hist_semana ON acompanhamento_compensacoes_historico(acompanhamento_id, numero_semana);
CREATE INDEX IF NOT EXISTS idx_acomp_comp_hist_alerta ON acompanhamento_compensacoes_historico(alerta_aderencia, alerta_rating);
CREATE INDEX IF NOT EXISTS idx_acomp_comp_hist_created ON acompanhamento_compensacoes_historico(created_at DESC);

-- Garante upsert por acompanhamento/semana no histórico.
CREATE UNIQUE INDEX IF NOT EXISTS ux_acomp_comp_hist_acomp_semana
  ON acompanhamento_compensacoes_historico(acompanhamento_id, numero_semana);

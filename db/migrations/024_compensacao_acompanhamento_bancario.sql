-- 024_compensacao_acompanhamento_bancario.sql
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
  numero_semana INTEGER NOT NULL,
  data_referencia_inicio DATE,
  data_referencia_fim DATE,
  entrada_realizada NUMERIC(15,2) NOT NULL DEFAULT 0,
  media_mensal_referencia NUMERIC(15,2) NOT NULL DEFAULT 0,
  limite_mensal_referencia NUMERIC(15,2) NOT NULL DEFAULT 0,
  media_semanal_referencia NUMERIC(15,2) NOT NULL DEFAULT 0,
  quantidade_semanas_mes INTEGER NOT NULL DEFAULT 4,
  compensacao_anterior NUMERIC(15,2) NOT NULL DEFAULT 0,
  entrada_com_compensacao NUMERIC(15,2) NOT NULL DEFAULT 0,
  diferenca_referencia_semanal NUMERIC(15,2) NOT NULL DEFAULT 0,
  compensacao_necessaria NUMERIC(15,2) NOT NULL DEFAULT 0,
  percentual_limite_semanal NUMERIC(8,2) NOT NULL DEFAULT 0,
  percentual_limite_mensal NUMERIC(8,2) NOT NULL DEFAULT 0,
  percentual_limite_anual NUMERIC(8,2) NOT NULL DEFAULT 0,
  alerta_aderencia BOOLEAN NOT NULL DEFAULT false,
  motivo_alerta TEXT,
  criado_por UUID NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acomp_hist_acomp ON acompanhamento_compensacoes_historico(acompanhamento_id);
CREATE INDEX IF NOT EXISTS idx_acomp_hist_semana ON acompanhamento_compensacoes_historico(numero_semana);
CREATE INDEX IF NOT EXISTS idx_acomp_hist_alerta ON acompanhamento_compensacoes_historico(alerta_aderencia);
CREATE INDEX IF NOT EXISTS idx_acomp_hist_created ON acompanhamento_compensacoes_historico(created_at);

-- 040_fix_acompanhamento_bancario_salvar_atualizacao.sql
-- Corrige schemas legados do acompanhamento bancário que impediam o botão
-- "Salvar atualização semanal" de persistir a semana. Idempotente e sem perda
-- de dados.

-- Garante colunas usadas pelo backend na tabela de atualizações semanais.
ALTER TABLE IF EXISTS public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS entrada_maquininha NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entrada_pix NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entrada_boleto NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entrada_ted NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entrada_dinheiro NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outras_entradas NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_entradas NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_saidas NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_semanal NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_medio NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_final NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantidade_transacoes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_bacen TEXT,
  ADD COLUMN IF NOT EXISTS rating_interno TEXT,
  ADD COLUMN IF NOT EXISTS possui_restricao BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS restricao_nova BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS scr_status TEXT,
  ADD COLUMN IF NOT EXISTS cenprot_status TEXT,
  ADD COLUMN IF NOT EXISTS serasa_status TEXT,
  ADD COLUMN IF NOT EXISTS cnd_status TEXT,
  ADD COLUMN IF NOT EXISTS pld_aml_status TEXT,
  ADD COLUMN IF NOT EXISTS coaf_status TEXT,
  ADD COLUMN IF NOT EXISTS devolucao_ou_estorno BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ocorrencia_negativa BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_semana TEXT DEFAULT 'neutra',
  ADD COLUMN IF NOT EXISTS analise_semana TEXT,
  ADD COLUMN IF NOT EXISTS orientacao_cliente TEXT,
  ADD COLUMN IF NOT EXISTS proxima_acao TEXT,
  ADD COLUMN IF NOT EXISTS faturamento_anual_ref NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_anual_movimentacao NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS faturamento_mensal_base NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_mensal_movimentacao NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referencia_semanal_base NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_semanal_movimentacao NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS semanas_no_mes INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS acumulado_mensal NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acumulado_anual NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_abaixo_semana NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_excedente_semana NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_faltante_ref_mensal NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_disponivel_teto_mensal NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS semanas_restantes_mes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_base_dinamica NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_dinamico_proxima NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_semanal NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_mensal NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_anual NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_aderencia TEXT,
  ADD COLUMN IF NOT EXISTS alerta_aderencia BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_alerta_aderencia TEXT,
  ADD COLUMN IF NOT EXISTS diagnostico_tecnico TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Ambientes antigos chegaram a ter alerta_aderencia como texto ('verde',
-- 'amarelo', 'vermelho', 'critico'). O backend usa boolean; convertemos de
-- forma segura.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'acompanhamento_bancario_atualizacoes'
      AND column_name = 'alerta_aderencia'
      AND data_type <> 'boolean'
  ) THEN
    ALTER TABLE public.acompanhamento_bancario_atualizacoes
      ALTER COLUMN alerta_aderencia TYPE BOOLEAN
      USING (
        LOWER(COALESCE(alerta_aderencia::text, 'false')) IN
        ('true','t','1','sim','s','yes','y','vermelho','amarelo','critico','crítico','alerta','alta')
      );
  END IF;
END $$;

-- Garante a constraint usada pelo ON CONFLICT.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'acompanhamento_bancario_atualizacoes_acomp_semana_uniq'
  ) THEN
    ALTER TABLE public.acompanhamento_bancario_atualizacoes
      ADD CONSTRAINT acompanhamento_bancario_atualizacoes_acomp_semana_uniq
      UNIQUE (acompanhamento_id, numero_semana);
  END IF;
EXCEPTION WHEN duplicate_table OR duplicate_object THEN
  NULL;
END $$;

-- Histórico de compensações usado como log auxiliar. Deve existir, mas falhas
-- nesse histórico não devem impedir o salvamento da semana.
CREATE TABLE IF NOT EXISTS public.acompanhamento_compensacoes_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acompanhamento_id UUID NOT NULL REFERENCES public.acompanhamentos_bancarios(id) ON DELETE CASCADE,
  numero_semana INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE IF EXISTS public.acompanhamento_compensacoes_historico
  ADD COLUMN IF NOT EXISTS data_referencia_inicio DATE,
  ADD COLUMN IF NOT EXISTS data_referencia_fim DATE,
  ADD COLUMN IF NOT EXISTS entrada_realizada NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS faturamento_anual_ref NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_anual_movimentacao NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS faturamento_mensal_base NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_mensal_movimentacao NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referencia_semanal_base NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_semanal_movimentacao NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acumulado_mensal NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_abaixo_semana NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_excedente_semana NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_faltante_ref_mensal NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_disponivel_teto_mensal NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_base_dinamica NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_dinamico_proxima NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_semanal NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_mensal NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_anual NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_aderencia TEXT,
  ADD COLUMN IF NOT EXISTS alerta_aderencia BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_alerta TEXT,
  ADD COLUMN IF NOT EXISTS diagnostico_tecnico TEXT,
  ADD COLUMN IF NOT EXISTS criado_por UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'acompanhamento_compensacoes_historico'
      AND column_name = 'alerta_aderencia'
      AND data_type <> 'boolean'
  ) THEN
    ALTER TABLE public.acompanhamento_compensacoes_historico
      ALTER COLUMN alerta_aderencia TYPE BOOLEAN
      USING (
        LOWER(COALESCE(alerta_aderencia::text, 'false')) IN
        ('true','t','1','sim','s','yes','y','vermelho','amarelo','critico','crítico','alerta','alta')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'ux_acomp_comp_hist_acomp_semana'
  ) THEN
    CREATE UNIQUE INDEX ux_acomp_comp_hist_acomp_semana
      ON public.acompanhamento_compensacoes_historico(acompanhamento_id, numero_semana);
  END IF;
END $$;

-- Alertas auxiliares.
CREATE TABLE IF NOT EXISTS public.acompanhamento_bancario_alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acompanhamento_id UUID NOT NULL REFERENCES public.acompanhamentos_bancarios(id) ON DELETE CASCADE,
  numero_semana INTEGER,
  tipo TEXT,
  titulo TEXT,
  mensagem TEXT,
  data_alerta DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'pendente',
  responsavel_id UUID,
  origem TEXT DEFAULT 'sistema',
  prioridade TEXT DEFAULT 'media',
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE IF EXISTS public.acompanhamento_bancario_alertas
  ADD COLUMN IF NOT EXISTS atualizacao_id UUID,
  ADD COLUMN IF NOT EXISTS resolvido_em TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'ux_acomp_alertas_acomp_semana_tipo'
  ) THEN
    CREATE UNIQUE INDEX ux_acomp_alertas_acomp_semana_tipo
      ON public.acompanhamento_bancario_alertas(acompanhamento_id, numero_semana, tipo);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_acomp_banc_atualizacoes_acomp_semana
  ON public.acompanhamento_bancario_atualizacoes(acompanhamento_id, numero_semana);

CREATE INDEX IF NOT EXISTS idx_acomp_banc_alertas_acomp_status
  ON public.acompanhamento_bancario_alertas(acompanhamento_id, status);

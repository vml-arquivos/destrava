-- 029_acompanhamento_bancario_logica_alertas_relatorio.sql
-- Finaliza a lógica operacional do acompanhamento bancário:
-- - fórmula anual/mensal/semanal com margem operacional
-- - alertas automáticos por semana
-- - suporte a relatório mensal assinado
-- Seguro para rodar mais de uma vez.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.acompanhamentos_bancarios
  ADD COLUMN IF NOT EXISTS percentual_operacional NUMERIC(5,2) NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS margem_seguranca_30 NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS telefone_cliente TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_cliente TEXT,
  ADD COLUMN IF NOT EXISTS email_cliente TEXT,
  ADD COLUMN IF NOT EXISTS gerente_banco TEXT,
  ADD COLUMN IF NOT EXISTS contato_banco TEXT,
  ADD COLUMN IF NOT EXISTS data_abertura_conta DATE;

UPDATE public.acompanhamentos_bancarios
   SET margem_seguranca_30 = COALESCE(
         margem_seguranca_30,
         margem_30,
         CASE
           WHEN media_mensal IS NOT NULL THEN ROUND(media_mensal * (1 + COALESCE(percentual_operacional, 30) / 100), 2)
           WHEN faturamento_anual IS NOT NULL THEN ROUND((faturamento_anual / 12) * (1 + COALESCE(percentual_operacional, 30) / 100), 2)
           ELSE NULL
         END
       )
 WHERE margem_seguranca_30 IS NULL;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS entrada_maquininha NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scr_status TEXT,
  ADD COLUMN IF NOT EXISTS cenprot_status TEXT,
  ADD COLUMN IF NOT EXISTS serasa_status TEXT,
  ADD COLUMN IF NOT EXISTS cnd_status TEXT,
  ADD COLUMN IF NOT EXISTS pld_aml_status TEXT,
  ADD COLUMN IF NOT EXISTS coaf_status TEXT,
  ADD COLUMN IF NOT EXISTS possui_restricao BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_semana TEXT,
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
  ADD COLUMN IF NOT EXISTS status_aderencia TEXT DEFAULT 'aguardando_atualizacao',
  ADD COLUMN IF NOT EXISTS alerta_aderencia BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_alerta_aderencia TEXT,
  ADD COLUMN IF NOT EXISTS diagnostico_tecnico TEXT;

-- Sincroniza naming antigo entrada_maquina -> entrada_maquininha, quando existir.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'acompanhamento_bancario_atualizacoes'
       AND column_name = 'entrada_maquina'
  ) THEN
    EXECUTE 'UPDATE public.acompanhamento_bancario_atualizacoes
                SET entrada_maquininha = COALESCE(NULLIF(entrada_maquininha, 0), entrada_maquina)
              WHERE entrada_maquininha = 0
                AND entrada_maquina IS NOT NULL';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.acompanhamento_bancario_alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acompanhamento_id UUID NOT NULL REFERENCES public.acompanhamentos_bancarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT,
  data_alerta DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pendente',
  responsavel_id UUID NULL REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolvido_em TIMESTAMPTZ
);

ALTER TABLE public.acompanhamento_bancario_alertas
  ADD COLUMN IF NOT EXISTS atualizacao_id UUID REFERENCES public.acompanhamento_bancario_atualizacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS numero_semana INTEGER,
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'sistema',
  ADD COLUMN IF NOT EXISTS prioridade TEXT NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_acomp_banc_alertas_acomp
  ON public.acompanhamento_bancario_alertas(acompanhamento_id);

CREATE INDEX IF NOT EXISTS idx_acomp_banc_alertas_semana
  ON public.acompanhamento_bancario_alertas(acompanhamento_id, numero_semana);

CREATE INDEX IF NOT EXISTS idx_acomp_banc_alertas_pendentes
  ON public.acompanhamento_bancario_alertas(status, prioridade, data_alerta DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_acomp_banc_alerta_semana_tipo
  ON public.acompanhamento_bancario_alertas(acompanhamento_id, numero_semana, tipo)
  WHERE numero_semana IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.acompanhamento_bancario_relatorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acompanhamento_id UUID NOT NULL REFERENCES public.acompanhamentos_bancarios(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'mensal',
  status TEXT NOT NULL DEFAULT 'gerado',
  pdf_path TEXT,
  hash_documento TEXT,
  assinado_em TIMESTAMPTZ,
  assinado_por_nome TEXT,
  assinado_por_documento TEXT,
  payload_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  gerado_por UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(acompanhamento_id, ano, mes, tipo)
);

CREATE INDEX IF NOT EXISTS idx_acomp_banc_rel_acomp
  ON public.acompanhamento_bancario_relatorios(acompanhamento_id);

CREATE INDEX IF NOT EXISTS idx_acomp_banc_rel_periodo
  ON public.acompanhamento_bancario_relatorios(ano, mes, tipo);

-- Backfill de aderência para semanas antigas com faturamento anual cadastrado.
WITH calc AS (
  SELECT
    u.id,
    a.faturamento_anual,
    COALESCE(a.percentual_operacional, 30) AS pct,
    COALESCE(NULLIF(u.total_entradas, 0), u.entrada_maquininha + u.entrada_pix + u.entrada_boleto + u.entrada_ted + u.entrada_dinheiro + u.outras_entradas, 0) AS entradas
  FROM public.acompanhamento_bancario_atualizacoes u
  JOIN public.acompanhamentos_bancarios a ON a.id = u.acompanhamento_id
  WHERE COALESCE(a.faturamento_anual, 0) > 0
)
UPDATE public.acompanhamento_bancario_atualizacoes u
   SET faturamento_anual_ref = ROUND(calc.faturamento_anual, 2),
       teto_anual_movimentacao = ROUND(calc.faturamento_anual * (1 + calc.pct / 100), 2),
       faturamento_mensal_base = ROUND(calc.faturamento_anual / 12, 2),
       teto_mensal_movimentacao = ROUND((calc.faturamento_anual * (1 + calc.pct / 100)) / 12, 2),
       referencia_semanal_base = ROUND((calc.faturamento_anual / 12) / 4, 2),
       teto_semanal_movimentacao = ROUND(((calc.faturamento_anual * (1 + calc.pct / 100)) / 12) / 4, 2),
       semanas_no_mes = 4,
       percentual_uso_semanal = CASE
         WHEN ((calc.faturamento_anual * (1 + calc.pct / 100)) / 12 / 4) > 0
         THEN ROUND((calc.entradas / ((calc.faturamento_anual * (1 + calc.pct / 100)) / 12 / 4)) * 100, 2)
         ELSE 0
       END,
       status_aderencia = CASE
         WHEN calc.entradas <= 0 THEN 'aguardando_atualizacao'
         WHEN calc.entradas < ((calc.faturamento_anual / 12) / 4) THEN 'abaixo_da_referencia'
         WHEN calc.entradas <= ((calc.faturamento_anual * (1 + calc.pct / 100)) / 12 / 4) THEN 'dentro_da_faixa'
         WHEN calc.entradas >= (((calc.faturamento_anual * (1 + calc.pct / 100)) / 12 / 4) * 1.5) THEN 'critico'
         ELSE 'acima_do_teto'
       END,
       alerta_aderencia = CASE
         WHEN calc.entradas <= 0 THEN false
         WHEN calc.entradas < ((calc.faturamento_anual / 12) / 4) THEN true
         WHEN calc.entradas > ((calc.faturamento_anual * (1 + calc.pct / 100)) / 12 / 4) THEN true
         ELSE false
       END
  FROM calc
 WHERE u.id = calc.id;


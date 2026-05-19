-- ============================================================================
-- Destrava Crédito
-- Migration 029 CORRIGIDA — Acompanhamento bancário: lógica, alertas e relatório
-- ============================================================================
-- Objetivo:
-- 1) Corrigir a versão anterior que referenciava a coluna inexistente margem_30.
-- 2) Preparar as colunas usadas pelo acompanhamento bancário sem quebrar dados existentes.
-- 3) Reparar instalações antigas onde total_entradas/saldo_semanal foram criadas como GENERATED.
-- 4) Manter a fórmula oficial:
--    limite anual = faturamento_anual * 1.30
--    média mensal = faturamento_anual / 12
--    teto mensal = (faturamento_anual * 1.30) / 12
--    referência semanal = média mensal / 4
--    teto semanal = teto mensal / 4
--
-- Pré-requisito quando houver erro de ownership:
-- execute antes, como usuário postgres/superuser:
--   ALTER TABLE public.acompanhamentos_bancarios OWNER TO destravadb;
--   ALTER TABLE public.acompanhamento_bancario_atualizacoes OWNER TO destravadb;
--   ALTER TABLE public.acompanhamento_bancario_alertas OWNER TO destravadb;
--   ALTER TABLE public.acompanhamento_bancario_relatorios OWNER TO destravadb;
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Tabela principal
-- ---------------------------------------------------------------------------

ALTER TABLE public.acompanhamentos_bancarios
  ADD COLUMN IF NOT EXISTS faturamento_anual NUMERIC(15,2);

ALTER TABLE public.acompanhamentos_bancarios
  ADD COLUMN IF NOT EXISTS limite_operacional_anual NUMERIC(15,2);

ALTER TABLE public.acompanhamentos_bancarios
  ADD COLUMN IF NOT EXISTS media_mensal_base NUMERIC(15,2);

ALTER TABLE public.acompanhamentos_bancarios
  ADD COLUMN IF NOT EXISTS teto_mensal NUMERIC(15,2);

ALTER TABLE public.acompanhamentos_bancarios
  ADD COLUMN IF NOT EXISTS referencia_semanal NUMERIC(15,2);

ALTER TABLE public.acompanhamentos_bancarios
  ADD COLUMN IF NOT EXISTS teto_semanal NUMERIC(15,2);

ALTER TABLE public.acompanhamentos_bancarios
  ADD COLUMN IF NOT EXISTS margem_seguranca_30 NUMERIC(15,2);

ALTER TABLE public.acompanhamentos_bancarios
  ADD COLUMN IF NOT EXISTS status_operacional VARCHAR(40) DEFAULT 'pendente';

ALTER TABLE public.acompanhamentos_bancarios
  ADD COLUMN IF NOT EXISTS diagnostico_operacional TEXT;

ALTER TABLE public.acompanhamentos_bancarios
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill oficial sem depender de margem_30, media_mensal antiga ou qualquer coluna legado.
UPDATE public.acompanhamentos_bancarios
SET
  limite_operacional_anual = ROUND(COALESCE(faturamento_anual, 0) * 1.30, 2),
  media_mensal_base = ROUND(COALESCE(faturamento_anual, 0) / 12.0, 2),
  teto_mensal = ROUND((COALESCE(faturamento_anual, 0) * 1.30) / 12.0, 2),
  referencia_semanal = ROUND((COALESCE(faturamento_anual, 0) / 12.0) / 4.0, 2),
  teto_semanal = ROUND(((COALESCE(faturamento_anual, 0) * 1.30) / 12.0) / 4.0, 2),
  margem_seguranca_30 = ROUND(COALESCE(faturamento_anual, 0) * 0.30, 2),
  updated_at = NOW()
WHERE faturamento_anual IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Tabela de atualizações semanais
-- ---------------------------------------------------------------------------

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS entrada_pix NUMERIC(15,2) DEFAULT 0;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS entrada_dinheiro NUMERIC(15,2) DEFAULT 0;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS entrada_maquininha NUMERIC(15,2) DEFAULT 0;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS entrada_boleto NUMERIC(15,2) DEFAULT 0;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS entrada_ted NUMERIC(15,2) DEFAULT 0;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS entrada_outras NUMERIC(15,2) DEFAULT 0;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS referencia_semanal NUMERIC(15,2);

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS teto_semanal NUMERIC(15,2);

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS acumulado_mensal NUMERIC(15,2) DEFAULT 0;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS acumulado_anual NUMERIC(15,2) DEFAULT 0;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS saldo_disponivel_mes NUMERIC(15,2) DEFAULT 0;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS valor_faltante_referencia NUMERIC(15,2) DEFAULT 0;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS valor_excedente_teto NUMERIC(15,2) DEFAULT 0;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS meta_dinamica_proxima_semana NUMERIC(15,2);

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS teto_dinamico_proxima_semana NUMERIC(15,2);

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS status_semana VARCHAR(40) DEFAULT 'pendente';

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS diagnostico_semana TEXT;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS alerta_risco VARCHAR(40) DEFAULT 'normal';

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS percentual_teto_semanal NUMERIC(8,2) DEFAULT 0;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS percentual_teto_mensal NUMERIC(8,2) DEFAULT 0;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS observacao_operacional TEXT;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Colunas usadas pelo monitor semanal anterior, mantidas para compatibilidade.
ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS status_aderencia VARCHAR(40);

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS alerta_aderencia VARCHAR(40);

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS motivo_alerta_aderencia TEXT;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS meta_base_dinamica NUMERIC(15,2);

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS teto_dinamico_proxima NUMERIC(15,2);

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS percentual_uso_semanal NUMERIC(8,2);

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS percentual_uso_mensal NUMERIC(8,2);

-- Se instalações antigas tiverem total_entradas/saldo_semanal como GENERATED,
-- converte para colunas normais. Isso evita erro em INSERT/UPDATE do backend.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'acompanhamento_bancario_atualizacoes'
      AND column_name = 'total_entradas'
      AND is_generated <> 'NEVER'
  ) THEN
    ALTER TABLE public.acompanhamento_bancario_atualizacoes
      ADD COLUMN IF NOT EXISTS total_entradas_tmp NUMERIC(15,2);

    UPDATE public.acompanhamento_bancario_atualizacoes
    SET total_entradas_tmp = COALESCE(total_entradas, 0);

    ALTER TABLE public.acompanhamento_bancario_atualizacoes
      DROP COLUMN total_entradas;

    ALTER TABLE public.acompanhamento_bancario_atualizacoes
      RENAME COLUMN total_entradas_tmp TO total_entradas;

    ALTER TABLE public.acompanhamento_bancario_atualizacoes
      ALTER COLUMN total_entradas SET DEFAULT 0;

    UPDATE public.acompanhamento_bancario_atualizacoes
    SET total_entradas = 0
    WHERE total_entradas IS NULL;

    ALTER TABLE public.acompanhamento_bancario_atualizacoes
      ALTER COLUMN total_entradas SET NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'acompanhamento_bancario_atualizacoes'
      AND column_name = 'saldo_semanal'
      AND is_generated <> 'NEVER'
  ) THEN
    ALTER TABLE public.acompanhamento_bancario_atualizacoes
      ADD COLUMN IF NOT EXISTS saldo_semanal_tmp NUMERIC(15,2);

    UPDATE public.acompanhamento_bancario_atualizacoes
    SET saldo_semanal_tmp = COALESCE(saldo_semanal, 0);

    ALTER TABLE public.acompanhamento_bancario_atualizacoes
      DROP COLUMN saldo_semanal;

    ALTER TABLE public.acompanhamento_bancario_atualizacoes
      RENAME COLUMN saldo_semanal_tmp TO saldo_semanal;

    ALTER TABLE public.acompanhamento_bancario_atualizacoes
      ALTER COLUMN saldo_semanal SET DEFAULT 0;

    UPDATE public.acompanhamento_bancario_atualizacoes
    SET saldo_semanal = 0
    WHERE saldo_semanal IS NULL;

    ALTER TABLE public.acompanhamento_bancario_atualizacoes
      ALTER COLUMN saldo_semanal SET NOT NULL;
  END IF;
END $$;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS total_entradas NUMERIC(15,2) DEFAULT 0;

ALTER TABLE public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS saldo_semanal NUMERIC(15,2) DEFAULT 0;

-- Sincroniza legado entrada_maquina -> entrada_maquininha quando existir.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'acompanhamento_bancario_atualizacoes'
      AND column_name = 'entrada_maquina'
  ) THEN
    UPDATE public.acompanhamento_bancario_atualizacoes
    SET entrada_maquininha = COALESCE(NULLIF(entrada_maquininha, 0), entrada_maquina, 0)
    WHERE COALESCE(entrada_maquininha, 0) = 0
      AND COALESCE(entrada_maquina, 0) > 0;
  END IF;
END $$;

-- Recalcula totais por semana sem duplicar maquininha quando houver coluna legado.
UPDATE public.acompanhamento_bancario_atualizacoes
SET
  entrada_pix = COALESCE(entrada_pix, 0),
  entrada_dinheiro = COALESCE(entrada_dinheiro, 0),
  entrada_maquininha = COALESCE(entrada_maquininha, 0),
  entrada_boleto = COALESCE(entrada_boleto, 0),
  entrada_ted = COALESCE(entrada_ted, 0),
  entrada_outras = COALESCE(entrada_outras, 0),
  total_entradas = ROUND(
    COALESCE(entrada_pix, 0)
    + COALESCE(entrada_dinheiro, 0)
    + COALESCE(entrada_maquininha, 0)
    + COALESCE(entrada_boleto, 0)
    + COALESCE(entrada_ted, 0)
    + COALESCE(entrada_outras, 0),
    2
  ),
  saldo_semanal = ROUND(
    COALESCE(entrada_pix, 0)
    + COALESCE(entrada_dinheiro, 0)
    + COALESCE(entrada_maquininha, 0)
    + COALESCE(entrada_boleto, 0)
    + COALESCE(entrada_ted, 0)
    + COALESCE(entrada_outras, 0),
    2
  ),
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 3. Reprocessamento financeiro simples das semanas existentes
-- ---------------------------------------------------------------------------

WITH base AS (
  SELECT
    u.id,
    a.id AS acompanhamento_id,
    COALESCE(a.faturamento_anual, 0) AS faturamento_anual,
    ROUND((COALESCE(a.faturamento_anual, 0) / 12.0) / 4.0, 2) AS referencia_sem,
    ROUND(((COALESCE(a.faturamento_anual, 0) * 1.30) / 12.0) / 4.0, 2) AS teto_sem,
    ROUND((COALESCE(a.faturamento_anual, 0) * 1.30) / 12.0, 2) AS teto_mes,
    COALESCE(u.total_entradas, 0) AS total_sem,
    COALESCE(u.data_atualizacao, NOW()) AS data_atualizacao
  FROM public.acompanhamento_bancario_atualizacoes u
  JOIN public.acompanhamentos_bancarios a ON a.id = u.acompanhamento_id
),
calc AS (
  SELECT
    b.*,
    SUM(b.total_sem) OVER (
      PARTITION BY b.acompanhamento_id, DATE_TRUNC('month', b.data_atualizacao)
      ORDER BY b.data_atualizacao, b.id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS acum_mes,
    SUM(b.total_sem) OVER (
      PARTITION BY b.acompanhamento_id, DATE_TRUNC('year', b.data_atualizacao)
      ORDER BY b.data_atualizacao, b.id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS acum_ano
  FROM base b
)
UPDATE public.acompanhamento_bancario_atualizacoes u
SET
  referencia_semanal = c.referencia_sem,
  teto_semanal = c.teto_sem,
  acumulado_mensal = ROUND(c.acum_mes, 2),
  acumulado_anual = ROUND(c.acum_ano, 2),
  saldo_disponivel_mes = GREATEST(ROUND(c.teto_mes - c.acum_mes, 2), 0),
  valor_faltante_referencia = GREATEST(ROUND(c.referencia_sem - c.total_sem, 2), 0),
  valor_excedente_teto = GREATEST(ROUND(c.total_sem - c.teto_sem, 2), 0),
  percentual_teto_semanal = CASE WHEN c.teto_sem > 0 THEN ROUND((c.total_sem / c.teto_sem) * 100, 2) ELSE 0 END,
  percentual_teto_mensal = CASE WHEN c.teto_mes > 0 THEN ROUND((c.acum_mes / c.teto_mes) * 100, 2) ELSE 0 END,
  status_semana = CASE
    WHEN c.teto_sem > 0 AND c.total_sem > c.teto_sem * 1.20 THEN 'risco_critico'
    WHEN c.teto_sem > 0 AND c.total_sem > c.teto_sem THEN 'acima_teto'
    WHEN c.referencia_sem > 0 AND c.total_sem < c.referencia_sem * 0.70 THEN 'muito_abaixo'
    WHEN c.referencia_sem > 0 AND c.total_sem < c.referencia_sem THEN 'abaixo_referencia'
    ELSE 'dentro_faixa'
  END,
  alerta_risco = CASE
    WHEN c.teto_sem > 0 AND c.total_sem > c.teto_sem * 1.20 THEN 'coaf_pld_aml'
    WHEN c.teto_sem > 0 AND c.total_sem > c.teto_sem THEN 'excesso_teto'
    WHEN c.referencia_sem > 0 AND c.total_sem < c.referencia_sem * 0.70 THEN 'baixa_movimentacao'
    WHEN c.referencia_sem > 0 AND c.total_sem < c.referencia_sem THEN 'atenção'
    ELSE 'normal'
  END,
  diagnostico_semana = CASE
    WHEN c.teto_sem > 0 AND c.total_sem > c.teto_sem * 1.20 THEN 'Movimentação semanal acima do teto com risco operacional elevado. Avaliar aderência, origem dos recursos e controles PLD/AML.'
    WHEN c.teto_sem > 0 AND c.total_sem > c.teto_sem THEN 'Movimentação semanal acima do teto operacional. Recomenda-se redistribuir entradas nas semanas seguintes.'
    WHEN c.referencia_sem > 0 AND c.total_sem < c.referencia_sem * 0.70 THEN 'Movimentação semanal muito abaixo da referência. Há risco de baixa aderência ao planejamento.'
    WHEN c.referencia_sem > 0 AND c.total_sem < c.referencia_sem THEN 'Movimentação abaixo da referência semanal, mas ainda em faixa recuperável.'
    ELSE 'Movimentação dentro da faixa operacional esperada.'
  END,
  status_aderencia = CASE
    WHEN c.teto_sem > 0 AND c.total_sem > c.teto_sem * 1.20 THEN 'critico'
    WHEN c.teto_sem > 0 AND c.total_sem > c.teto_sem THEN 'acima_teto'
    WHEN c.referencia_sem > 0 AND c.total_sem < c.referencia_sem * 0.70 THEN 'abaixo_piso'
    WHEN c.referencia_sem > 0 AND c.total_sem < c.referencia_sem THEN 'abaixo_referencia'
    ELSE 'dentro_da_faixa'
  END,
  alerta_aderencia = CASE
    WHEN c.teto_sem > 0 AND c.total_sem > c.teto_sem * 1.20 THEN 'critico'
    WHEN c.teto_sem > 0 AND c.total_sem > c.teto_sem THEN 'vermelho'
    WHEN c.referencia_sem > 0 AND c.total_sem < c.referencia_sem * 0.70 THEN 'vermelho'
    WHEN c.referencia_sem > 0 AND c.total_sem < c.referencia_sem THEN 'amarelo'
    ELSE 'verde'
  END,
  motivo_alerta_aderencia = CASE
    WHEN c.teto_sem > 0 AND c.total_sem > c.teto_sem * 1.20 THEN 'Semana acima de 120% do teto operacional.'
    WHEN c.teto_sem > 0 AND c.total_sem > c.teto_sem THEN 'Semana acima do teto operacional.'
    WHEN c.referencia_sem > 0 AND c.total_sem < c.referencia_sem * 0.70 THEN 'Semana abaixo de 70% da referência.'
    WHEN c.referencia_sem > 0 AND c.total_sem < c.referencia_sem THEN 'Semana abaixo da referência.'
    ELSE 'Semana dentro da faixa.'
  END,
  percentual_uso_semanal = CASE WHEN c.teto_sem > 0 THEN ROUND((c.total_sem / c.teto_sem) * 100, 2) ELSE 0 END,
  percentual_uso_mensal = CASE WHEN c.teto_mes > 0 THEN ROUND((c.acum_mes / c.teto_mes) * 100, 2) ELSE 0 END,
  updated_at = NOW()
FROM calc c
WHERE c.id = u.id;

-- ---------------------------------------------------------------------------
-- 4. Alertas e relatórios
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.acompanhamento_bancario_alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acompanhamento_id UUID NOT NULL REFERENCES public.acompanhamentos_bancarios(id) ON DELETE CASCADE,
  atualizacao_id UUID REFERENCES public.acompanhamento_bancario_atualizacoes(id) ON DELETE CASCADE,
  tipo VARCHAR(60) NOT NULL,
  severidade VARCHAR(30) NOT NULL DEFAULT 'info',
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'aberto',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolvido_em TIMESTAMPTZ,
  resolvido_por UUID,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.acompanhamento_bancario_relatorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acompanhamento_id UUID NOT NULL REFERENCES public.acompanhamentos_bancarios(id) ON DELETE CASCADE,
  mes INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  total_mensal NUMERIC(15,2) DEFAULT 0,
  referencia_mensal NUMERIC(15,2) DEFAULT 0,
  teto_mensal NUMERIC(15,2) DEFAULT 0,
  status_mensal VARCHAR(40) DEFAULT 'pendente',
  diagnostico_mensal TEXT,
  conteudo_html TEXT,
  pdf_url TEXT,
  assinado_em TIMESTAMPTZ,
  assinado_por TEXT,
  criado_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE (acompanhamento_id, mes, ano)
);

CREATE TABLE IF NOT EXISTS public.acompanhamento_compensacoes_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acompanhamento_id UUID NOT NULL REFERENCES public.acompanhamentos_bancarios(id) ON DELETE CASCADE,
  atualizacao_id UUID REFERENCES public.acompanhamento_bancario_atualizacoes(id) ON DELETE CASCADE,
  numero_semana INTEGER,
  mes INTEGER,
  ano INTEGER,
  meta_dinamica NUMERIC(15,2),
  teto_dinamico NUMERIC(15,2),
  acumulado_mensal NUMERIC(15,2),
  saldo_disponivel_mes NUMERIC(15,2),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Índices seguros
CREATE INDEX IF NOT EXISTS idx_acomp_banc_atualizacoes_acomp_data
  ON public.acompanhamento_bancario_atualizacoes (acompanhamento_id, data_atualizacao DESC);

CREATE INDEX IF NOT EXISTS idx_acomp_banc_atualizacoes_acomp_semana
  ON public.acompanhamento_bancario_atualizacoes (acompanhamento_id, numero_semana);

CREATE INDEX IF NOT EXISTS idx_acomp_banc_alertas_acomp_status
  ON public.acompanhamento_bancario_alertas (acompanhamento_id, status);

CREATE INDEX IF NOT EXISTS idx_acomp_banc_relatorios_acomp_mes_ano
  ON public.acompanhamento_bancario_relatorios (acompanhamento_id, ano, mes);

CREATE INDEX IF NOT EXISTS idx_acomp_compensacoes_acomp_semana
  ON public.acompanhamento_compensacoes_historico (acompanhamento_id, ano, mes, numero_semana);

-- Constraint única defensiva para evitar duplicidade da mesma semana por acompanhamento.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_acompanhamento_semana'
      AND conrelid = 'public.acompanhamento_bancario_atualizacoes'::regclass
  ) THEN
    ALTER TABLE public.acompanhamento_bancario_atualizacoes
      ADD CONSTRAINT uq_acompanhamento_semana UNIQUE (acompanhamento_id, numero_semana);
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'Não foi possível criar uq_acompanhamento_semana porque há duplicidades existentes. Remova duplicidades antes de criar a constraint.';
END $$;

COMMIT;

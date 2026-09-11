-- ============================================================
-- MIGRATION 060 — FIX URGENTE: Acompanhamento bancário
-- Roda direto no banco sem precisar de deploy.
-- Comando: psql $DATABASE_URL < db/migrations/060_fix_urgente_atualizacao_semanal.sql
-- Idempotente: seguro para rodar N vezes.
-- ============================================================
BEGIN;

-- ── Tabela principal de atualizações semanais ─────────────────────────────────
ALTER TABLE acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS faturamento_anual_ref          NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_anual_movimentacao        NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS faturamento_mensal_base        NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_mensal_movimentacao       NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referencia_semanal_base        NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_semanal_movimentacao      NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS semanas_no_mes                 INTEGER        NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS acumulado_mensal               NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acumulado_anual                NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_abaixo_semana            NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_excedente_semana         NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_faltante_ref_mensal      NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_disponivel_teto_mensal   NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS semanas_restantes_mes          INTEGER        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_base_dinamica             NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_dinamico_proxima          NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_semanal         NUMERIC(8,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_mensal          NUMERIC(8,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_anual           NUMERIC(8,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_aderencia               TEXT,
  ADD COLUMN IF NOT EXISTS alerta_aderencia               BOOLEAN        NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS motivo_alerta_aderencia        TEXT,
  ADD COLUMN IF NOT EXISTS diagnostico_tecnico            TEXT,
  ADD COLUMN IF NOT EXISTS scr_status                     TEXT,
  ADD COLUMN IF NOT EXISTS cenprot_status                 TEXT,
  ADD COLUMN IF NOT EXISTS serasa_status                  TEXT,
  ADD COLUMN IF NOT EXISTS cnd_status                     TEXT,
  ADD COLUMN IF NOT EXISTS pld_aml_status                 TEXT,
  ADD COLUMN IF NOT EXISTS coaf_status                    TEXT,
  ADD COLUMN IF NOT EXISTS analise_semana                 TEXT,
  ADD COLUMN IF NOT EXISTS orientacao_cliente             TEXT,
  ADD COLUMN IF NOT EXISTS proxima_acao                   TEXT,
  ADD COLUMN IF NOT EXISTS media_mensal_referencia        NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limite_mensal_referencia       NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS media_semanal_referencia       NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantidade_semanas_mes         INTEGER        NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS compensacao_semana_anterior    NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entrada_com_compensacao        NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS diferenca_referencia_semanal   NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compensacao_necessaria_proxima NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alerta_rating                  BOOLEAN        NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS saldo_faltante_mes             NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_dinamica_proxima_semana   NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_excedente_mes            NUMERIC(15,2) NOT NULL DEFAULT 0;

-- ── Tabela de histórico de compensações ──────────────────────────────────────
ALTER TABLE acompanhamento_compensacoes_historico
  ADD COLUMN IF NOT EXISTS faturamento_anual_ref          NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_anual_movimentacao        NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS faturamento_mensal_base        NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_mensal_movimentacao       NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referencia_semanal_base        NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_semanal_movimentacao      NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acumulado_mensal               NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_abaixo_semana            NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_excedente_semana         NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_faltante_ref_mensal      NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_disponivel_teto_mensal   NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_base_dinamica             NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_dinamico_proxima          NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_semanal         NUMERIC(8,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_mensal          NUMERIC(8,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_anual           NUMERIC(8,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_aderencia               TEXT,
  ADD COLUMN IF NOT EXISTS alerta_aderencia               BOOLEAN        NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS motivo_alerta                  TEXT,
  ADD COLUMN IF NOT EXISTS diagnostico_tecnico            TEXT,
  ADD COLUMN IF NOT EXISTS criado_por                     UUID;

-- ── UNIQUE constraint para ON CONFLICT do INSERT de compensações ─────────────
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

-- ── Índice de performance para query de empresas com acompanhamento ───────────
CREATE INDEX IF NOT EXISTS idx_acomp_bancario_empresa_status
  ON acompanhamentos_bancarios(empresa_id, status)
  WHERE empresa_id IS NOT NULL;

-- ── Desbloquear empresas que estão em acompanhamento ativo ───────────────────
UPDATE empresas e
SET bloqueado_operacional = FALSE
WHERE EXISTS (
  SELECT 1 FROM acompanhamentos_bancarios ab
  WHERE ab.empresa_id = e.id
    AND ab.status NOT IN ('encerrado', 'cancelado')
)
AND COALESCE(e.bloqueado_operacional, FALSE) = TRUE;

-- ── Permissão de acesso ao módulo financeiro ─────────────────────────────────
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS acesso_acompanhamento_financeiro BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE colaboradores
SET acesso_acompanhamento_financeiro = TRUE
WHERE LOWER(TRIM(COALESCE(cargo,'')))  IN ('administrador','admin','diretor','gestor_credito','gestor de credito')
   OR LOWER(TRIM(COALESCE(perfil,''))) IN ('administrador','admin','diretor','gestor_credito','gestor de credito');

COMMIT;

-- Verificação final
SELECT
  'acompanhamento_bancario_atualizacoes'   AS tabela,
  COUNT(*)                                  AS colunas_novas
FROM information_schema.columns
WHERE table_name = 'acompanhamento_bancario_atualizacoes'
  AND column_name IN (
    'faturamento_anual_ref','teto_anual_movimentacao','acumulado_mensal',
    'status_aderencia','diagnostico_tecnico','scr_status','analise_semana'
  )
UNION ALL
SELECT
  'acompanhamento_compensacoes_historico'  AS tabela,
  COUNT(*)                                  AS colunas_novas
FROM information_schema.columns
WHERE table_name = 'acompanhamento_compensacoes_historico'
  AND column_name IN (
    'faturamento_anual_ref','teto_anual_movimentacao','acumulado_mensal',
    'status_aderencia','diagnostico_tecnico'
  );

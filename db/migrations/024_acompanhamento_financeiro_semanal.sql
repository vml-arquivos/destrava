-- ============================================================
-- MIGRATION 024: Módulo de Acompanhamento Financeiro Semanal
-- Data: 2026-05-15
-- Descrição: Cria as tabelas para controle de coerência financeira
--            semanal com base no faturamento anual declarado.
-- ============================================================
-- ATENÇÃO: Esta migration NÃO é executada automaticamente.
-- O Desenvolvedor Chefe deve executar manualmente na VPS:
--   psql $DATABASE_URL < db/migrations/024_acompanhamento_financeiro_semanal.sql
-- ============================================================

-- ── TABELA 1: Configuração de Acompanhamento Financeiro ──────
-- Armazena o faturamento anual declarado e o percentual
-- operacional configurável por empresa.
CREATE TABLE IF NOT EXISTS acompanhamento_financeiro_config (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  faturamento_anual_declarado NUMERIC(15,2) NOT NULL CHECK (faturamento_anual_declarado >= 0),
  percentual_operacional      NUMERIC(5,2) NOT NULL DEFAULT 30.00
                                CHECK (percentual_operacional > 0 AND percentual_operacional <= 100),
  limite_anual                NUMERIC(15,2) GENERATED ALWAYS AS
                                (ROUND(faturamento_anual_declarado * percentual_operacional / 100, 2))
                                STORED,
  ativo                       BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_por                  UUID         REFERENCES colaboradores(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_af_config_empresa ON acompanhamento_financeiro_config(empresa_id);
CREATE INDEX IF NOT EXISTS idx_af_config_ativo   ON acompanhamento_financeiro_config(ativo);

-- ── TABELA 2: Acompanhamento Semanal ─────────────────────────
-- Registra os dados de cada semana analisada por empresa.
CREATE TABLE IF NOT EXISTS acompanhamento_financeiro_semanal (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  config_id               UUID         REFERENCES acompanhamento_financeiro_config(id) ON DELETE SET NULL,
  ano                     INTEGER      NOT NULL CHECK (ano >= 2020 AND ano <= 2100),
  mes                     INTEGER      NOT NULL CHECK (mes >= 1 AND mes <= 12),
  numero_semana           INTEGER      NOT NULL CHECK (numero_semana >= 1 AND numero_semana <= 6),
  semana_inicio           DATE         NOT NULL,
  semana_fim              DATE         NOT NULL,
  saldo_inicial           NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (saldo_inicial >= 0),
  total_entradas          NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (total_entradas >= 0),
  total_saidas            NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (total_saidas >= 0),
  saldo_final             NUMERIC(15,2) NOT NULL DEFAULT 0,
  saldo_medio             NUMERIC(15,2) NOT NULL DEFAULT 0,
  limite_semanal_referencia NUMERIC(15,2) NOT NULL DEFAULT 0,
  limite_mensal_referencia  NUMERIC(15,2) NOT NULL DEFAULT 0,
  limite_anual_referencia   NUMERIC(15,2) NOT NULL DEFAULT 0,
  acumulado_mensal        NUMERIC(15,2) NOT NULL DEFAULT 0,
  acumulado_anual         NUMERIC(15,2) NOT NULL DEFAULT 0,
  percentual_uso_semana   NUMERIC(7,2)  NOT NULL DEFAULT 0,
  percentual_uso_mes      NUMERIC(7,2)  NOT NULL DEFAULT 0,
  percentual_uso_ano      NUMERIC(7,2)  NOT NULL DEFAULT 0,
  status                  TEXT         NOT NULL DEFAULT 'aguardando_atualizacao'
                            CHECK (status IN (
                              'dentro_da_referencia',
                              'atencao_leve',
                              'atencao_media',
                              'incompativel',
                              'critico',
                              'sem_documentacao',
                              'aguardando_atualizacao',
                              'regularizado'
                            )),
  diagnostico             TEXT,
  observacoes             TEXT,
  criado_por              UUID         REFERENCES colaboradores(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_semana_datas CHECK (semana_fim >= semana_inicio),
  UNIQUE(empresa_id, ano, mes, numero_semana)
);

CREATE INDEX IF NOT EXISTS idx_af_semanal_empresa  ON acompanhamento_financeiro_semanal(empresa_id);
CREATE INDEX IF NOT EXISTS idx_af_semanal_periodo  ON acompanhamento_financeiro_semanal(ano, mes);
CREATE INDEX IF NOT EXISTS idx_af_semanal_status   ON acompanhamento_financeiro_semanal(status);
CREATE INDEX IF NOT EXISTS idx_af_semanal_criado   ON acompanhamento_financeiro_semanal(created_at DESC);

-- ── TABELA 3: Movimentações da Semana ────────────────────────
-- Registra cada movimentação (entrada ou saída) de uma semana.
CREATE TABLE IF NOT EXISTS acompanhamento_financeiro_movimentacoes (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  acompanhamento_id UUID         NOT NULL REFERENCES acompanhamento_financeiro_semanal(id) ON DELETE CASCADE,
  empresa_id        UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  data_movimento    DATE         NOT NULL,
  tipo              TEXT         NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  categoria         TEXT,
  descricao         TEXT,
  valor             NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  comprovante_url   TEXT,
  criado_por        UUID         REFERENCES colaboradores(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_af_mov_acomp    ON acompanhamento_financeiro_movimentacoes(acompanhamento_id);
CREATE INDEX IF NOT EXISTS idx_af_mov_empresa  ON acompanhamento_financeiro_movimentacoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_af_mov_data     ON acompanhamento_financeiro_movimentacoes(data_movimento);
CREATE INDEX IF NOT EXISTS idx_af_mov_tipo     ON acompanhamento_financeiro_movimentacoes(tipo);

-- ── TABELA 4: Saldos Diários ──────────────────────────────────
-- Registra o saldo ao final de cada dia da semana analisada.
CREATE TABLE IF NOT EXISTS acompanhamento_financeiro_saldos_diarios (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  acompanhamento_id UUID         NOT NULL REFERENCES acompanhamento_financeiro_semanal(id) ON DELETE CASCADE,
  empresa_id        UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  data_referencia   DATE         NOT NULL,
  saldo_dia         NUMERIC(15,2) NOT NULL DEFAULT 0,
  criado_por        UUID         REFERENCES colaboradores(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(acompanhamento_id, data_referencia)
);

CREATE INDEX IF NOT EXISTS idx_af_saldos_acomp  ON acompanhamento_financeiro_saldos_diarios(acompanhamento_id);
CREATE INDEX IF NOT EXISTS idx_af_saldos_data   ON acompanhamento_financeiro_saldos_diarios(data_referencia);

-- ── TRIGGERS: updated_at automático ──────────────────────────
CREATE OR REPLACE FUNCTION atualizar_updated_at_af()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_af_config_updated ON acompanhamento_financeiro_config;
CREATE TRIGGER trg_af_config_updated
  BEFORE UPDATE ON acompanhamento_financeiro_config
  FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at_af();

DROP TRIGGER IF EXISTS trg_af_semanal_updated ON acompanhamento_financeiro_semanal;
CREATE TRIGGER trg_af_semanal_updated
  BEFORE UPDATE ON acompanhamento_financeiro_semanal
  FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at_af();

DROP TRIGGER IF EXISTS trg_af_mov_updated ON acompanhamento_financeiro_movimentacoes;
CREATE TRIGGER trg_af_mov_updated
  BEFORE UPDATE ON acompanhamento_financeiro_movimentacoes
  FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at_af();

DROP TRIGGER IF EXISTS trg_af_saldos_updated ON acompanhamento_financeiro_saldos_diarios;
CREATE TRIGGER trg_af_saldos_updated
  BEFORE UPDATE ON acompanhamento_financeiro_saldos_diarios
  FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at_af();

-- ── PERMISSÃO: Coluna de acesso ao módulo financeiro ─────────
-- Adiciona coluna de permissão específica para o módulo,
-- seguindo o padrão de acesso_acompanhamento_bancario.
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS acesso_acompanhamento_financeiro BOOLEAN DEFAULT FALSE;

-- Administradores e gestores de crédito recebem acesso automático
UPDATE colaboradores
SET acesso_acompanhamento_financeiro = TRUE
WHERE
  LOWER(TRIM(cargo)) IN ('administrador', 'admin', 'diretor', 'gestor_credito', 'gestor de credito')
  OR LOWER(TRIM(perfil)) IN ('administrador', 'admin', 'diretor', 'gestor_credito', 'gestor de credito');

-- ── FIM DA MIGRATION 024 ──────────────────────────────────────

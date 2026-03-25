-- ============================================================
-- DESTRAVA CRÉDITO — Schema Supabase
-- Área Restrita de Colaboradores
-- ============================================================

-- Extensão para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Tabela: colaboradores ───────────────────────────────────
-- Perfil estendido dos usuários autenticados via Supabase Auth
CREATE TABLE IF NOT EXISTS colaboradores (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  nome        TEXT NOT NULL,
  cargo       TEXT NOT NULL DEFAULT 'Analista de Crédito',
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Tabela: simulacoes_colaborador ─────────────────────────
-- Simulações de empréstimos criadas pelos colaboradores
CREATE TABLE IF NOT EXISTS simulacoes_colaborador (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  colaborador_id        UUID NOT NULL REFERENCES colaboradores(id) ON DELETE SET NULL,

  -- Dados do cliente
  cliente_nome          TEXT NOT NULL,
  cliente_cpf_cnpj      TEXT NOT NULL,
  cliente_telefone      TEXT,
  cliente_email         TEXT,

  -- Parâmetros de entrada (inseridos manualmente pelo colaborador)
  valor_solicitado      NUMERIC(15,2) NOT NULL CHECK (valor_solicitado > 0),
  quantidade_parcelas   INTEGER NOT NULL CHECK (quantidade_parcelas BETWEEN 1 AND 360),
  taxa_juros_mensal     NUMERIC(8,4) NOT NULL CHECK (taxa_juros_mensal >= 0),  -- % ao mês
  imposto_percentual    NUMERIC(8,4) NOT NULL DEFAULT 0 CHECK (imposto_percentual >= 0),  -- IOF/outros
  comissao_percentual   NUMERIC(8,4) NOT NULL DEFAULT 0 CHECK (comissao_percentual >= 0), -- comissão Destrava

  -- Resultados calculados (armazenados para histórico)
  valor_parcela         NUMERIC(15,2) NOT NULL,
  total_juros           NUMERIC(15,2) NOT NULL,
  total_imposto         NUMERIC(15,2) NOT NULL,
  total_comissao        NUMERIC(15,2) NOT NULL,
  custo_efetivo_total   NUMERIC(8,4) NOT NULL,  -- CET % ao mês
  valor_total_pagar     NUMERIC(15,2) NOT NULL,

  -- Metadados
  banco                 TEXT,
  linha_credito         TEXT,
  observacoes           TEXT,
  status                TEXT NOT NULL DEFAULT 'rascunho'
                          CHECK (status IN ('rascunho','enviado','aprovado','reprovado')),

  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Índices ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_simulacoes_colaborador_id ON simulacoes_colaborador(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_simulacoes_cliente_cpf    ON simulacoes_colaborador(cliente_cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_simulacoes_status         ON simulacoes_colaborador(status);
CREATE INDEX IF NOT EXISTS idx_simulacoes_criado_em      ON simulacoes_colaborador(criado_em DESC);

-- ─── Trigger: atualizar atualizado_em automaticamente ────────
CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_colaboradores_atualizado_em ON colaboradores;
CREATE TRIGGER trg_colaboradores_atualizado_em
  BEFORE UPDATE ON colaboradores
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

DROP TRIGGER IF EXISTS trg_simulacoes_atualizado_em ON simulacoes_colaborador;
CREATE TRIGGER trg_simulacoes_atualizado_em
  BEFORE UPDATE ON simulacoes_colaborador
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- ─── Row Level Security (RLS) ────────────────────────────────
ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulacoes_colaborador ENABLE ROW LEVEL SECURITY;

-- Colaboradores: cada usuário vê e edita apenas seu próprio perfil
CREATE POLICY "colaborador_select_own" ON colaboradores
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "colaborador_update_own" ON colaboradores
  FOR UPDATE USING (auth.uid() = id);

-- Simulações: colaborador vê e edita apenas suas próprias simulações
CREATE POLICY "simulacoes_select_own" ON simulacoes_colaborador
  FOR SELECT USING (auth.uid() = colaborador_id);

CREATE POLICY "simulacoes_insert_own" ON simulacoes_colaborador
  FOR INSERT WITH CHECK (auth.uid() = colaborador_id);

CREATE POLICY "simulacoes_update_own" ON simulacoes_colaborador
  FOR UPDATE USING (auth.uid() = colaborador_id);

CREATE POLICY "simulacoes_delete_own" ON simulacoes_colaborador
  FOR DELETE USING (auth.uid() = colaborador_id);

-- ─── Função: criar perfil de colaborador ao registrar ────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO colaboradores (id, email, nome, cargo)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'cargo', 'Analista de Crédito')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── View: simulações com nome do colaborador ────────────────
CREATE OR REPLACE VIEW v_simulacoes_completas AS
SELECT
  s.*,
  c.nome AS colaborador_nome,
  c.cargo AS colaborador_cargo
FROM simulacoes_colaborador s
LEFT JOIN colaboradores c ON c.id = s.colaborador_id;

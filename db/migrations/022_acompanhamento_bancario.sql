-- 022_acompanhamento_bancario.sql
-- Módulo de Acompanhamento Bancário Semanal para preparação de crédito.
-- Executar manualmente no PostgreSQL antes/ao subir a feature.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS acompanhamentos_bancarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  empresa_id UUID NULL REFERENCES empresas(id) ON DELETE SET NULL,
  lead_id UUID NULL REFERENCES leads(id) ON DELETE SET NULL,

  nome_empresa TEXT NOT NULL,
  cnpj TEXT,
  tipo_cliente TEXT NOT NULL DEFAULT 'pj',

  banco_observado TEXT,
  agencia TEXT,
  conta TEXT,

  objetivo_credito TEXT,
  valor_credito_pretendido NUMERIC(14,2),
  linha_credito_pretendida TEXT,

  status TEXT NOT NULL DEFAULT 'em_acompanhamento',
  etapa TEXT NOT NULL DEFAULT 'inicio',

  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim_prevista DATE,
  prorrogado BOOLEAN NOT NULL DEFAULT false,
  data_prorrogacao DATE,
  data_fim_prorrogada DATE,

  responsavel_id UUID NULL REFERENCES colaboradores(id) ON DELETE SET NULL,

  rating_bacen_inicial TEXT,
  rating_interno_inicial TEXT,
  rating_bacen_atual TEXT,
  rating_interno_atual TEXT,

  faturamento_anual NUMERIC(14,2),
  media_mensal NUMERIC(14,2),
  margem_30 NUMERIC(14,2),

  proxima_atualizacao DATE,
  ultima_atualizacao_em TIMESTAMP,

  cliente_notificado_em TIMESTAMP,
  ultimo_lembrete_interno_em TIMESTAMP,

  observacoes_iniciais TEXT,
  observacoes_finais TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acompanhamento_bancario_atualizacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acompanhamento_id UUID NOT NULL REFERENCES acompanhamentos_bancarios(id) ON DELETE CASCADE,

  numero_semana INTEGER NOT NULL,
  periodo TEXT,
  data_referencia_inicio DATE,
  data_referencia_fim DATE,
  data_atualizacao DATE NOT NULL DEFAULT CURRENT_DATE,

  entrada_maquina NUMERIC(14,2) NOT NULL DEFAULT 0,
  entrada_pix NUMERIC(14,2) NOT NULL DEFAULT 0,
  entrada_boleto NUMERIC(14,2) NOT NULL DEFAULT 0,
  entrada_ted NUMERIC(14,2) NOT NULL DEFAULT 0,
  entrada_dinheiro NUMERIC(14,2) NOT NULL DEFAULT 0,
  outras_entradas NUMERIC(14,2) NOT NULL DEFAULT 0,

  total_entradas NUMERIC(14,2) GENERATED ALWAYS AS (
    entrada_maquina + entrada_pix + entrada_boleto + entrada_ted + entrada_dinheiro + outras_entradas
  ) STORED,

  total_saidas NUMERIC(14,2) NOT NULL DEFAULT 0,
  saldo_semanal NUMERIC(14,2) GENERATED ALWAYS AS (
    entrada_maquina + entrada_pix + entrada_boleto + entrada_ted + entrada_dinheiro + outras_entradas - total_saidas
  ) STORED,

  saldo_medio NUMERIC(14,2) NOT NULL DEFAULT 0,
  saldo_final NUMERIC(14,2) NOT NULL DEFAULT 0,
  quantidade_transacoes INTEGER NOT NULL DEFAULT 0,

  rating_bacen TEXT,
  rating_interno TEXT,

  restricao_scr TEXT,
  restricao_cenprot TEXT,
  restricao_serasa TEXT,
  cnd_regular TEXT,
  pld_aml TEXT,
  operacao_suspeita_coaf TEXT,

  restricao_nova BOOLEAN NOT NULL DEFAULT false,
  devolucao_ou_estorno BOOLEAN NOT NULL DEFAULT false,
  ocorrencia_negativa BOOLEAN NOT NULL DEFAULT false,

  status TEXT NOT NULL DEFAULT 'registrada',
  analise_semana TEXT,
  orientacao_cliente TEXT,
  proxima_acao TEXT,

  criado_por UUID NULL REFERENCES colaboradores(id) ON DELETE SET NULL,

  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),

  UNIQUE (acompanhamento_id, numero_semana)
);

CREATE TABLE IF NOT EXISTS acompanhamento_bancario_alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acompanhamento_id UUID NOT NULL REFERENCES acompanhamentos_bancarios(id) ON DELETE CASCADE,

  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT,
  data_alerta DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  responsavel_id UUID NULL REFERENCES colaboradores(id) ON DELETE SET NULL,

  created_at TIMESTAMP NOT NULL DEFAULT now(),
  resolvido_em TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_acomp_banc_empresa ON acompanhamentos_bancarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_acomp_banc_status ON acompanhamentos_bancarios(status);
CREATE INDEX IF NOT EXISTS idx_acomp_banc_proxima ON acompanhamentos_bancarios(proxima_atualizacao);
CREATE INDEX IF NOT EXISTS idx_acomp_banc_resp ON acompanhamentos_bancarios(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_acomp_banc_updates_acomp ON acompanhamento_bancario_atualizacoes(acompanhamento_id);
CREATE INDEX IF NOT EXISTS idx_acomp_banc_alertas_status ON acompanhamento_bancario_alertas(status, data_alerta);

CREATE OR REPLACE FUNCTION atualizar_updated_at_acompanhamento_bancario()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_acomp_banc_updated ON acompanhamentos_bancarios;
CREATE TRIGGER trg_acomp_banc_updated
BEFORE UPDATE ON acompanhamentos_bancarios
FOR EACH ROW
EXECUTE FUNCTION atualizar_updated_at_acompanhamento_bancario();

DROP TRIGGER IF EXISTS trg_acomp_banc_atualizacoes_updated ON acompanhamento_bancario_atualizacoes;
CREATE TRIGGER trg_acomp_banc_atualizacoes_updated
BEFORE UPDATE ON acompanhamento_bancario_atualizacoes
FOR EACH ROW
EXECUTE FUNCTION atualizar_updated_at_acompanhamento_bancario();

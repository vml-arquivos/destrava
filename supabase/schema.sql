-- ============================================================
-- DESTRAVA CRÉDITO — Schema SQL Completo
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

-- ─── Extensões ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Tabela: colaboradores ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.colaboradores (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT UNIQUE NOT NULL,
  nome        TEXT NOT NULL DEFAULT '',
  cargo       TEXT NOT NULL DEFAULT 'Analista',
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaboradores podem ver seus próprios dados"
  ON public.colaboradores FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Colaboradores podem atualizar seus próprios dados"
  ON public.colaboradores FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Qualquer usuário autenticado pode inserir seu próprio perfil"
  ON public.colaboradores FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ─── Tabela: clientes ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clientes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome                TEXT NOT NULL,
  empresa             TEXT,
  cpf_cnpj            TEXT,
  telefone            TEXT NOT NULL,
  email               TEXT,
  tipo                TEXT NOT NULL DEFAULT 'pj' CHECK (tipo IN ('pf', 'pj')),
  cidade              TEXT,
  estado              TEXT,
  faturamento_anual   NUMERIC(15,2),
  segmento            TEXT,
  status              TEXT NOT NULL DEFAULT 'lead'
                        CHECK (status IN ('lead','contato','analise','aprovado','reprovado','cancelado','convertido')),
  origem              TEXT NOT NULL DEFAULT 'manual',
  prioridade          TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta')),
  observacoes         TEXT,
  proximo_contato     DATE,
  colaborador_id      UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  n8n_notificado      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaboradores autenticados podem ver clientes"
  ON public.clientes FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Colaboradores autenticados podem inserir clientes"
  ON public.clientes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Colaboradores autenticados podem atualizar clientes"
  ON public.clientes FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Colaboradores autenticados podem excluir clientes"
  ON public.clientes FOR DELETE
  USING (auth.role() = 'authenticated');

-- ─── Tabela: atividades_crm ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.atividades_crm (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id      UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  colaborador_id  UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  tipo            TEXT NOT NULL DEFAULT 'nota'
                    CHECK (tipo IN ('ligacao','email','whatsapp','reuniao','nota','simulacao','status_change')),
  descricao       TEXT NOT NULL,
  resultado       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.atividades_crm ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaboradores autenticados podem ver atividades"
  ON public.atividades_crm FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Colaboradores autenticados podem inserir atividades"
  ON public.atividades_crm FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ─── Tabela: leads ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome            TEXT NOT NULL,
  telefone        TEXT NOT NULL,
  empresa         TEXT,
  email           TEXT,
  cpf_cnpj        TEXT,
  tipo_pessoa     TEXT DEFAULT 'pj',
  produto         TEXT,
  valor_desejado  NUMERIC(15,2),
  prazo           INTEGER,
  finalidade      TEXT,
  mensagem        TEXT,
  status          TEXT NOT NULL DEFAULT 'novo'
                    CHECK (status IN ('novo','contatado','em_negociacao','convertido','perdido')),
  origem          TEXT NOT NULL DEFAULT 'simulador',
  n8n_notificado  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inserção pública de leads"
  ON public.leads FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Colaboradores autenticados podem ver leads"
  ON public.leads FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Colaboradores autenticados podem atualizar leads"
  ON public.leads FOR UPDATE
  USING (auth.role() = 'authenticated');

-- ─── Tabela: simulacoes_colaborador ──────────────────────────
CREATE TABLE IF NOT EXISTS public.simulacoes_colaborador (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  colaborador_id      UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  cliente_id          UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome        TEXT NOT NULL,
  cliente_empresa     TEXT,
  cliente_cpf_cnpj    TEXT,
  cliente_telefone    TEXT,
  valor_credito       NUMERIC(15,2) NOT NULL,
  prazo_meses         INTEGER NOT NULL,
  taxa_juros_mensal   NUMERIC(8,4) NOT NULL,
  -- Campos fiscais/comissão
  valor_fiscal        NUMERIC(15,2),
  pct_imposto         NUMERIC(6,4),
  imposto_valor       NUMERIC(15,2),
  pct_comissao        NUMERIC(6,4),
  comissao_valor      NUMERIC(15,2),
  -- Resultados
  parcela_mensal      NUMERIC(15,2) NOT NULL,
  total_emprestimo    NUMERIC(15,2) NOT NULL,
  total_juros         NUMERIC(15,2) NOT NULL,
  custo_total         NUMERIC(15,2) NOT NULL,
  cet_mensal          NUMERIC(8,4),
  cet_anual           NUMERIC(8,4),
  -- Metadados
  banco               TEXT,
  linha_credito       TEXT,
  observacoes         TEXT,
  cenario             TEXT DEFAULT 'sem_imposto' CHECK (cenario IN ('com_imposto','sem_imposto')),
  status              TEXT NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente','em_analise','aprovado','reprovado','cancelado')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.simulacoes_colaborador ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaboradores veem suas próprias simulações"
  ON public.simulacoes_colaborador FOR SELECT
  USING (auth.uid() = colaborador_id);

CREATE POLICY "Colaboradores inserem suas próprias simulações"
  ON public.simulacoes_colaborador FOR INSERT
  WITH CHECK (auth.uid() = colaborador_id);

CREATE POLICY "Colaboradores atualizam suas próprias simulações"
  ON public.simulacoes_colaborador FOR UPDATE
  USING (auth.uid() = colaborador_id);

CREATE POLICY "Colaboradores excluem suas próprias simulações"
  ON public.simulacoes_colaborador FOR DELETE
  USING (auth.uid() = colaborador_id);

-- ─── Índices ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clientes_status ON public.clientes(status);
CREATE INDEX IF NOT EXISTS idx_clientes_prioridade ON public.clientes(prioridade);
CREATE INDEX IF NOT EXISTS idx_clientes_created_at ON public.clientes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atividades_cliente_id ON public.atividades_crm(cliente_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_simulacoes_colaborador_id ON public.simulacoes_colaborador(colaborador_id);

-- ─── Trigger: updated_at automático ──────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clientes_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_simulacoes_updated_at
  BEFORE UPDATE ON public.simulacoes_colaborador
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Trigger: criar colaborador ao registrar usuário ─────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.colaboradores (id, email, nome, cargo)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'cargo', 'Analista')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Inserir colaborador Vilson Marcio (se não existir) ───────
-- Substitua o UUID abaixo pelo ID real do usuário no Supabase Auth
-- Para encontrar: Authentication > Users > copie o UUID do vilsonmarcio@gmail.com
-- INSERT INTO public.colaboradores (id, email, nome, cargo)
-- VALUES ('SEU-UUID-AQUI', 'vilsonmarcio@gmail.com', 'Vilson Marcio', 'Administrador')
-- ON CONFLICT (id) DO UPDATE SET nome = 'Vilson Marcio', cargo = 'Administrador';


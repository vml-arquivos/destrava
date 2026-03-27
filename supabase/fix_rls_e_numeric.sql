-- ============================================================
-- FIX: RLS policies + numeric overflow
-- Aplicar no Supabase SQL Editor
-- Projeto: Destrava — destrava.permupay.com.br
-- Data: 2026-03-27
-- ============================================================

-- ─── 1. CORRIGIR OVERFLOW NUMÉRICO em simulacoes_colaborador ─────────────────
-- As colunas estavam como NUMERIC(8,4) → máximo 9999.9999
-- Simulações reais têm valores como R$ 50.000 a R$ 5.000.000
-- Corrigindo para NUMERIC(15,2) → suporta até 9.999.999.999.999,99

ALTER TABLE simulacoes_colaborador
  ALTER COLUMN valor_solicitado    TYPE NUMERIC(15,2),
  ALTER COLUMN valor_parcela       TYPE NUMERIC(15,2),
  ALTER COLUMN valor_total_pagar   TYPE NUMERIC(15,2),
  ALTER COLUMN total_juros         TYPE NUMERIC(15,2),
  ALTER COLUMN custo_efetivo_total TYPE NUMERIC(15,2),
  ALTER COLUMN total_imposto       TYPE NUMERIC(15,2),
  ALTER COLUMN total_comissao      TYPE NUMERIC(15,2);

-- taxa_juros_mensal, imposto_percentual, comissao_percentual são percentuais
-- (ex: 1.5%) — NUMERIC(8,4) é suficiente para esses, não alterar

-- ─── 2. POLÍTICAS RLS — simulacoes_colaborador ───────────────────────────────
-- Colaboradores autenticados podem inserir, ler, atualizar e deletar
-- apenas suas próprias simulações (colaborador_id = auth.uid())

DROP POLICY IF EXISTS "colaborador_select_simulacoes"  ON simulacoes_colaborador;
DROP POLICY IF EXISTS "colaborador_insert_simulacoes"  ON simulacoes_colaborador;
DROP POLICY IF EXISTS "colaborador_update_simulacoes"  ON simulacoes_colaborador;
DROP POLICY IF EXISTS "colaborador_delete_simulacoes"  ON simulacoes_colaborador;

CREATE POLICY "colaborador_select_simulacoes"
  ON simulacoes_colaborador FOR SELECT
  TO authenticated
  USING (colaborador_id = auth.uid());

CREATE POLICY "colaborador_insert_simulacoes"
  ON simulacoes_colaborador FOR INSERT
  TO authenticated
  WITH CHECK (colaborador_id = auth.uid());

CREATE POLICY "colaborador_update_simulacoes"
  ON simulacoes_colaborador FOR UPDATE
  TO authenticated
  USING (colaborador_id = auth.uid());

CREATE POLICY "colaborador_delete_simulacoes"
  ON simulacoes_colaborador FOR DELETE
  TO authenticated
  USING (colaborador_id = auth.uid());

-- ─── 3. POLÍTICAS RLS — leads ────────────────────────────────────────────────
-- Colaboradores autenticados podem ver e inserir todos os leads
-- (leads são compartilhados entre a equipe)

DROP POLICY IF EXISTS "colaborador_select_leads"  ON leads;
DROP POLICY IF EXISTS "colaborador_insert_leads"  ON leads;
DROP POLICY IF EXISTS "colaborador_update_leads"  ON leads;
DROP POLICY IF EXISTS "colaborador_delete_leads"  ON leads;
DROP POLICY IF EXISTS "anon_insert_leads"         ON leads;

-- Leitura e edição: apenas autenticados
CREATE POLICY "colaborador_select_leads"
  ON leads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "colaborador_insert_leads"
  ON leads FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "colaborador_update_leads"
  ON leads FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "colaborador_delete_leads"
  ON leads FOR DELETE
  TO authenticated
  USING (true);

-- Inserção pública (formulários do site — anon)
CREATE POLICY "anon_insert_leads"
  ON leads FOR INSERT
  TO anon
  WITH CHECK (origem IN ('simulador_publico', 'contato_site', 'formulario_site'));

-- ─── 4. POLÍTICAS RLS — crm_atividades ───────────────────────────────────────

DROP POLICY IF EXISTS "colaborador_select_crm_atividades"  ON crm_atividades;
DROP POLICY IF EXISTS "colaborador_insert_crm_atividades"  ON crm_atividades;
DROP POLICY IF EXISTS "colaborador_update_crm_atividades"  ON crm_atividades;
DROP POLICY IF EXISTS "colaborador_delete_crm_atividades"  ON crm_atividades;

CREATE POLICY "colaborador_select_crm_atividades"
  ON crm_atividades FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "colaborador_insert_crm_atividades"
  ON crm_atividades FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "colaborador_update_crm_atividades"
  ON crm_atividades FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "colaborador_delete_crm_atividades"
  ON crm_atividades FOR DELETE
  TO authenticated
  USING (true);

-- ─── 5. POLÍTICAS RLS — crm_documentos ───────────────────────────────────────

DROP POLICY IF EXISTS "colaborador_select_crm_documentos"  ON crm_documentos;
DROP POLICY IF EXISTS "colaborador_insert_crm_documentos"  ON crm_documentos;
DROP POLICY IF EXISTS "colaborador_update_crm_documentos"  ON crm_documentos;
DROP POLICY IF EXISTS "colaborador_delete_crm_documentos"  ON crm_documentos;

CREATE POLICY "colaborador_select_crm_documentos"
  ON crm_documentos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "colaborador_insert_crm_documentos"
  ON crm_documentos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "colaborador_update_crm_documentos"
  ON crm_documentos FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "colaborador_delete_crm_documentos"
  ON crm_documentos FOR DELETE
  TO authenticated
  USING (true);

-- ─── 6. POLÍTICAS RLS — crm_qualificacoes_ia ─────────────────────────────────

DROP POLICY IF EXISTS "colaborador_select_crm_qualificacoes_ia"  ON crm_qualificacoes_ia;
DROP POLICY IF EXISTS "colaborador_insert_crm_qualificacoes_ia"  ON crm_qualificacoes_ia;
DROP POLICY IF EXISTS "colaborador_update_crm_qualificacoes_ia"  ON crm_qualificacoes_ia;

CREATE POLICY "colaborador_select_crm_qualificacoes_ia"
  ON crm_qualificacoes_ia FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "colaborador_insert_crm_qualificacoes_ia"
  ON crm_qualificacoes_ia FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "colaborador_update_crm_qualificacoes_ia"
  ON crm_qualificacoes_ia FOR UPDATE
  TO authenticated
  USING (true);

-- ─── 7. POLÍTICAS RLS — colaboradores ────────────────────────────────────────
-- Colaboradores podem ler todos os colaboradores (para exibir nomes)
-- Apenas service_role pode inserir/alterar (via backend)

DROP POLICY IF EXISTS "colaborador_select_colaboradores"  ON colaboradores;

CREATE POLICY "colaborador_select_colaboradores"
  ON colaboradores FOR SELECT
  TO authenticated
  USING (true);

-- ─── 8. GARANTIR RLS ATIVO em todas as tabelas ───────────────────────────────

ALTER TABLE simulacoes_colaborador ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_atividades         ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_documentos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_qualificacoes_ia   ENABLE ROW LEVEL SECURITY;
ALTER TABLE colaboradores          ENABLE ROW LEVEL SECURITY;

-- ─── FIM ─────────────────────────────────────────────────────────────────────
-- Após executar este SQL:
-- 1. Teste salvar uma simulação na Calculadora → deve funcionar
-- 2. Teste adicionar um cliente em Clientes → deve funcionar
-- 3. Verifique o dashboard: leads e simulações devem aparecer

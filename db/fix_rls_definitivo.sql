-- ============================================================
-- DESTRAVA — FIX RLS DEFINITIVO
-- Execute este arquivo completo no Supabase SQL Editor
-- Projeto: destrava.permupay.com.br
-- Data: 2026-03-27
-- ============================================================
-- O que este script faz:
--   1. Garante RLS ativo em todas as tabelas do painel
--   2. Remove políticas antigas (se existirem) para evitar conflito
--   3. Cria políticas corretas para o role "authenticated"
--   4. Libera INSERT anônimo em "leads" para formulários do site
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- TABELA: simulacoes_colaborador
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.simulacoes_colaborador ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "colaborador_select_simulacoes" ON public.simulacoes_colaborador;
DROP POLICY IF EXISTS "colaborador_insert_simulacoes" ON public.simulacoes_colaborador;
DROP POLICY IF EXISTS "colaborador_update_simulacoes" ON public.simulacoes_colaborador;
DROP POLICY IF EXISTS "colaborador_delete_simulacoes" ON public.simulacoes_colaborador;

CREATE POLICY "colaborador_select_simulacoes"
  ON public.simulacoes_colaborador
  FOR SELECT TO authenticated
  USING (colaborador_id = auth.uid());

CREATE POLICY "colaborador_insert_simulacoes"
  ON public.simulacoes_colaborador
  FOR INSERT TO authenticated
  WITH CHECK (colaborador_id = auth.uid());

CREATE POLICY "colaborador_update_simulacoes"
  ON public.simulacoes_colaborador
  FOR UPDATE TO authenticated
  USING (colaborador_id = auth.uid());

CREATE POLICY "colaborador_delete_simulacoes"
  ON public.simulacoes_colaborador
  FOR DELETE TO authenticated
  USING (colaborador_id = auth.uid());


-- ════════════════════════════════════════════════════════════
-- TABELA: leads
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "colaborador_select_leads"  ON public.leads;
DROP POLICY IF EXISTS "colaborador_insert_leads"  ON public.leads;
DROP POLICY IF EXISTS "colaborador_update_leads"  ON public.leads;
DROP POLICY IF EXISTS "colaborador_delete_leads"  ON public.leads;
DROP POLICY IF EXISTS "anon_insert_leads"         ON public.leads;

CREATE POLICY "colaborador_select_leads"
  ON public.leads
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "colaborador_insert_leads"
  ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "colaborador_update_leads"
  ON public.leads
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "colaborador_delete_leads"
  ON public.leads
  FOR DELETE TO authenticated
  USING (true);

-- Formulários públicos do site (role anon)
CREATE POLICY "anon_insert_leads"
  ON public.leads
  FOR INSERT TO anon
  WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- TABELA: colaboradores
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "colaborador_select_colaboradores" ON public.colaboradores;
DROP POLICY IF EXISTS "colaborador_insert_colaboradores" ON public.colaboradores;
DROP POLICY IF EXISTS "colaborador_update_colaboradores" ON public.colaboradores;

CREATE POLICY "colaborador_select_colaboradores"
  ON public.colaboradores
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "colaborador_insert_colaboradores"
  ON public.colaboradores
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "colaborador_update_colaboradores"
  ON public.colaboradores
  FOR UPDATE TO authenticated
  USING (id = auth.uid());


-- ════════════════════════════════════════════════════════════
-- TABELA: crm_atividades
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.crm_atividades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "colaborador_select_crm_atividades" ON public.crm_atividades;
DROP POLICY IF EXISTS "colaborador_insert_crm_atividades" ON public.crm_atividades;
DROP POLICY IF EXISTS "colaborador_update_crm_atividades" ON public.crm_atividades;
DROP POLICY IF EXISTS "colaborador_delete_crm_atividades" ON public.crm_atividades;

CREATE POLICY "colaborador_select_crm_atividades"
  ON public.crm_atividades
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "colaborador_insert_crm_atividades"
  ON public.crm_atividades
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "colaborador_update_crm_atividades"
  ON public.crm_atividades
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "colaborador_delete_crm_atividades"
  ON public.crm_atividades
  FOR DELETE TO authenticated
  USING (true);


-- ════════════════════════════════════════════════════════════
-- TABELA: crm_documentos
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.crm_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "colaborador_select_crm_documentos" ON public.crm_documentos;
DROP POLICY IF EXISTS "colaborador_insert_crm_documentos" ON public.crm_documentos;
DROP POLICY IF EXISTS "colaborador_update_crm_documentos" ON public.crm_documentos;
DROP POLICY IF EXISTS "colaborador_delete_crm_documentos" ON public.crm_documentos;

CREATE POLICY "colaborador_select_crm_documentos"
  ON public.crm_documentos
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "colaborador_insert_crm_documentos"
  ON public.crm_documentos
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "colaborador_update_crm_documentos"
  ON public.crm_documentos
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "colaborador_delete_crm_documentos"
  ON public.crm_documentos
  FOR DELETE TO authenticated
  USING (true);


-- ════════════════════════════════════════════════════════════
-- TABELA: crm_qualificacoes_ia
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.crm_qualificacoes_ia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "colaborador_select_crm_qualificacoes_ia" ON public.crm_qualificacoes_ia;
DROP POLICY IF EXISTS "colaborador_insert_crm_qualificacoes_ia" ON public.crm_qualificacoes_ia;
DROP POLICY IF EXISTS "colaborador_update_crm_qualificacoes_ia" ON public.crm_qualificacoes_ia;

CREATE POLICY "colaborador_select_crm_qualificacoes_ia"
  ON public.crm_qualificacoes_ia
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "colaborador_insert_crm_qualificacoes_ia"
  ON public.crm_qualificacoes_ia
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "colaborador_update_crm_qualificacoes_ia"
  ON public.crm_qualificacoes_ia
  FOR UPDATE TO authenticated
  USING (true);


-- ════════════════════════════════════════════════════════════
-- TABELA: crm_conversas
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.crm_conversas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "colaborador_select_crm_conversas" ON public.crm_conversas;
DROP POLICY IF EXISTS "colaborador_insert_crm_conversas" ON public.crm_conversas;
DROP POLICY IF EXISTS "colaborador_update_crm_conversas" ON public.crm_conversas;

CREATE POLICY "colaborador_select_crm_conversas"
  ON public.crm_conversas
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "colaborador_insert_crm_conversas"
  ON public.crm_conversas
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "colaborador_update_crm_conversas"
  ON public.crm_conversas
  FOR UPDATE TO authenticated
  USING (true);


-- ════════════════════════════════════════════════════════════
-- TABELA: crm_mensagens
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.crm_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "colaborador_select_crm_mensagens" ON public.crm_mensagens;
DROP POLICY IF EXISTS "colaborador_insert_crm_mensagens" ON public.crm_mensagens;

CREATE POLICY "colaborador_select_crm_mensagens"
  ON public.crm_mensagens
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "colaborador_insert_crm_mensagens"
  ON public.crm_mensagens
  FOR INSERT TO authenticated
  WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- TABELA: crm_historico_funil
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.crm_historico_funil ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "colaborador_select_crm_historico_funil" ON public.crm_historico_funil;
DROP POLICY IF EXISTS "colaborador_insert_crm_historico_funil" ON public.crm_historico_funil;

CREATE POLICY "colaborador_select_crm_historico_funil"
  ON public.crm_historico_funil
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "colaborador_insert_crm_historico_funil"
  ON public.crm_historico_funil
  FOR INSERT TO authenticated
  WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- TABELA: crm_metas
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.crm_metas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "colaborador_select_crm_metas" ON public.crm_metas;
DROP POLICY IF EXISTS "colaborador_insert_crm_metas" ON public.crm_metas;
DROP POLICY IF EXISTS "colaborador_update_crm_metas" ON public.crm_metas;

CREATE POLICY "colaborador_select_crm_metas"
  ON public.crm_metas
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "colaborador_insert_crm_metas"
  ON public.crm_metas
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "colaborador_update_crm_metas"
  ON public.crm_metas
  FOR UPDATE TO authenticated
  USING (true);


-- ════════════════════════════════════════════════════════════
-- TABELA: crm_eventos_webhook
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.crm_eventos_webhook ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "colaborador_select_crm_eventos_webhook" ON public.crm_eventos_webhook;
DROP POLICY IF EXISTS "service_insert_crm_eventos_webhook"     ON public.crm_eventos_webhook;

CREATE POLICY "colaborador_select_crm_eventos_webhook"
  ON public.crm_eventos_webhook
  FOR SELECT TO authenticated
  USING (true);

-- n8n usa service_role (bypass RLS), mas por segurança:
CREATE POLICY "service_insert_crm_eventos_webhook"
  ON public.crm_eventos_webhook
  FOR INSERT TO authenticated
  WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- TABELAS n8n (sem RLS — usadas apenas pelo service_role)
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.n8n_fila_mensagens      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.n8n_historico_mensagens DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.n8n_status_atendimento  DISABLE ROW LEVEL SECURITY;


-- ════════════════════════════════════════════════════════════
-- FIM
-- ════════════════════════════════════════════════════════════
-- Após executar:
--   1. Salvar simulação na Calculadora → deve funcionar
--   2. Adicionar cliente em Clientes    → deve funcionar
--   3. Dashboard: leads e simulações    → devem aparecer
--   4. CRM Pipeline                     → deve carregar
-- ════════════════════════════════════════════════════════════

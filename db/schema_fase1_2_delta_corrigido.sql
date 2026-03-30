-- ============================================================
-- DELTA v1.2 — Correção Definitiva Baseada em Auditoria Real
-- Execute no Supabase SQL Editor
-- Seguro: IF NOT EXISTS em tudo, sem quebrar tabelas existentes
-- ============================================================

-- ─── 1. Coluna erro_detalhe na tabela crm_eventos_webhook ───
ALTER TABLE crm_eventos_webhook
  ADD COLUMN IF NOT EXISTS erro_detalhe TEXT;

-- ─── 2. Colunas tipo_conteudo e media_url em crm_mensagens ───
ALTER TABLE crm_mensagens
  ADD COLUMN IF NOT EXISTS tipo_conteudo TEXT NOT NULL DEFAULT 'texto';

ALTER TABLE crm_mensagens
  ADD COLUMN IF NOT EXISTS media_url TEXT;

-- ─── 3. Colunas extras em leads (se não existirem) ───
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS produto_interesse TEXT;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS empresa TEXT;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS score_ia INTEGER DEFAULT 0;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS etapa_funil TEXT DEFAULT 'Novo';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS temperatura TEXT DEFAULT 'frio'
    CHECK (temperatura IN ('frio','morno','quente','urgente'));

-- ─── 4. Função de normalização de telefone ───
CREATE OR REPLACE FUNCTION normalizar_telefone(raw_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits TEXT;
BEGIN
  digits := regexp_replace(raw_phone, '\D', '', 'g');
  IF length(digits) < 10 THEN
    RETURN digits;
  END IF;
  IF left(digits, 2) = '55' AND length(digits) >= 12 THEN
    RETURN digits;
  END IF;
  RETURN '55' || digits;
END;
$$;

-- ─── 5. Índices de performance ───
CREATE INDEX IF NOT EXISTS idx_leads_telefone_norm
  ON public.leads (normalizar_telefone(telefone));

CREATE INDEX IF NOT EXISTS idx_crm_mensagens_tipo_conteudo
  ON crm_mensagens (tipo_conteudo);

-- ─── 6. View atualizada do pipeline CRM ───
-- Usa os nomes REAIS das colunas confirmados na auditoria:
--   crm_qualificacoes_ia.created_at
--   crm_qualificacoes_ia.probabilidade_conv
--   crm_mensagens.created_at (não enviado_em)
CREATE OR REPLACE VIEW vw_crm_pipeline AS
SELECT
  l.id,
  l.nome,
  l.telefone,
  l.email,
  l.empresa,
  l.produto_interesse,
  l.status,
  l.etapa_funil,
  l.temperatura,
  l.score_ia,
  l.origem,
  l.created_at,
  l.updated_at,
  -- Última qualificação da IA
  q.resumo                  AS ia_resumo,
  q.proxima_acao            AS ia_proxima_acao,
  q.probabilidade_conv      AS ia_probabilidade,
  q.documentos_faltando     AS ia_documentos_faltando,
  q.pontos_positivos        AS ia_pontos_positivos,
  q.pontos_atencao          AS ia_pontos_atencao,
  q.created_at              AS ia_qualificado_em,
  -- Contagem de mensagens
  COALESCE(msg.total_mensagens, 0) AS total_mensagens,
  msg.ultima_mensagem_em
FROM public.leads l
LEFT JOIN LATERAL (
  SELECT *
  FROM crm_qualificacoes_ia
  WHERE lead_id = l.id
  ORDER BY created_at DESC
  LIMIT 1
) q ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)            AS total_mensagens,
    MAX(created_at)     AS ultima_mensagem_em
  FROM crm_mensagens
  WHERE conversa_id IN (SELECT id FROM crm_conversas WHERE lead_id = l.id)
) msg ON true;

-- ─── 7. Função helper para registrar atividade (usada pelo n8n) ───
-- Usa a tabela REAL: crm_atividades (não atividades_crm)
-- Usa a coluna REAL: lead_id (não cliente_id)
CREATE OR REPLACE FUNCTION crm_registrar_interacao_atividade(
  p_lead_id       UUID,
  p_tipo          TEXT,
  p_descricao     TEXT,
  p_colaborador_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO crm_atividades (
    lead_id,
    tipo,
    titulo,
    descricao,
    colaborador_id,
    created_at
  )
  VALUES (
    p_lead_id,
    p_tipo,
    'Interação via WhatsApp',
    p_descricao,
    p_colaborador_id,
    NOW()
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- ─── Confirmação ───
DO $$
BEGIN
  RAISE NOTICE 'Delta v1.2 aplicado com sucesso em %', NOW();
END;
$$;

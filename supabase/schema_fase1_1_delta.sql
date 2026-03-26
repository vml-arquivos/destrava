-- ============================================================
-- DELTA v1.1 — Blindagem Operacional
-- Execute no Supabase SQL Editor
-- Seguro: IF NOT EXISTS em tudo, sem quebrar tabelas existentes
-- ============================================================

-- ─── 1. Coluna erro_detalhe na tabela crm_eventos_webhook ───
-- Necessária para o Bloco D (tratamento de erro) do workflow n8n
ALTER TABLE crm_eventos_webhook
  ADD COLUMN IF NOT EXISTS erro_detalhe TEXT;

-- ─── 2. Coluna tipo_conteudo em crm_mensagens ───
-- Necessária para o Bloco B (tipo: texto, audio, imagem, video, documento)
ALTER TABLE crm_mensagens
  ADD COLUMN IF NOT EXISTS tipo_conteudo TEXT NOT NULL DEFAULT 'texto';

-- ─── 3. Coluna media_url em crm_mensagens ───
-- Armazena URL de áudio, imagem ou documento recebido
ALTER TABLE crm_mensagens
  ADD COLUMN IF NOT EXISTS media_url TEXT;

-- ─── 4. Função de normalização de telefone ───
-- Garante formato E.164 brasileiro (55 + 11 dígitos)
CREATE OR REPLACE FUNCTION normalizar_telefone(raw_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits TEXT;
BEGIN
  -- Remove tudo que não é dígito
  digits := regexp_replace(raw_phone, '\D', '', 'g');

  -- Vazio ou muito curto: retorna como está
  IF length(digits) < 10 THEN
    RETURN digits;
  END IF;

  -- Já tem DDI 55: retorna como está
  IF left(digits, 2) = '55' AND length(digits) >= 12 THEN
    RETURN digits;
  END IF;

  -- Tem 11 dígitos (DDD + número com 9): adiciona 55
  IF length(digits) = 11 THEN
    RETURN '55' || digits;
  END IF;

  -- Tem 10 dígitos (DDD + número sem 9): adiciona 55
  IF length(digits) = 10 THEN
    RETURN '55' || digits;
  END IF;

  RETURN digits;
END;
$$;

-- ─── 5. Índice para busca por telefone normalizado em leads ───
CREATE INDEX IF NOT EXISTS idx_leads_telefone_norm
  ON leads (normalizar_telefone(telefone));

-- ─── 6. Índice para tipo_conteudo em crm_mensagens ───
CREATE INDEX IF NOT EXISTS idx_crm_mensagens_tipo_conteudo
  ON crm_mensagens (tipo_conteudo);

-- ─── 7. Coluna produto_interesse em leads (se não existir) ───
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS produto_interesse TEXT;

-- ─── 8. Coluna empresa em leads (se não existir) ───
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS empresa TEXT;

-- ─── 9. View atualizada do pipeline CRM ───
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
  q.resumo              AS ia_resumo,
  q.proxima_acao        AS ia_proxima_acao,
  q.probabilidade_conversao AS ia_probabilidade,
  q.documentos_faltando AS ia_documentos_faltando,
  q.pontos_positivos    AS ia_pontos_positivos,
  q.pontos_atencao      AS ia_pontos_atencao,
  q.qualificado_em      AS ia_qualificado_em,
  -- Contagem de mensagens
  COALESCE(msg.total_mensagens, 0) AS total_mensagens,
  -- Última mensagem
  msg.ultima_mensagem_em
FROM leads l
LEFT JOIN LATERAL (
  SELECT *
  FROM crm_qualificacoes_ia
  WHERE lead_id = l.id
  ORDER BY qualificado_em DESC
  LIMIT 1
) q ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS total_mensagens,
    MAX(enviado_em) AS ultima_mensagem_em
  FROM crm_mensagens
  WHERE lead_id = l.id
) msg ON true;

-- ─── 10. Função helper para registrar atividade (usada pelo n8n) ───
CREATE OR REPLACE FUNCTION crm_registrar_interacao_atividade(
  p_lead_id     INTEGER,
  p_tipo        TEXT,
  p_descricao   TEXT,
  p_colaborador_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO atividades_crm (
    cliente_id,
    tipo,
    descricao,
    colaborador_id,
    created_at
  )
  VALUES (
    p_lead_id,
    p_tipo,
    p_descricao,
    p_colaborador_id,
    NOW()
  );
EXCEPTION WHEN OTHERS THEN
  -- Silencia erros para não quebrar o fluxo principal
  NULL;
END;
$$;

-- ─── Confirmação ───
DO $$
BEGIN
  RAISE NOTICE 'Delta v1.1 aplicado com sucesso em %', NOW();
END;
$$;

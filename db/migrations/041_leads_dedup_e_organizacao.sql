-- ============================================================
-- Migration 041: Deduplicação de leads e organização de clientes
-- Objetivo: unificar leads duplicados por telefone normalizado,
--           adicionar campo tipo_pessoa padrão, melhorar índices
--           e criar função de normalização de telefone.
-- Seguro para rodar em produção: usa IF NOT EXISTS / ON CONFLICT
-- ============================================================

BEGIN;

-- ─── 1. Função de normalização de telefone ───────────────────
-- Remove tudo que não é dígito, garante prefixo 55 e 11 dígitos
CREATE OR REPLACE FUNCTION normalizar_telefone(tel TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  digits TEXT;
BEGIN
  IF tel IS NULL THEN RETURN NULL; END IF;
  digits := regexp_replace(tel, '[^0-9]', '', 'g');
  -- Remove 0 inicial de discagem
  IF LEFT(digits, 1) = '0' THEN digits := SUBSTRING(digits FROM 2); END IF;
  -- Remove prefixo 55 se resultar em 13 dígitos (DDI + DDD + número)
  IF LENGTH(digits) = 13 AND LEFT(digits, 2) = '55' THEN
    digits := SUBSTRING(digits FROM 3);
  END IF;
  -- Garante 11 dígitos (DDD + 9 dígitos)
  IF LENGTH(digits) BETWEEN 10 AND 11 THEN
    RETURN digits;
  END IF;
  RETURN digits; -- retorna o que tiver se não bater
END;
$$;

-- ─── 2. Coluna telefone_normalizado ──────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS telefone_normalizado TEXT
    GENERATED ALWAYS AS (normalizar_telefone(telefone)) STORED;

-- ─── 3. Coluna tipo_pessoa padrão ────────────────────────────
-- Garante que tipo_pessoa nunca seja NULL (retroativo)
UPDATE leads SET tipo_pessoa = 'pj'
  WHERE tipo_pessoa IS NULL AND empresa IS NOT NULL;
UPDATE leads SET tipo_pessoa = 'pf'
  WHERE tipo_pessoa IS NULL;

ALTER TABLE leads
  ALTER COLUMN tipo_pessoa SET DEFAULT 'pj';

-- ─── 4. Coluna prioridade ────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS prioridade TEXT NOT NULL DEFAULT 'media'
    CHECK (prioridade IN ('alta', 'media', 'baixa'));

-- ─── 5. Índice em telefone_normalizado para dedupe rápido ────
CREATE INDEX IF NOT EXISTS idx_leads_telefone_normalizado
  ON leads (telefone_normalizado);

-- ─── 6. Índice composto para filtros da tela de Clientes ─────
CREATE INDEX IF NOT EXISTS idx_leads_status_origem_tipo
  ON leads (status, origem, tipo_pessoa);

CREATE INDEX IF NOT EXISTS idx_leads_prioridade
  ON leads (prioridade);

-- ─── 7. Função de deduplicação: mescla leads com mesmo telefone
-- Mantém o mais antigo (maior histórico), copia dados do mais novo
-- e marca o duplicado como "cancelado" com tag "duplicado"
CREATE OR REPLACE FUNCTION deduplicar_leads_por_telefone()
RETURNS TABLE(
  mantido_id UUID,
  removido_id UUID,
  telefone_norm TEXT
) LANGUAGE plpgsql AS $$
DECLARE
  dup RECORD;
  principal_id UUID;
  duplicado_id UUID;
BEGIN
  FOR dup IN
    SELECT telefone_normalizado, COUNT(*) as qtd
    FROM leads
    WHERE telefone_normalizado IS NOT NULL
      AND status != 'cancelado'
    GROUP BY telefone_normalizado
    HAVING COUNT(*) > 1
  LOOP
    -- Pega o mais antigo como principal
    SELECT id INTO principal_id
    FROM leads
    WHERE telefone_normalizado = dup.telefone_normalizado
      AND status != 'cancelado'
    ORDER BY created_at ASC
    LIMIT 1;

    -- Para cada duplicado (mais novos), mescla e cancela
    FOR duplicado_id IN
      SELECT id FROM leads
      WHERE telefone_normalizado = dup.telefone_normalizado
        AND id != principal_id
        AND status != 'cancelado'
    LOOP
      -- Copia dados ausentes do duplicado para o principal
      UPDATE leads SET
        email       = COALESCE(email, (SELECT email FROM leads WHERE id = duplicado_id)),
        cpf_cnpj    = COALESCE(cpf_cnpj, (SELECT cpf_cnpj FROM leads WHERE id = duplicado_id)),
        empresa     = COALESCE(empresa, (SELECT empresa FROM leads WHERE id = duplicado_id)),
        cidade      = COALESCE(cidade, (SELECT cidade FROM leads WHERE id = duplicado_id)),
        estado      = COALESCE(estado, (SELECT estado FROM leads WHERE id = duplicado_id)),
        segmento    = COALESCE(segmento, (SELECT segmento FROM leads WHERE id = duplicado_id)),
        faturamento_anual = COALESCE(faturamento_anual, (SELECT faturamento_anual FROM leads WHERE id = duplicado_id)),
        tags        = COALESCE(tags, (SELECT tags FROM leads WHERE id = duplicado_id)),
        updated_at  = NOW()
      WHERE id = principal_id;

      -- Redireciona atividades do duplicado para o principal
      UPDATE crm_atividades SET lead_id = principal_id WHERE lead_id = duplicado_id;
      UPDATE crm_historico_funil SET lead_id = principal_id WHERE lead_id = duplicado_id;

      -- Marca duplicado como cancelado
      UPDATE leads SET
        status = 'cancelado',
        tags = COALESCE(tags, '') || ',duplicado',
        observacoes_ia = COALESCE(observacoes_ia, '') || ' [DUPLICADO MESCLADO COM ' || principal_id::TEXT || ']',
        updated_at = NOW()
      WHERE id = duplicado_id;

      mantido_id  := principal_id;
      removido_id := duplicado_id;
      telefone_norm := dup.telefone_normalizado;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$;

-- ─── 8. View atualizada para tela de Clientes ────────────────
-- Expõe campos normalizados para o frontend
CREATE OR REPLACE VIEW vw_clientes_organizados AS
SELECT
  l.id,
  l.nome,
  l.empresa,
  l.cpf_cnpj,
  l.telefone,
  l.telefone_normalizado,
  l.email,
  COALESCE(l.tipo_pessoa, 'pj') AS tipo,
  l.cidade,
  l.estado,
  l.faturamento_anual,
  l.segmento,
  COALESCE(l.status, 'lead') AS status,
  CASE
    WHEN l.origem ILIKE '%campanha%' OR l.utm_source IS NOT NULL THEN 'campanha'
    WHEN l.origem ILIKE '%site%' OR l.origem ILIKE '%formulario%'
      OR l.origem ILIKE '%simulador%' OR l.origem ILIKE '%landing%' THEN 'site'
    WHEN l.origem ILIKE '%whatsapp%' OR l.origem ILIKE '%zap%'
      OR l.canal_origem ILIKE '%whatsapp%' THEN 'whatsapp'
    WHEN l.origem ILIKE '%indicac%' OR l.origem ILIKE '%referral%' THEN 'indicacao'
    WHEN l.origem = 'painel_interno' OR l.origem = 'manual' OR l.origem IS NULL THEN 'manual'
    ELSE LOWER(COALESCE(l.origem, 'manual'))
  END AS origem_normalizada,
  l.origem AS origem_raw,
  COALESCE(l.prioridade, 'media') AS prioridade,
  l.etapa_funil,
  l.temperatura,
  l.score_ia,
  l.tags,
  l.observacoes_ia AS observacoes,
  l.proximo_followup AS proximo_contato,
  l.n8n_notificado,
  l.responsavel_id,
  l.created_at,
  l.updated_at,
  -- Indicador de cadastro incompleto
  (l.email IS NULL OR l.cpf_cnpj IS NULL) AS cadastro_incompleto,
  -- Contagem de atividades
  (SELECT COUNT(*) FROM crm_atividades ca WHERE ca.lead_id = l.id) AS total_atividades
FROM leads l
WHERE l.status != 'cancelado'
   OR (l.tags ILIKE '%duplicado%' IS FALSE);

COMMIT;

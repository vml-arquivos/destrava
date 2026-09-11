-- MIGRAÇÃO 015 — Reconciliação retroativa de ownership via Chatwoot
-- Atualiza leads.responsavel_id com base no agente mais recente por lead em crm_conversas.

BEGIN;

UPDATE leads l
SET responsavel_id = c.agente_responsavel_id,
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (lead_id)
    lead_id,
    agente_responsavel_id,
    updated_at,
    created_at
  FROM crm_conversas
  WHERE agente_responsavel_id IS NOT NULL
  ORDER BY lead_id, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
) c
WHERE l.id = c.lead_id
  AND (
    l.responsavel_id IS NULL
    OR l.responsavel_id <> c.agente_responsavel_id
  );

COMMIT;

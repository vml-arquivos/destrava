-- ============================================================
-- Migration 094 — função de movimentação/histórico do funil
-- Onda 2 — Máquina de Vendas
--
-- Aditiva e idempotente. A aplicação usa auditoria compatível nas
-- rotas durante o rollout; esta função fica disponível para uso
-- transacional futuro após validação completa das taxonomias legadas.
-- Não remove nem substitui índices, triggers ou dados existentes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.crm_mover_funil(
  p_lead_id    UUID,
  p_nova_etapa TEXT,
  p_motivo     TEXT DEFAULT NULL,
  p_collab_id  UUID DEFAULT NULL,
  p_origem_ia  BOOLEAN DEFAULT FALSE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_etapa_atual TEXT;
  v_hist_id UUID;
BEGIN
  SELECT etapa_funil::TEXT
    INTO v_etapa_atual
    FROM public.leads
   WHERE id = p_lead_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead % não encontrado', p_lead_id;
  END IF;

  IF v_etapa_atual IS NOT DISTINCT FROM p_nova_etapa THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.crm_historico_funil
    (lead_id, etapa_de, etapa_para, motivo, colaborador_id, origem_ia)
  VALUES
    (p_lead_id, v_etapa_atual, p_nova_etapa, p_motivo, p_collab_id, p_origem_ia)
  RETURNING id INTO v_hist_id;

  UPDATE public.leads
     SET etapa_funil = p_nova_etapa,
         updated_at = NOW(),
         status = p_nova_etapa
   WHERE id = p_lead_id;

  INSERT INTO public.crm_atividades
    (lead_id, colaborador_id, tipo, titulo, descricao, origem_ia, concluido)
  VALUES
    (p_lead_id, p_collab_id, 'status_change',
     'Movido para: ' || p_nova_etapa,
     COALESCE(p_motivo, 'Movimentação no funil'),
     p_origem_ia, TRUE);

  RETURN v_hist_id;
END;
$$;

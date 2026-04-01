-- ============================================================
-- MIGRAÇÃO 003 — Correção do mover-funil: histórico e atividade
-- Versão: 1.0 | Data: 2026-04-01
--
-- PROBLEMA IDENTIFICADO:
--   O endpoint POST /api/crm/mover-funil (server/index.ts:1206)
--   faz apenas:
--     UPDATE leads SET etapa_funil = $1, updated_at = NOW()
--   Não registra:
--     - crm_historico_funil (rastreabilidade de movimentações)
--     - crm_atividades (linha do tempo do lead)
--   Isso torna o histórico do funil invisível para gestores.
--
-- SOLUÇÃO:
--   Criar trigger AFTER UPDATE na tabela leads que registra
--   automaticamente em crm_historico_funil e crm_atividades
--   quando etapa_funil muda. Isso corrige tanto o endpoint
--   atual quanto qualquer futura atualização direta.
--
-- Idempotente: seguro para reexecutar.
-- ============================================================

-- ─── 1. Função trigger: registrar movimentação de funil ──────
CREATE OR REPLACE FUNCTION public.fn_registrar_movimentacao_funil()
RETURNS TRIGGER AS $$
BEGIN
  -- Só dispara se etapa_funil realmente mudou
  IF OLD.etapa_funil IS DISTINCT FROM NEW.etapa_funil THEN

    -- Registrar no histórico do funil
    INSERT INTO public.crm_historico_funil (
      lead_id, etapa_de, etapa_para, motivo, colaborador_id, origem_ia
    ) VALUES (
      NEW.id,
      OLD.etapa_funil,
      NEW.etapa_funil,
      'Movimentação via sistema',
      NEW.responsavel_id,
      FALSE
    );

    -- Registrar como atividade
    INSERT INTO public.crm_atividades (
      lead_id, colaborador_id, tipo, titulo, descricao, origem_ia, concluido
    ) VALUES (
      NEW.id,
      NEW.responsavel_id,
      'status_change',
      'Funil: ' || COALESCE(OLD.etapa_funil, '—') || ' → ' || NEW.etapa_funil,
      'Movimentação automática registrada pelo sistema',
      FALSE,
      TRUE
    );

    -- Atualizar ultimo_contato_em
    NEW.ultimo_contato_em = NOW();

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 2. Criar trigger (idempotente) ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_leads_movimentacao_funil'
  ) THEN
    CREATE TRIGGER trg_leads_movimentacao_funil
      BEFORE UPDATE ON public.leads
      FOR EACH ROW
      EXECUTE FUNCTION public.fn_registrar_movimentacao_funil();
    RAISE NOTICE 'Trigger trg_leads_movimentacao_funil criado';
  ELSE
    -- Recriar para garantir versão atualizada da função
    DROP TRIGGER trg_leads_movimentacao_funil ON public.leads;
    CREATE TRIGGER trg_leads_movimentacao_funil
      BEFORE UPDATE ON public.leads
      FOR EACH ROW
      EXECUTE FUNCTION public.fn_registrar_movimentacao_funil();
    RAISE NOTICE 'Trigger trg_leads_movimentacao_funil recriado';
  END IF;
END $$;

-- ─── 3. Confirmação ──────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'Migration 003 — trigger de movimentação de funil aplicado em %', NOW();
END $$;

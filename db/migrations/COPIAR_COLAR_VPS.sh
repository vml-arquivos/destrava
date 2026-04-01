#!/bin/bash
# ============================================================
# DESTRAVA CRÉDITO — Execução direta na VPS
# Copie e cole TODO este bloco no terminal da VPS como root.
# Não precisa de nenhum arquivo externo.
# ============================================================

docker exec -i tr3go0jqyc5h3tuvz7f46zkc psql -U postgres -d postgres << 'ENDSQL'

-- BLOCO 1: Ownership
ALTER TABLE IF EXISTS public.empresas           OWNER TO postgres;
ALTER TABLE IF EXISTS public.empresa_documentos OWNER TO postgres;
ALTER TABLE IF EXISTS public.empresa_followups  OWNER TO postgres;
ALTER TABLE IF EXISTS public.empresa_historico  OWNER TO postgres;
ALTER TABLE IF EXISTS public.triagem_leads      OWNER TO postgres;

-- BLOCO 2: gerente_id em colaboradores
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS gerente_id UUID
    REFERENCES public.colaboradores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_colaboradores_gerente_id
  ON public.colaboradores(gerente_id)
  WHERE gerente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_colaboradores_cargo_lower
  ON public.colaboradores(LOWER(cargo));

-- BLOCO 3: caixa_atual em leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS caixa_atual TEXT DEFAULT 'central';

UPDATE public.leads SET caixa_atual = 'central' WHERE caixa_atual IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_caixa_atual
  ON public.leads(caixa_atual);

CREATE INDEX IF NOT EXISTS idx_leads_responsavel_caixa
  ON public.leads(responsavel_id, caixa_atual);

-- BLOCO 4: caixa_atual em triagem_leads
ALTER TABLE public.triagem_leads
  ADD COLUMN IF NOT EXISTS caixa_atual TEXT DEFAULT 'central';

UPDATE public.triagem_leads SET caixa_atual = 'central' WHERE caixa_atual IS NULL;

CREATE INDEX IF NOT EXISTS idx_triagem_responsavel_id
  ON public.triagem_leads(responsavel_id)
  WHERE responsavel_id IS NOT NULL;

-- BLOCO 5: Função set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- BLOCO 6: Trigger de movimentação de funil
CREATE OR REPLACE FUNCTION public.fn_registrar_movimentacao_funil()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.etapa_funil IS DISTINCT FROM NEW.etapa_funil THEN
    INSERT INTO public.crm_historico_funil (
      lead_id, etapa_de, etapa_para, motivo, colaborador_id, origem_ia
    ) VALUES (
      NEW.id, OLD.etapa_funil, NEW.etapa_funil,
      'Movimentacao via sistema', NEW.responsavel_id, FALSE
    );
    INSERT INTO public.crm_atividades (
      lead_id, colaborador_id, tipo, titulo, descricao, origem_ia, concluido
    ) VALUES (
      NEW.id, NEW.responsavel_id, 'status_change',
      'Funil: ' || COALESCE(OLD.etapa_funil, '-') || ' -> ' || NEW.etapa_funil,
      'Movimentacao automatica registrada pelo sistema', FALSE, TRUE
    );
    NEW.ultimo_contato_em = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leads_movimentacao_funil') THEN
    DROP TRIGGER trg_leads_movimentacao_funil ON public.leads;
  END IF;
  CREATE TRIGGER trg_leads_movimentacao_funil
    BEFORE UPDATE ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_registrar_movimentacao_funil();
END $$;

-- BLOCO 7: Função fn_ids_equipe
CREATE OR REPLACE FUNCTION public.fn_ids_equipe(p_gerente_id UUID)
RETURNS UUID[] AS $$
  SELECT ARRAY(
    SELECT id FROM public.colaboradores
    WHERE id = p_gerente_id OR gerente_id = p_gerente_id
  );
$$ LANGUAGE sql STABLE;

-- BLOCO 8: View vw_crm_pipeline
CREATE OR REPLACE VIEW public.vw_crm_pipeline AS
SELECT
  l.id, l.nome, l.telefone, l.email, l.empresa, l.tipo_pessoa, l.cpf_cnpj,
  l.cargo, l.cidade, l.estado, l.canal_origem, l.produto_interesse,
  l.valor_solicitado, l.prazo_meses, l.etapa_funil, l.temperatura,
  l.score_ia, l.score_manual, l.score_efetivo, l.tags,
  l.proximo_followup, l.ultimo_contato_em, l.resumo_ia, l.observacoes_ia,
  l.chatwoot_conv_id, l.responsavel_id, l.caixa_atual, l.captador_id, l.empresa_id,
  col.nome        AS responsavel_nome,
  col.cargo       AS responsavel_cargo,
  col.gerente_id  AS responsavel_gerente_id,
  l.origem, l.status, l.created_at, l.updated_at,
  COALESCE(d.total_docs, 0)      AS total_docs,
  COALESCE(d.docs_recebidos, 0)  AS docs_recebidos,
  a.titulo                       AS ultima_atividade,
  a.created_at                   AS ultima_atividade_em,
  EXTRACT(DAY FROM NOW() - COALESCE(l.ultimo_contato_em, l.created_at))::INTEGER AS dias_sem_contato
FROM public.leads l
LEFT JOIN public.colaboradores col ON col.id = l.responsavel_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS total_docs,
    COUNT(*) FILTER (WHERE status IN ('recebido','aprovado')) AS docs_recebidos
  FROM public.crm_documentos WHERE lead_id = l.id
) d ON TRUE
LEFT JOIN LATERAL (
  SELECT titulo, created_at FROM public.crm_atividades
  WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1
) a ON TRUE
WHERE l.etapa_funil NOT IN ('inativo');

-- BLOCO 9: View vw_pipeline_por_etapa
CREATE OR REPLACE VIEW public.vw_pipeline_por_etapa AS
SELECT
  etapa_funil,
  COUNT(*)                                                AS total_leads,
  COALESCE(SUM(valor_solicitado), 0)                      AS valor_total,
  COUNT(*) FILTER (WHERE temperatura = 'urgente')         AS urgentes,
  COUNT(*) FILTER (WHERE temperatura = 'quente')          AS quentes,
  COUNT(*) FILTER (WHERE proximo_followup < NOW())        AS followups_atrasados,
  AVG(score_efetivo)::INTEGER                             AS score_medio,
  COUNT(*) FILTER (WHERE responsavel_id IS NULL)          AS sem_responsavel
FROM public.leads
WHERE etapa_funil NOT IN ('inativo')
GROUP BY etapa_funil
ORDER BY
  CASE etapa_funil
    WHEN 'novo'             THEN 1
    WHEN 'contato_feito'    THEN 2
    WHEN 'qualificado'      THEN 3
    WHEN 'proposta_enviada' THEN 4
    WHEN 'negociacao'       THEN 5
    WHEN 'documentacao'     THEN 6
    WHEN 'aprovacao'        THEN 7
    WHEN 'ganho'            THEN 8
    WHEN 'perdido'          THEN 9
    ELSE 99
  END;

-- BLOCO 10: View vw_performance_colaboradores
CREATE OR REPLACE VIEW public.vw_performance_colaboradores AS
SELECT
  col.id AS colaborador_id, col.nome, col.cargo, col.ativo, col.gerente_id,
  COUNT(DISTINCT l.id)                                             AS total_leads,
  COUNT(DISTINCT l.id) FILTER (WHERE l.etapa_funil = 'ganho')     AS leads_ganhos,
  COUNT(DISTINCT l.id) FILTER (WHERE l.etapa_funil = 'perdido')   AS leads_perdidos,
  COUNT(DISTINCT l.id) FILTER (
    WHERE l.etapa_funil NOT IN ('ganho','perdido','inativo')
  )                                                                AS leads_ativos,
  COALESCE(SUM(l.valor_solicitado) FILTER (WHERE l.etapa_funil = 'ganho'), 0) AS valor_ganho,
  COALESCE(SUM(l.valor_solicitado) FILTER (
    WHERE l.etapa_funil NOT IN ('perdido','inativo')
  ), 0)                                                            AS valor_pipeline,
  CASE
    WHEN COUNT(DISTINCT l.id) > 0
    THEN ROUND(
      COUNT(DISTINCT l.id) FILTER (WHERE l.etapa_funil = 'ganho')::NUMERIC
      / COUNT(DISTINCT l.id) * 100, 1
    )
    ELSE 0
  END                                                              AS taxa_conversao_pct,
  COUNT(DISTINCT a.id) FILTER (
    WHERE a.created_at >= NOW() - INTERVAL '7 days'
  )                                                                AS atividades_7d
FROM public.colaboradores col
LEFT JOIN public.leads l ON l.responsavel_id = col.id
LEFT JOIN public.crm_atividades a ON a.colaborador_id = col.id
GROUP BY col.id, col.nome, col.cargo, col.ativo, col.gerente_id;

-- BLOCO 11: View vw_triagem_resumo
CREATE OR REPLACE VIEW public.vw_triagem_resumo AS
SELECT
  t.status,
  COUNT(*)                                                          AS total,
  COUNT(*) FILTER (WHERE t.responsavel_id IS NOT NULL)              AS com_responsavel,
  COUNT(*) FILTER (WHERE t.responsavel_id IS NULL)                  AS sem_responsavel,
  COUNT(*) FILTER (WHERE t.created_at >= NOW() - INTERVAL '24 hours') AS ultimas_24h,
  COUNT(*) FILTER (WHERE t.score_ia >= 70)                          AS score_alto,
  COUNT(*) FILTER (WHERE t.score_ia BETWEEN 40 AND 69)              AS score_medio,
  COUNT(*) FILTER (WHERE t.score_ia < 40 OR t.score_ia IS NULL)     AS score_baixo
FROM public.triagem_leads t
GROUP BY t.status;

-- BLOCO 12: Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaboradores        TO destravadb;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads                TO destravadb;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.triagem_leads        TO destravadb;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_atividades       TO destravadb;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_historico_funil  TO destravadb;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_conversas        TO destravadb;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_documentos       TO destravadb;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_eventos_webhook  TO destravadb;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_mensagens        TO destravadb;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_qualificacoes_ia TO destravadb;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas             TO destravadb;
GRANT SELECT ON public.vw_crm_pipeline                              TO destravadb;
GRANT SELECT ON public.vw_pipeline_por_etapa                        TO destravadb;
GRANT SELECT ON public.vw_performance_colaboradores                 TO destravadb;
GRANT SELECT ON public.vw_triagem_resumo                            TO destravadb;
GRANT EXECUTE ON FUNCTION public.fn_ids_equipe(UUID)                TO destravadb;
GRANT EXECUTE ON FUNCTION public.fn_registrar_movimentacao_funil()  TO destravadb;

-- VERIFICACAO FINAL
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'colaboradores' AND column_name = 'gerente_id')    AS gerente_id_ok,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'leads' AND column_name = 'caixa_atual')           AS caixa_atual_leads_ok,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'triagem_leads' AND column_name = 'caixa_atual')   AS caixa_atual_triagem_ok,
  (SELECT COUNT(*) FROM information_schema.views
   WHERE table_name = 'vw_crm_pipeline')                                 AS view_pipeline_ok,
  (SELECT COUNT(*) FROM pg_trigger
   WHERE tgname = 'trg_leads_movimentacao_funil')                        AS trigger_ok,
  (SELECT COUNT(*) FROM pg_proc
   WHERE proname = 'fn_ids_equipe')                                      AS fn_equipe_ok;

ENDSQL

echo ""
echo "=== CONCLUIDO. Verifique os valores acima — todos devem ser 1 ==="

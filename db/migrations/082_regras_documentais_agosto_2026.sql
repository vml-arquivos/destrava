-- 082_regras_documentais_agosto_2026.sql
-- Ajustes aditivos solicitados em 11/08/2026.
-- Preserva arquivos e análises existentes; não remove tipos documentais legados.

CREATE TABLE IF NOT EXISTS public.documentos_observacoes_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo TEXT NOT NULL,
  entidade_id UUID NOT NULL,
  empresa_id UUID NULL,
  socio_id UUID NULL,
  tipo_documento TEXT NOT NULL,
  observacao TEXT NOT NULL DEFAULT '',
  criado_por TEXT NULL,
  atualizado_por TEXT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_documentos_observacoes_slots_contexto
  ON public.documentos_observacoes_slots (
    entidade_tipo,
    entidade_id,
    tipo_documento,
    COALESCE(socio_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
CREATE INDEX IF NOT EXISTS idx_documentos_observacoes_slots_empresa
  ON public.documentos_observacoes_slots(empresa_id, tipo_documento);

DO $$
BEGIN
  IF to_regclass('public.documentacao_blocos') IS NOT NULL THEN
    UPDATE public.documentacao_blocos
       SET ordem = 4,
           descricao = 'Histórico de arquivamentos lido antes do contrato para definir quais atos devem ser anexados.',
           configuracao = COALESCE(configuracao, '{}'::jsonb) || '{"etapa":"documentacao_societaria","sequencia_analise":1,"dispensa_mei_sem_ato":true}'::jsonb,
           atualizacao_em = NOW()
     WHERE codigo = 'atos_junta_comercial';

    UPDATE public.documentacao_blocos
       SET ordem = 5,
           descricao = 'Contrato e alterações lidos depois dos Atos da Junta e conferidos por número, data, NIRE, CNPJ e QSA.',
           configuracao = COALESCE(configuracao, '{}'::jsonb) || '{"etapa":"documentacao_societaria","sequencia_analise":2}'::jsonb,
           atualizacao_em = NOW()
     WHERE codigo = 'contrato_social_alteracoes';

    UPDATE public.documentacao_blocos
       SET obrigatorio = false,
           descricao = 'Faturamento analisado quando anexado; não obrigatório.',
           configuracao = COALESCE(configuracao, '{}'::jsonb) || '{"documento_obrigatorio":false,"validar_ultimo_mes_fechado":true,"validar_assinaturas":true}'::jsonb,
           atualizacao_em = NOW()
     WHERE codigo = 'faturamento_historico';
  END IF;

  IF to_regclass('public.documentos_regras_credito') IS NOT NULL THEN
    UPDATE public.documentos_regras_credito
       SET ordem = 40,
           condicao = COALESCE(condicao, '{}'::jsonb) || '{"sequencia_analise":1,"retroagir_ate_12_meses":true,"dispensa_mei_sem_ato":true,"permitir_outro_orgao_com_alerta":true}'::jsonb,
           descricao = 'Ler primeiro; solicitar atos anteriores até alcançar 12 meses. MEI sem ato é dispensado; outro órgão gera alerta sem bloquear a inclusão.',
           atualizado_em = NOW()
     WHERE codigo = 'empresa_atos_junta';

    UPDATE public.documentos_regras_credito
       SET ordem = 50,
           condicao = COALESCE(condicao, '{}'::jsonb) || '{"sequencia_analise":2,"conferir_numero_ato":true,"conferir_cnpj":true,"conferir_qsa":true}'::jsonb,
           descricao = 'Ler depois dos Atos da Junta e conferir número do ato, data, NIRE, CNPJ e sócios do QSA.',
           atualizado_em = NOW()
     WHERE codigo = 'empresa_contrato_social';

    UPDATE public.documentos_regras_credito
       SET obrigatorio = false,
           condicao = COALESCE(condicao, '{}'::jsonb) || '{"quando_anexado":true,"ultimo_mes_fechado":true,"assinaturas_mesma_modalidade":true,"conferir_cnpj_qsa":true}'::jsonb,
           descricao = 'Opcional. Quando anexado, validar competências, fechamento mensal, assinaturas, CNPJ e administrador do QSA.',
           atualizado_em = NOW()
     WHERE codigo = 'empresa_faturamento_12m';

    UPDATE public.documentos_regras_credito
       SET validade_dias = NULL,
           condicao = COALESCE(condicao, '{}'::jsonb) || '{"validade_meses":2,"aplicar_todos_socios":true,"titular_divergente_exige_justificativa":true}'::jsonb,
           descricao = 'Comprovante individual por sócio, com validade máxima de dois meses; titular diferente exige justificativa.',
           atualizado_em = NOW()
     WHERE codigo = 'socio_comprovante_residencia';

    UPDATE public.documentos_regras_credito
       SET condicao = COALESCE(condicao, '{}'::jsonb) || '{"aplicar_todos_socios":true,"identificacao_socio_obrigatoria":true}'::jsonb,
           atualizado_em = NOW()
     WHERE entidade_tipo = 'socio';
  END IF;
END $$;

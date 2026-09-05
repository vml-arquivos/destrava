-- Migration 104 — leitura automática integral, fila rearmável e tipo EI.
-- Aditiva e idempotente. Não remove documentos nem laudos existentes.

ALTER TABLE IF EXISTS public.documentos_backfill_jobs
  ADD COLUMN IF NOT EXISTS target_signature TEXT;
ALTER TABLE IF EXISTS public.documentos_backfill_jobs
  ADD COLUMN IF NOT EXISTS target_prompt_version TEXT;
ALTER TABLE IF EXISTS public.documentos_backfill_jobs
  ADD COLUMN IF NOT EXISTS target_engine_version TEXT;

-- Recupera jobs abandonados por reinício abrupto do worker.
UPDATE public.documentos_backfill_jobs
   SET status = 'PENDENTE',
       disponivel_em = NOW(),
       bloqueado_em = NULL,
       bloqueado_por = NULL,
       ultimo_erro = COALESCE(ultimo_erro, 'Job recuperado após expiração do bloqueio')
 WHERE status = 'PROCESSANDO'
   AND bloqueado_em < NOW() - INTERVAL '30 minutes';

CREATE INDEX IF NOT EXISTS idx_documentos_extracoes_ia_retry
  ON public.documentos_extracoes_ia (analysis_status, next_retry_at, retry_count)
  WHERE status = 'falhou';

INSERT INTO public.documentos_catalogo
  (tipo_documento, nome_amigavel, categoria, escopo, uploadavel, analise, prompt_codigo, tipo_exigencia, catalogo_versao)
VALUES
  ('requerimento_empresario', 'Requerimento de Empresário / Instrumento de Inscrição', 'societario', 'empresa', TRUE, 'documento_generico', 'catalogo_requerimento_empresario_extract', 'obrigacao_legal', '2026.09.05'),
  ('registro_cartorio_pj', 'Registro no RCPJ / Cartório de Pessoas Jurídicas', 'societario', 'empresa', TRUE, 'documento_generico', 'catalogo_registro_cartorio_pj_extract', 'obrigacao_legal', '2026.09.05')
ON CONFLICT (tipo_documento) DO UPDATE SET
  nome_amigavel = EXCLUDED.nome_amigavel,
  categoria = EXCLUDED.categoria,
  escopo = EXCLUDED.escopo,
  uploadavel = TRUE,
  analise = COALESCE(public.documentos_catalogo.analise, EXCLUDED.analise),
  prompt_codigo = COALESCE(public.documentos_catalogo.prompt_codigo, EXCLUDED.prompt_codigo),
  tipo_exigencia = EXCLUDED.tipo_exigencia,
  ativo = TRUE,
  catalogo_versao = EXCLUDED.catalogo_versao,
  atualizado_em = NOW();

-- Todo tipo aceito para upload recebe um analisador e prompt efetivos. Os
-- analisadores especializados existentes são preservados; apenas lacunas são
-- preenchidas pelo extrator genérico orientado pelo perfil da categoria.
UPDATE public.documentos_catalogo
   SET analise = COALESCE(analise, 'documento_generico'),
       prompt_codigo = COALESCE(prompt_codigo, 'catalogo_' || COALESCE(tipo_canonico, tipo_documento) || '_extract'),
       catalogo_versao = '2026.09.05',
       atualizado_em = NOW()
 WHERE uploadavel = TRUE
   AND ativo = TRUE;

INSERT INTO public.ia_prompts_documentais
  (bloco_id, codigo, versao, nome, descricao, prompt_sistema, prompt_usuario_template, schema_saida, ativo)
SELECT NULL,
       c.prompt_codigo,
       CASE
         WHEN c.prompt_codigo = 'qsa_extract' THEN '5.1.0'
         WHEN LEFT(c.prompt_codigo, 9) = 'catalogo_' THEN '2.0.0'
         ELSE '1.0.0'
       END,
       'Leitura automática — ' || c.nome_amigavel,
       'Extração auditável por tipo e categoria documental. Versão 2026.09.05.',
       'Analise exclusivamente o arquivo recebido. Não invente dados. Separe fatos comprovados de inferências, informe evidência textual, página quando disponível, competência, emissão, validade, situação documental e necessidade de revisão humana.',
       'Tipo declarado: {{tipo_documento}}. Empresa: {{empresa_id}}. Retorne documento_compativel, tipo_detectado, campos_comprovados, campos_inferidos, evidencias, competencia, validade, pendencias, divergencias, confianca e revisao_humana_necessaria.',
       '{"type":"object","required":["documento_compativel","campos_comprovados","campos_inferidos","evidencias","revisao_humana_necessaria"]}'::jsonb,
       TRUE
  FROM public.documentos_catalogo c
 WHERE c.uploadavel = TRUE
   AND c.ativo = TRUE
   AND c.prompt_codigo IS NOT NULL
ON CONFLICT (codigo, versao) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  prompt_sistema = EXCLUDED.prompt_sistema,
  prompt_usuario_template = EXCLUDED.prompt_usuario_template,
  schema_saida = EXCLUDED.schema_saida,
  ativo = TRUE,
  atualizacao_em = NOW();

BEGIN;

-- Corrige CHECK constraint de cadastro_status em empresas/clientes_pf/leads.
--
-- Contexto: o banco de produção tinha uma constraint "empresas_cadastro_status_check"
-- (nome padrão do Postgres para CHECK de coluna) que nunca foi criada por
-- nenhuma migration deste repositório -- foi adicionada manualmente em algum
-- momento e ficou desatualizada, rejeitando o valor 'removido', que é gravado
-- pelo próprio app quando arquiva (em vez de apagar de verdade) um cadastro
-- protegido por FK com ON DELETE RESTRICT (ex: empresa com contrato_gerado
-- vinculado -- ver db/migrations/016_previsao_faturamento_e_contratos.sql).
--
-- Resultado do bug: apagar ou arquivar um cadastro incompleto/duplicado na
-- tela "Cadastros Incompletos" falhava sempre com
-- "new row for relation ... violates check constraint ...".
--
-- Esta migration está aqui só como registro/histórico. O conserto que roda
-- de fato em produção está embutido em server/index.ts (startServer(), bloco
-- "Migration 069"), no mesmo padrão de auto-cura já usado pela Migration 067
-- (documentos_arquivos) -- assim ele se aplica sozinho a cada boot do servidor,
-- sem depender de rodar `npm run migrate` manualmente.
--
-- Idempotente: seguro rodar de novo (DROP CONSTRAINT IF EXISTS + recriação).

DO $$
BEGIN
  ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_cadastro_status_check;
  ALTER TABLE public.clientes_pf DROP CONSTRAINT IF EXISTS clientes_pf_cadastro_status_check;
  ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_cadastro_status_check;
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

ALTER TABLE public.empresas
  ADD CONSTRAINT empresas_cadastro_status_check
  CHECK (cadastro_status IS NULL OR cadastro_status IN ('completo','incompleto','duplicado','removido','em_uso_acompanhamento'));

ALTER TABLE public.clientes_pf
  ADD CONSTRAINT clientes_pf_cadastro_status_check
  CHECK (cadastro_status IS NULL OR cadastro_status IN ('completo','incompleto','duplicado','removido','em_uso_acompanhamento'));

ALTER TABLE public.leads
  ADD CONSTRAINT leads_cadastro_status_check
  CHECK (cadastro_status IS NULL OR cadastro_status IN ('completo','incompleto','duplicado','removido','em_uso_acompanhamento'));

COMMIT;

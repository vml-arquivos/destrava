-- 085_empresas_visualizado_em.sql
-- Guarda a última vez que a ficha de cada empresa foi aberta por um
-- colaborador. Aplicada automaticamente no boot do servidor (ver
-- "Migration 085" em server/index.ts) -- este arquivo é a referência/registro
-- histórico da alteração, no mesmo padrão dos demais arquivos numerados desta
-- pasta.
--
-- Usada pelo widget "Empresas recentes" (tela Clientes PJ) para ordenar por
-- "visualizada ou atualizada recentemente", em vez de só pela edição do
-- cadastro (empresas.updated_at) -- ver POST /api/empresas/:id/visualizar e
-- GET /api/documentacao/empresas/documentos-resumo.
--
-- Não altera nenhuma coluna existente -- só adiciona um campo novo, opcional
-- (fica NULL até a empresa ser aberta pela primeira vez depois do deploy
-- desta migration).

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS visualizado_em TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_empresas_visualizado_em
  ON public.empresas(visualizado_em DESC);

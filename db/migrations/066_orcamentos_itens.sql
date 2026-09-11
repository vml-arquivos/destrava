-- 066_orcamentos_itens.sql
-- Adiciona coluna itens (JSONB) à tabela orcamentos_timbrados para itens configuráveis com valor individual.

ALTER TABLE public.orcamentos_timbrados
  ADD COLUMN IF NOT EXISTS itens JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.orcamentos_timbrados.itens IS
  'Itens do orçamento: [{descricao: string, quantidade: number, valor_unitario: number}]';

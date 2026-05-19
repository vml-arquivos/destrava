-- 030_contratos_padrao_visual_prestadoras.sql
-- Padroniza identidade visual de prestadoras usadas nos contratos.
-- Seguro para rodar mais de uma vez.
-- Também garante as colunas visuais usadas pelo PDF, caso o banco ainda não tenha recebido
-- os ALTER TABLE executados pelo backend.

BEGIN;

ALTER TABLE public.prestadores_servico
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE public.prestadores_servico
  ADD COLUMN IF NOT EXISTS logo_path TEXT;

ALTER TABLE public.prestadores_servico
  ADD COLUMN IF NOT EXISTS cor_primaria TEXT;

ALTER TABLE public.prestadores_servico
  ADD COLUMN IF NOT EXISTS cor_secundaria TEXT;

ALTER TABLE public.prestadores_servico
  ADD COLUMN IF NOT EXISTS cabecalho_html TEXT;

ALTER TABLE public.prestadores_servico
  ADD COLUMN IF NOT EXISTS rodape_html TEXT;

ALTER TABLE public.prestadores_servico
  ADD COLUMN IF NOT EXISTS cidade_assinatura TEXT;

ALTER TABLE public.prestadores_servico
  ADD COLUMN IF NOT EXISTS uf_assinatura TEXT;

ALTER TABLE public.prestadores_servico
  ADD COLUMN IF NOT EXISTS usar_papel_personalizado BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.prestadores_servico
  ADD COLUMN IF NOT EXISTS mostrar_logo_contrato BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.prestadores_servico
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.prestadores_servico
   SET cor_primaria = COALESCE(NULLIF(cor_primaria, ''), '#0f172a'),
       cor_secundaria = COALESCE(NULLIF(cor_secundaria, ''), '#0ea5e9'),
       usar_papel_personalizado = true,
       mostrar_logo_contrato = true,
       rodape_html = COALESCE(
         NULLIF(rodape_html, ''),
         '<strong>PERMUPAY LTDA</strong> • CNPJ: 61281938000111 • 6135268355 • permupay@gmail.com<br/>QND 25 lote 40, Brasília, DF, 72120-250'
       ),
       updated_at = NOW()
 WHERE regexp_replace(COALESCE(cnpj, ''), '\D', '', 'g') = '61281938000111'
    OR lower(COALESCE(razao_social, nome_fantasia, nome, '')) LIKE '%permupay%'
    OR lower(COALESCE(razao_social, nome_fantasia, nome, '')) LIKE '%permu pay%';

COMMIT;

-- ============================================================
-- FIX: normaliza etapa_funil e adiciona colunas UTM
-- Execute no Supabase SQL Editor
-- Seguro: IF NOT EXISTS / OR REPLACE em tudo
-- ============================================================

-- 1. Adiciona colunas UTM e pagina_origem se não existirem
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_source    TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_medium    TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_campaign  TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS pagina_origem TEXT;

-- 2. Normaliza etapa_funil: converte 'Novo' (maiúsculo) → 'novo' (minúsculo)
--    O schema_fase1_1_delta criou o DEFAULT como 'Novo' (maiúsculo),
--    mas o CRM filtra por 'novo' (minúsculo) e o CHECK do schema_crm.sql
--    aceita apenas valores em minúsculo.
UPDATE public.leads
SET etapa_funil = LOWER(etapa_funil)
WHERE etapa_funil != LOWER(etapa_funil);

-- 3. Garante que o DEFAULT da coluna etapa_funil seja 'novo' (minúsculo)
ALTER TABLE public.leads
  ALTER COLUMN etapa_funil SET DEFAULT 'novo';

-- 4. Garante índice para buscas por origem (rastreabilidade do simulador)
CREATE INDEX IF NOT EXISTS idx_leads_origem      ON public.leads(origem);
CREATE INDEX IF NOT EXISTS idx_leads_utm_source  ON public.leads(utm_source) WHERE utm_source IS NOT NULL;

-- 5. Atualiza leads com etapa_funil NULL para 'novo'
UPDATE public.leads
SET etapa_funil = 'novo'
WHERE etapa_funil IS NULL;

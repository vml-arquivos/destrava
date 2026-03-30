-- ============================================================
-- DESTRAVA CRÉDITO — Diagnóstico via psql (sem Node.js)
-- Execute no container PostgreSQL:
--   docker exec -it tr3go0jqyc5h3tuvz7f46zkc \
--     psql -U destravadb -d postgres -f /tmp/db-diagnose.sql
-- ============================================================

\echo ''
\echo '════════════════════════════════════════════════════════════════════════'
\echo '  DESTRAVA — DIAGNÓSTICO DO BANCO POSTGRESQL'
\echo '════════════════════════════════════════════════════════════════════════'

-- ── 1. Conexão e versão ──────────────────────────────────────────────────────
\echo ''
\echo '── 1. CONEXÃO E VERSÃO ──────────────────────────────────────────────────'
SELECT version();
SELECT current_database() AS banco, current_user AS usuario, inet_server_port() AS porta;

-- ── 2. Extensões instaladas ──────────────────────────────────────────────────
\echo ''
\echo '── 2. EXTENSÕES INSTALADAS ──────────────────────────────────────────────'
SELECT extname, extversion FROM pg_extension ORDER BY extname;

-- ── 3. Tabelas no schema public ──────────────────────────────────────────────
\echo ''
\echo '── 3. TABELAS EXISTENTES ────────────────────────────────────────────────'
SELECT
  tablename                                                           AS tabela,
  pg_size_pretty(pg_total_relation_size(quote_ident(tablename)::regclass)) AS tamanho,
  (SELECT COUNT(*) FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = t.tablename)   AS num_colunas
FROM pg_tables t
WHERE schemaname = 'public'
ORDER BY tablename;

-- ── 4. Colunas da tabela colaboradores ───────────────────────────────────────
\echo ''
\echo '── 4a. COLUNAS: colaboradores ───────────────────────────────────────────'
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'colaboradores'
ORDER BY ordinal_position;

-- ── 4b. Colunas da tabela leads ───────────────────────────────────────────────
\echo ''
\echo '── 4b. COLUNAS: leads ───────────────────────────────────────────────────'
SELECT
  column_name,
  data_type,
  is_nullable,
  LEFT(column_default, 50) AS col_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'leads'
ORDER BY ordinal_position;

-- ── 4c. Colunas da tabela simulacoes_colaborador ──────────────────────────────
\echo ''
\echo '── 4c. COLUNAS: simulacoes_colaborador ──────────────────────────────────'
SELECT
  column_name,
  data_type,
  is_nullable,
  LEFT(column_default, 50) AS col_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'simulacoes_colaborador'
ORDER BY ordinal_position;

-- ── 5. CHECK constraints ─────────────────────────────────────────────────────
\echo ''
\echo '── 5. CHECK CONSTRAINTS ─────────────────────────────────────────────────'
SELECT
  tc.table_name,
  tc.constraint_name,
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'CHECK'
ORDER BY tc.table_name, tc.constraint_name;

-- ── 6. Valores distintos em leads ────────────────────────────────────────────
\echo ''
\echo '── 6a. VALORES DISTINTOS: etapa_funil ───────────────────────────────────'
SELECT etapa_funil, COUNT(*) AS total
FROM leads
GROUP BY etapa_funil
ORDER BY total DESC;

\echo ''
\echo '── 6b. VALORES DISTINTOS: status ────────────────────────────────────────'
SELECT status, COUNT(*) AS total
FROM leads
GROUP BY status
ORDER BY total DESC;

\echo ''
\echo '── 6c. VALORES DISTINTOS: origem ────────────────────────────────────────'
SELECT origem, COUNT(*) AS total
FROM leads
GROUP BY origem
ORDER BY total DESC;

-- ── 7. Views ─────────────────────────────────────────────────────────────────
\echo ''
\echo '── 7. VIEWS ─────────────────────────────────────────────────────────────'
SELECT table_name AS view_name
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- ── 8. Triggers ──────────────────────────────────────────────────────────────
\echo ''
\echo '── 8. TRIGGERS ──────────────────────────────────────────────────────────'
SELECT
  trigger_name,
  event_object_table AS tabela,
  event_manipulation AS evento,
  action_timing      AS momento
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ── 9. Índices customizados ───────────────────────────────────────────────────
\echo ''
\echo '── 9. ÍNDICES (exceto PKs) ──────────────────────────────────────────────'
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname NOT LIKE '%_pkey'
ORDER BY tablename, indexname;

-- ── 10. Contagem de registros ─────────────────────────────────────────────────
\echo ''
\echo '── 10. CONTAGEM DE REGISTROS ────────────────────────────────────────────'
SELECT 'colaboradores'          AS tabela, COUNT(*) AS registros FROM colaboradores
UNION ALL
SELECT 'leads',                            COUNT(*) FROM leads
UNION ALL
SELECT 'simulacoes_colaborador',           COUNT(*) FROM simulacoes_colaborador
UNION ALL
SELECT 'crm_atividades',                   COUNT(*) FROM crm_atividades
UNION ALL
SELECT 'crm_documentos',                   COUNT(*) FROM crm_documentos
UNION ALL
SELECT 'crm_qualificacoes_ia',             COUNT(*) FROM crm_qualificacoes_ia
ORDER BY tabela;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════'
\echo '  FIM DO DIAGNÓSTICO'
\echo '════════════════════════════════════════════════════════════════════════'
\echo ''

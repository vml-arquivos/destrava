/**
 * DESTRAVA CRÉDITO — Diagnóstico Completo do Banco
 * ──────────────────────────────────────────────────
 * Inspeciona o estado REAL do banco PostgreSQL da VPS.
 * Use ANTES de qualquer migração para evitar conflitos.
 *
 * Uso dentro do container (Coolify → Terminal):
 *   node scripts/db-inspect.mjs
 *
 * Ou na VPS diretamente:
 *   DATABASE_URL="postgres://..." node scripts/db-inspect.mjs
 *
 * Saída: relatório completo no terminal + arquivo /tmp/db-inspect.json
 */

import pkg from "pg";
import { writeFileSync } from "fs";

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

const SEP  = "─".repeat(72);
const SEP2 = "═".repeat(72);

function h1(title) { console.log(`\n${SEP2}\n  ${title}\n${SEP2}`); }
function h2(title) { console.log(`\n${SEP}\n  ${title}\n${SEP}`); }
function ok(msg)   { console.log(`  ✅ ${msg}`); }
function warn(msg) { console.log(`  ⚠️  ${msg}`); }
function info(msg) { console.log(`  ℹ️  ${msg}`); }

async function query(client, sql, params = []) {
  const { rows } = await client.query(sql, params);
  return rows;
}

async function main() {
  h1("DESTRAVA CRÉDITO — DIAGNÓSTICO DO BANCO POSTGRESQL");

  const client = await pool.connect();
  const report = {};

  try {
    // ── 1. Versão e conexão ──────────────────────────────────────────────────
    h2("1. CONEXÃO E VERSÃO");
    const [ver] = await query(client, "SELECT version(), current_database(), current_user, inet_server_addr(), inet_server_port()");
    ok(`Banco: ${ver.current_database}`);
    ok(`Usuário: ${ver.current_user}`);
    ok(`Host: ${ver.inet_server_addr}:${ver.inet_server_port}`);
    info(`PostgreSQL: ${ver.version.split(" ").slice(0,2).join(" ")}`);
    report.connection = ver;

    // ── 2. Extensões instaladas ──────────────────────────────────────────────
    h2("2. EXTENSÕES INSTALADAS");
    const exts = await query(client, "SELECT extname, extversion FROM pg_extension ORDER BY extname");
    report.extensions = exts;
    if (exts.length === 0) {
      warn("Nenhuma extensão instalada");
    } else {
      exts.forEach(e => ok(`${e.extname} v${e.extversion}`));
    }
    const hasPgcrypto = exts.some(e => e.extname === "pgcrypto");
    const hasUuidOssp = exts.some(e => e.extname === "uuid-ossp");
    if (!hasPgcrypto && !hasUuidOssp) {
      warn("ATENÇÃO: nem pgcrypto nem uuid-ossp instalados — gen_random_uuid() pode falhar!");
    }

    // ── 3. Tabelas existentes ────────────────────────────────────────────────
    h2("3. TABELAS NO SCHEMA PUBLIC");
    const tables = await query(client, `
      SELECT
        t.tablename,
        pg_size_pretty(pg_total_relation_size(quote_ident(t.tablename)::regclass)) AS tamanho,
        (SELECT COUNT(*) FROM information_schema.columns c
         WHERE c.table_schema = 'public' AND c.table_name = t.tablename) AS num_colunas,
        obj_description(quote_ident(t.tablename)::regclass, 'pg_class') AS comentario
      FROM pg_tables t
      WHERE t.schemaname = 'public'
      ORDER BY t.tablename
    `);
    report.tables = tables;

    // Tabelas que o servidor PRECISA
    const REQUIRED_TABLES = [
      "colaboradores", "leads", "simulacoes_colaborador",
      "crm_atividades", "crm_documentos", "crm_qualificacoes_ia",
    ];
    const existingTableNames = tables.map(t => t.tablename);

    if (tables.length === 0) {
      warn("BANCO VAZIO — nenhuma tabela encontrada. Execute: node scripts/migrate-db.mjs");
    } else {
      tables.forEach(t => ok(`${t.tablename.padEnd(35)} ${t.num_colunas} colunas   ${t.tamanho}`));
      console.log("");
      REQUIRED_TABLES.forEach(name => {
        if (existingTableNames.includes(name)) {
          ok(`[REQUERIDA] ${name} — presente`);
        } else {
          warn(`[REQUERIDA] ${name} — AUSENTE → migração necessária`);
        }
      });
    }

    // ── 4. Colunas por tabela ────────────────────────────────────────────────
    h2("4. COLUNAS POR TABELA (detalhes)");
    const columns = await query(client, `
      SELECT
        table_name,
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default,
        udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);
    report.columns = columns;

    // Agrupa por tabela
    const byTable = {};
    columns.forEach(c => {
      if (!byTable[c.table_name]) byTable[c.table_name] = [];
      byTable[c.table_name].push(c);
    });

    // Colunas críticas que o INSERT de leads precisa
    const REQUIRED_LEADS_COLS = [
      "id","nome","email","telefone","empresa","cpf_cnpj","tipo_pessoa",
      "produto_interesse","valor_solicitado","prazo_meses","finalidade",
      "origem","status","etapa_funil","temperatura","score_ia",
      "cidade","estado","observacoes_ia","proximo_followup",
      "utm_source","utm_medium","utm_campaign","pagina_origem",
      "created_at","updated_at",
    ];
    const REQUIRED_COLAB_COLS = ["id","nome","email","cargo","senha_hash","ativo","created_at"];
    const REQUIRED_SIMUL_COLS = [
      "id","colaborador_id","cliente_nome","cliente_telefone","cliente_cpf_cnpj",
      "valor_solicitado","quantidade_parcelas","taxa_juros_mensal",
      "comissao_percentual","total_comissao","valor_parcela","valor_total_pagar",
      "total_juros","custo_efetivo_total","imposto_percentual","total_imposto",
      "banco","linha_credito","observacoes","status","criado_em","atualizado_em",
    ];
    const REQUIRED_COLS_MAP = {
      leads: REQUIRED_LEADS_COLS,
      colaboradores: REQUIRED_COLAB_COLS,
      simulacoes_colaborador: REQUIRED_SIMUL_COLS,
    };

    Object.entries(byTable).forEach(([tname, cols]) => {
      console.log(`\n  📋 ${tname}`);
      cols.forEach(c => {
        const type = c.data_type === "USER-DEFINED" ? c.udt_name : c.data_type;
        const nullable = c.is_nullable === "YES" ? "NULL" : "NOT NULL";
        const def = c.column_default ? ` DEFAULT ${c.column_default.substring(0,40)}` : "";
        console.log(`     ${c.column_name.padEnd(30)} ${type.padEnd(20)} ${nullable}${def}`);
      });

      // Verifica colunas faltantes nas tabelas críticas
      if (REQUIRED_COLS_MAP[tname]) {
        const existingCols = cols.map(c => c.column_name);
        const missing = REQUIRED_COLS_MAP[tname].filter(r => !existingCols.includes(r));
        if (missing.length > 0) {
          console.log(`\n     ⚠️  COLUNAS FALTANTES (necessárias pelo servidor):`);
          missing.forEach(m => console.log(`        → ${m}`));
        } else {
          console.log(`\n     ✅ Todas as colunas requeridas presentes`);
        }
      }
    });

    // ── 5. CHECK constraints ─────────────────────────────────────────────────
    h2("5. CHECK CONSTRAINTS");
    const checks = await query(client, `
      SELECT
        tc.table_name,
        tc.constraint_name,
        cc.check_clause
      FROM information_schema.table_constraints tc
      JOIN information_schema.check_constraints cc
        ON tc.constraint_name = cc.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'CHECK'
      ORDER BY tc.table_name, tc.constraint_name
    `);
    report.check_constraints = checks;
    if (checks.length === 0) {
      warn("Nenhum CHECK constraint encontrado");
    } else {
      checks.forEach(c => {
        console.log(`  ${c.table_name}.${c.constraint_name}`);
        console.log(`    ${c.check_clause}`);
      });
    }

    // ── 6. Valores atuais de etapa_funil (diagnóstico de casing) ────────────
    h2("6. VALORES DISTINTOS: etapa_funil e status (leads)");
    if (existingTableNames.includes("leads")) {
      try {
        const etapas = await query(client, `
          SELECT etapa_funil, COUNT(*) AS total
          FROM leads
          GROUP BY etapa_funil
          ORDER BY total DESC
        `);
        const statuses = await query(client, `
          SELECT status, COUNT(*) AS total
          FROM leads
          GROUP BY status
          ORDER BY total DESC
        `);
        const origens = await query(client, `
          SELECT origem, COUNT(*) AS total
          FROM leads
          GROUP BY origem
          ORDER BY total DESC
        `);
        report.leads_etapa_funil = etapas;
        report.leads_status = statuses;
        report.leads_origem = origens;

        const totalLeads = etapas.reduce((s, r) => s + parseInt(r.total), 0);
        info(`Total de leads no banco: ${totalLeads}`);
        console.log("\n  etapa_funil:");
        etapas.forEach(r => {
          const flag = r.etapa_funil !== r.etapa_funil?.toLowerCase() ? " ⚠️  MAIÚSCULO — CRM não vai exibir!" : "";
          console.log(`    "${r.etapa_funil}" → ${r.total} leads${flag}`);
        });
        console.log("\n  status:");
        statuses.forEach(r => console.log(`    "${r.status}" → ${r.total} leads`));
        console.log("\n  origem:");
        origens.forEach(r => console.log(`    "${r.origem}" → ${r.total} leads`));
      } catch (e) {
        warn(`Não foi possível ler leads: ${e.message}`);
      }
    } else {
      warn("Tabela 'leads' não existe — banco não inicializado");
    }

    // ── 7. Views ─────────────────────────────────────────────────────────────
    h2("7. VIEWS");
    const views = await query(client, `
      SELECT table_name, view_definition
      FROM information_schema.views
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    report.views = views.map(v => ({ name: v.table_name, definition_preview: v.view_definition?.substring(0, 120) }));
    const REQUIRED_VIEWS = ["vw_crm_pipeline", "vw_leads_para_ia"];
    if (views.length === 0) {
      warn("Nenhuma view encontrada");
    } else {
      views.forEach(v => ok(`${v.table_name}`));
    }
    REQUIRED_VIEWS.forEach(name => {
      if (!views.find(v => v.table_name === name)) {
        warn(`View requerida AUSENTE: ${name}`);
      }
    });

    // ── 8. Triggers ──────────────────────────────────────────────────────────
    h2("8. TRIGGERS");
    const triggers = await query(client, `
      SELECT trigger_name, event_object_table, event_manipulation, action_timing
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
      ORDER BY event_object_table, trigger_name
    `);
    report.triggers = triggers;
    if (triggers.length === 0) {
      warn("Nenhum trigger encontrado");
    } else {
      triggers.forEach(t =>
        ok(`${t.trigger_name.padEnd(40)} ${t.action_timing} ${t.event_manipulation} ON ${t.event_object_table}`)
      );
    }

    // ── 9. Índices ───────────────────────────────────────────────────────────
    h2("9. ÍNDICES");
    const indexes = await query(client, `
      SELECT
        indexname,
        tablename,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname NOT LIKE '%_pkey'
      ORDER BY tablename, indexname
    `);
    report.indexes = indexes;
    if (indexes.length === 0) {
      warn("Nenhum índice customizado encontrado (apenas PKs)");
    } else {
      indexes.forEach(i => ok(`${i.indexname.padEnd(40)} ON ${i.tablename}`));
    }

    // ── 10. Contagem de registros ────────────────────────────────────────────
    h2("10. CONTAGEM DE REGISTROS");
    report.row_counts = {};
    for (const tname of existingTableNames) {
      try {
        const [{ count }] = await query(client, `SELECT COUNT(*) AS count FROM ${tname}`);
        report.row_counts[tname] = parseInt(count);
        const flag = parseInt(count) === 0 ? "  (vazia)" : "";
        info(`${tname.padEnd(35)} ${count} registros${flag}`);
      } catch (e) {
        warn(`${tname}: erro ao contar — ${e.message}`);
      }
    }

    // ── 11. Resumo de ação necessária ────────────────────────────────────────
    h2("11. RESUMO — AÇÕES NECESSÁRIAS");
    const missingTables = REQUIRED_TABLES.filter(t => !existingTableNames.includes(t));
    const missingViews  = REQUIRED_VIEWS.filter(v => !views.find(x => x.table_name === v));

    if (missingTables.length === 0 && missingViews.length === 0) {
      ok("Banco inicializado corretamente — todas as tabelas e views presentes");
      ok("Execute 'node scripts/migrate-db.mjs' para aplicar colunas faltantes (idempotente)");
    } else {
      if (missingTables.length > 0) {
        warn(`Tabelas ausentes: ${missingTables.join(", ")}`);
        warn("Execute: node scripts/migrate-db.mjs");
      }
      if (missingViews.length > 0) {
        warn(`Views ausentes: ${missingViews.join(", ")}`);
        warn("Execute: node scripts/migrate-db.mjs");
      }
    }

    // ── Salva JSON ───────────────────────────────────────────────────────────
    const outPath = "/tmp/db-inspect.json";
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`\n  📄 Relatório JSON salvo em: ${outPath}`);
    console.log(`     (copie com: docker cp <container>:${outPath} ./db-inspect.json)\n`);

  } catch (err) {
    console.error("\n❌ Erro durante diagnóstico:", err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();

/**
 * ensure-nexus-tarefas-enviadas.mjs
 *
 * Script aditivo e seguro para garantir que a tabela nexus_tarefas_enviadas
 * existe no banco de dados PostgreSQL do Destrava Crédito.
 *
 * REGRAS:
 * - Usa CREATE TABLE IF NOT EXISTS — nunca destrói dados existentes.
 * - Usa ADD COLUMN IF NOT EXISTS — nunca remove colunas existentes.
 * - Idempotente: pode ser executado múltiplas vezes sem efeito colateral.
 * - Não altera nenhuma outra tabela.
 *
 * EXECUÇÃO:
 *   node scripts/ensure-nexus-tarefas-enviadas.mjs
 *
 * Requer DATABASE_URL no ambiente (ou arquivo .env na raiz do projeto).
 *
 * Exemplo:
 *   DATABASE_URL=postgres://user:pass@host:5432/db node scripts/ensure-nexus-tarefas-enviadas.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Carregar .env se existir ─────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
try {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env não encontrado — usar variáveis de ambiente do sistema
}

// ─── Conectar ao banco ────────────────────────────────────────────────────────
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ DATABASE_URL não definida. Configure no .env ou no ambiente.");
  process.exit(1);
}

let pg;
try {
  pg = await import("pg");
} catch {
  console.error("❌ Pacote 'pg' não encontrado. Execute: npm install pg");
  process.exit(1);
}

const { Pool } = pg.default || pg;
const pool = new Pool({ connectionString: databaseUrl, ssl: false });

// ─── SQL aditivo ──────────────────────────────────────────────────────────────
const SQL_CREATE = `
  CREATE TABLE IF NOT EXISTS nexus_tarefas_enviadas (
    id                SERIAL PRIMARY KEY,
    idempotency_key   TEXT UNIQUE NOT NULL,
    empresa_id        TEXT NOT NULL,
    pendencia_id      TEXT NOT NULL,
    titulo            TEXT NOT NULL,
    categoria         TEXT,
    prioridade        TEXT,
    destino           TEXT,
    status            TEXT DEFAULT 'enviado',
    resposta_webhook  JSONB,
    enviado_em        TIMESTAMP DEFAULT NOW(),
    created_at        TIMESTAMP DEFAULT NOW()
  );
`;

// Colunas adicionais — adicionadas com IF NOT EXISTS para garantir compatibilidade
// com instâncias que já tenham a tabela criada pela Sprint 7 sem todas as colunas.
const SQL_ADD_COLUMNS = [
  `ALTER TABLE nexus_tarefas_enviadas ADD COLUMN IF NOT EXISTS resposta_webhook JSONB;`,
  `ALTER TABLE nexus_tarefas_enviadas ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'enviado';`,
  `ALTER TABLE nexus_tarefas_enviadas ADD COLUMN IF NOT EXISTS destino TEXT;`,
  `ALTER TABLE nexus_tarefas_enviadas ADD COLUMN IF NOT EXISTS categoria TEXT;`,
  `ALTER TABLE nexus_tarefas_enviadas ADD COLUMN IF NOT EXISTS prioridade TEXT;`,
  `ALTER TABLE nexus_tarefas_enviadas ADD COLUMN IF NOT EXISTS enviado_em TIMESTAMP DEFAULT NOW();`,
  `ALTER TABLE nexus_tarefas_enviadas ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();`,
];

// Índices para performance
const SQL_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_nexus_tarefas_empresa_id ON nexus_tarefas_enviadas(empresa_id);`,
  `CREATE INDEX IF NOT EXISTS idx_nexus_tarefas_pendencia_id ON nexus_tarefas_enviadas(pendencia_id);`,
  `CREATE INDEX IF NOT EXISTS idx_nexus_tarefas_enviado_em ON nexus_tarefas_enviadas(enviado_em DESC);`,
];

// ─── Executar ─────────────────────────────────────────────────────────────────
async function run() {
  const client = await pool.connect();
  try {
    console.log("🔗 Conectado ao banco de dados.");

    // 1. Criar tabela se não existir
    await client.query(SQL_CREATE);
    console.log("✅ Tabela nexus_tarefas_enviadas verificada/criada.");

    // 2. Adicionar colunas faltantes (idempotente)
    for (const sql of SQL_ADD_COLUMNS) {
      try {
        await client.query(sql);
      } catch (err) {
        // Ignorar erros de coluna já existente (pg pode lançar em versões antigas)
        if (!String(err.message).includes("already exists")) {
          console.warn(`⚠️  Aviso ao adicionar coluna: ${err.message}`);
        }
      }
    }
    console.log("✅ Colunas verificadas/adicionadas.");

    // 3. Criar índices
    for (const sql of SQL_INDEXES) {
      try {
        await client.query(sql);
      } catch (err) {
        if (!String(err.message).includes("already exists")) {
          console.warn(`⚠️  Aviso ao criar índice: ${err.message}`);
        }
      }
    }
    console.log("✅ Índices verificados/criados.");

    // 4. Verificar estrutura final
    const { rows } = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'nexus_tarefas_enviadas'
      ORDER BY ordinal_position;
    `);
    console.log("\n📋 Estrutura final da tabela nexus_tarefas_enviadas:");
    console.table(rows.map(r => ({ coluna: r.column_name, tipo: r.data_type, default: r.column_default })));

    console.log("\n🎉 Script concluído com sucesso. Nenhum dado foi alterado ou removido.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error("❌ Erro ao executar script:", err.message);
  process.exit(1);
});

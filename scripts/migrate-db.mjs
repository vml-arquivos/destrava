/**
 * DESTRAVA CRÉDITO — Executor de Migração
 * ─────────────────────────────────────────
 * Lê supabase/migrate.sql e executa no banco PostgreSQL da VPS.
 * Idempotente: seguro para rodar múltiplas vezes.
 *
 * Uso:
 *   node scripts/migrate-db.mjs
 *
 * Ou via npm:
 *   npm run migrate
 */
import pkg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

async function main() {
  console.log("\n🗄️  DESTRAVA — Executando migração do banco...");

  const sqlPath = join(__dirname, "..", "supabase", "migrate.sql");
  const sql = readFileSync(sqlPath, "utf8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✅ Migração concluída com sucesso!\n");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Falha na migração:", err.message);
    console.error(err.detail || "");
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();

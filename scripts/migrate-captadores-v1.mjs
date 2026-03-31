/**
 * DESTRAVA CRÉDITO — Migração Captadores v1
 * ─────────────────────────────────────────
 * Executa db/migrate_captadores_v1.sql no banco PostgreSQL da VPS.
 * 100% idempotente — usa IF NOT EXISTS em todos os ALTER TABLE.
 *
 * Uso:
 *   node scripts/migrate-captadores-v1.mjs
 *
 * Ou dentro do container Docker:
 *   docker exec -it <container> node scripts/migrate-captadores-v1.mjs
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
  console.log("\n🗄️  DESTRAVA — Executando migração Captadores v1...");

  const sqlPath = join(__dirname, "..", "db", "migrate_captadores_v1.sql");
  const sql = readFileSync(sqlPath, "utf8");

  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log("✅ Migração Captadores v1 concluída com sucesso!\n");
  } catch (err) {
    console.error("❌ Falha na migração:", err.message);
    console.error(err.detail || "");
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();

/**
 * DESTRAVA CRÉDITO — Executor de Migração
 * ─────────────────────────────────────────
 * Lê db/migrate.sql e executa no banco PostgreSQL da VPS.
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
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

const dryRun = process.argv.includes("--dry-run");
const statusOnly = process.argv.includes("--status");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL é obrigatória para executar migrações.");
  }

  const sqlPath = join(__dirname, "..", "db", "migrate.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('destrava:migrate-db'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.destrava_schema_migrations (
        checksum TEXT PRIMARY KEY,
        arquivo TEXT NOT NULL,
        aplicado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const aplicada = await client.query(
      "SELECT checksum, arquivo, aplicado_em FROM public.destrava_schema_migrations WHERE checksum = $1 LIMIT 1",
      [checksum],
    );
    if (statusOnly) {
      await client.query("ROLLBACK");
      console.log(JSON.stringify({ checksum, aplicada: Boolean(aplicada.rows[0]), registro: aplicada.rows[0] || null }, null, 2));
      return;
    }
    if (aplicada.rows[0] && !dryRun) {
      await client.query("COMMIT");
      console.log(`Migração ${checksum.slice(0, 12)} já aplicada; nenhuma alteração executada.`);
      return;
    }
    await client.query(sql);
    if (dryRun) {
      await client.query("ROLLBACK");
      console.log(`Migração ${checksum.slice(0, 12)} validada e revertida (--dry-run).`);
      return;
    }
    await client.query(
      "INSERT INTO public.destrava_schema_migrations (checksum, arquivo) VALUES ($1, $2) ON CONFLICT (checksum) DO NOTHING",
      [checksum, "db/migrate.sql"],
    );
    await client.query("COMMIT");
    console.log(`Migração ${checksum.slice(0, 12)} concluída com sucesso.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Falha na migração:", err.message);
    console.error(err.detail || "");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error("Falha ao iniciar migração:", error?.message || error);
  process.exitCode = 1;
});

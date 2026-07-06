import pkg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(__dirname, "..", "db", "migrations", "068_nexus_catalogo_busca_pj_pf.sql");

if (!process.env.DATABASE_URL) {
  console.error("ERRO: DATABASE_URL não configurada.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: String(process.env.DB_SSL || "false").toLowerCase() === "true"
    ? { rejectUnauthorized: false }
    : false,
});

const client = await pool.connect();
try {
  const sql = readFileSync(migrationPath, "utf8");
  await client.query(sql);
  console.log("OK: migration 068_nexus_catalogo_busca_pj_pf aplicada com sucesso.");
} catch (error) {
  console.error("ERRO ao aplicar migration 068:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

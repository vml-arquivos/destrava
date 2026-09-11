/**
 * DESTRAVA CRÉDITO — Criar Colaborador (PostgreSQL Nativo)
 * ─────────────────────────────────────────────────────────
 * Funciona com o banco PostgreSQL da VPS (sem Supabase).
 *
 * Uso dentro do container (Coolify → Terminal):
 *   node scripts/create-user.mjs
 *
 * Ou com variáveis de ambiente:
 *   NOME="Maria Silva" EMAIL="maria@destrava.com.br" SENHA="Senha@123" CARGO="Analista" \
 *     node scripts/create-user.mjs
 */
import pkg from "pg";
import bcrypt from "bcryptjs";
import * as readline from "readline";

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

function perguntar(rl, pergunta) {
  return new Promise((resolve) => rl.question(pergunta, resolve));
}

async function main() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   DESTRAVA CRÉDITO — Criar Colaborador   ║");
  console.log("╚══════════════════════════════════════════╝\n");

  let nome  = process.env.NOME;
  let email = process.env.EMAIL;
  let senha = process.env.SENHA;
  let cargo = process.env.CARGO;

  if (!nome || !email || !senha) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    nome  = nome  || await perguntar(rl, "Nome completo: ");
    email = email || await perguntar(rl, "E-mail: ");
    senha = senha || await perguntar(rl, "Senha (mín. 6 caracteres): ");
    cargo = cargo || await perguntar(rl, "Cargo [Enter = Analista de Crédito]: ");
    rl.close();
  }

  nome  = nome.trim();
  email = email.trim().toLowerCase();
  senha = senha.trim();
  cargo = (cargo || "").trim() || "Analista de Crédito";

  if (senha.length < 6) {
    console.error("\n❌ Senha deve ter no mínimo 6 caracteres.");
    process.exit(1);
  }

  console.log("\n⏳ Gerando hash da senha...");
  const senhaHash = await bcrypt.hash(senha, 12);

  console.log("⏳ Inserindo colaborador no banco...");
  try {
    const { rows } = await pool.query(
      `INSERT INTO colaboradores (nome, email, cargo, senha_hash, ativo)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (email) DO UPDATE
         SET nome = EXCLUDED.nome,
             cargo = EXCLUDED.cargo,
             senha_hash = EXCLUDED.senha_hash,
             ativo = TRUE,
             updated_at = NOW()
       RETURNING id, nome, email, cargo`,
      [nome, email, cargo, senhaHash]
    );
    const user = rows[0];
    console.log("\n╔══════════════════════════════════════════╗");
    console.log("║          ✅ COLABORADOR CRIADO!          ║");
    console.log("╚══════════════════════════════════════════╝");
    console.log(`\n  Nome:  ${user.nome}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Cargo: ${user.cargo}`);
    console.log(`  UUID:  ${user.id}`);
    console.log(`\n  Acesse: https://${process.env.SITE_DOMAIN || "destravacredito.com"}/colaborador/login\n`);
  } catch (err) {
    console.error("\n❌ Erro ao criar colaborador:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\n❌ Erro inesperado:", err.message);
  process.exit(1);
});

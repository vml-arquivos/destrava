/**
 * DESTRAVA CRÉDITO — Criar Colaborador
 * ─────────────────────────────────────
 * Execute no terminal do Coolify dentro do container:
 *
 *   node scripts/create-user.mjs
 *
 * Ou passe os dados direto na linha de comando:
 *
 *   NOME="Maria Silva" EMAIL="maria@destrava.com.br" SENHA="Senha@123" CARGO="Analista de Crédito" node scripts/create-user.mjs
 */

import { createClient } from "@supabase/supabase-js";
import * as readline from "readline";

// ─── Configuração Supabase ────────────────────────────────────────────────────

const SUPABASE_URL = "https://tjvxxzaatvnfupkdzrzp.supabase.co";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdnh4emFhdHZuZnVwa2R6cnpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDMwMTgyNSwiZXhwIjoyMDg5ODc3ODI1fQ.MhHB6L1a0CfflZsXA7d9Yn8d2nQ8--OlbcagD7uMDuQ";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function perguntar(rl, pergunta) {
  return new Promise((resolve) => rl.question(pergunta, resolve));
}

function log(msg) {
  console.log("\n" + msg);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   DESTRAVA CRÉDITO — Criar Colaborador   ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // Pegar dados das variáveis de ambiente ou perguntar interativamente
  let nome  = process.env.NOME;
  let email = process.env.EMAIL;
  let senha = process.env.SENHA;
  let cargo = process.env.CARGO;

  if (!nome || !email || !senha) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    nome  = nome  || await perguntar(rl, "Nome completo do colaborador: ");
    email = email || await perguntar(rl, "E-mail: ");
    senha = senha || await perguntar(rl, "Senha (mínimo 6 caracteres): ");
    cargo = cargo || await perguntar(rl, "Cargo (ex: Analista de Crédito) [Enter para padrão]: ");

    rl.close();
  }

  cargo = cargo?.trim() || "Analista de Crédito";

  log("⏳ Criando usuário no Supabase Auth...");

  // 1. Criar usuário na autenticação do Supabase
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: email.trim(),
    password: senha.trim(),
    email_confirm: true, // confirma o e-mail automaticamente
  });

  if (authError) {
    console.error("\n❌ Erro ao criar usuário:", authError.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  log(`✅ Usuário criado! UUID: ${userId}`);

  log("⏳ Registrando colaborador no banco de dados...");

  // 2. Inserir na tabela colaboradores
  const { error: dbError } = await supabase.from("colaboradores").insert({
    id: userId,
    nome: nome.trim(),
    cargo: cargo,
    email: email.trim(),
    ativo: true,
  });

  if (dbError) {
    console.error("\n⚠️  Usuário criado no Auth mas erro ao salvar na tabela colaboradores:");
    console.error("   ", dbError.message);
    console.error("\n   Execute manualmente no SQL Editor do Supabase:");
    console.error(`   INSERT INTO colaboradores (id, nome, cargo, email, ativo)`);
    console.error(`   VALUES ('${userId}', '${nome}', '${cargo}', '${email}', true);`);
    process.exit(1);
  }

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║          ✅ COLABORADOR CRIADO!          ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`\n  Nome:  ${nome}`);
  console.log(`  Email: ${email}`);
  console.log(`  Cargo: ${cargo}`);
  console.log(`  UUID:  ${userId}`);
  console.log("\n  Acesse: destrava.permupay.com.br/colaborador/login\n");
}

main().catch((err) => {
  console.error("\n❌ Erro inesperado:", err.message);
  process.exit(1);
});

import { createClient } from "@supabase/supabase-js";

const s = createClient(
  "https://tjvxxzaatvnfupkdzrzp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdnh4emFhdHZuZnVwa2R6cnpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDMwMTgyNSwiZXhwIjoyMDg5ODc3ODI1fQ.MhHB6L1a0CfflZsXA7d9Yn8d2nQ8--OlbcagD7uMDuQ",
  { auth: { autoRefreshToken: false, persistSession: false } }
);

console.log("Criando usuario no Supabase Auth...");

const { data: authData, error: authError } = await s.auth.admin.createUser({
  email: "vilsonmarcio@gmail.com",
  password: "Senha@123",
  email_confirm: true,
});

if (authError) {
  console.log("ERRO AUTH:", authError.message);
  process.exit(1);
}

const userId = authData.user.id;
console.log("Auth OK - UUID:", userId);
console.log("Registrando na tabela colaboradores...");

const { error: dbError } = await s.from("colaboradores").insert({
  id: userId,
  nome: "Vilson Marcio",
  cargo: "Administrador",
  email: "vilsonmarcio@gmail.com",
  ativo: true,
});

if (dbError) {
  console.log("AVISO DB:", dbError.message);
  console.log("Execute manualmente no Supabase SQL Editor:");
  console.log(`INSERT INTO colaboradores (id, nome, cargo, email, ativo) VALUES ('${userId}', 'Vilson Marcio', 'Administrador', 'vilsonmarcio@gmail.com', true);`);
} else {
  console.log("Colaborador registrado com sucesso!");
}

console.log("\n=== PRONTO ===");
console.log("Email: vilsonmarcio@gmail.com");
console.log("Senha: Senha@123");
console.log("Acesse: destrava.permupay.com.br/colaborador/login");

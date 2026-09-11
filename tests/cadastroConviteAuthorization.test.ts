import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const serverSource = fs.readFileSync(path.resolve(process.cwd(), "server/index.ts"), "utf8");
const migration = fs.readFileSync(path.resolve(process.cwd(), "db/migrations/090_convites_cadastro.sql"), "utf8");
const page = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/CadastroConvite.tsx"), "utf8");
const inicio = serverSource.indexOf('app.post("/api/convites-cadastro", auth');
const fim = serverSource.indexOf('// ─── COLABORADORES API', inicio);
const bloco = serverSource.slice(inicio, fim);

describe("cadastro por convite", () => {
  it("usa token hash, expiração e uso único no schema", () => {
    expect(migration).toContain("token_hash TEXT NOT NULL UNIQUE");
    expect(migration).toContain("expira_em TIMESTAMPTZ NOT NULL");
    expect(migration).toContain("usado_em TIMESTAMPTZ");
    expect(migration).toContain("revogado_em TIMESTAMPTZ");
  });

  it("mantém novo acesso inativo até aprovação", () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(fim).toBeGreaterThan(inicio);
    expect(bloco).toContain("VALUES ($1, $2, 'Captador Externo', $3, $4)");
    expect(bloco).toContain("ativo, telefone, perfil,");
    expect(bloco).toContain("VALUES ($1, $2, $3, $4, false, $5, 'agente', false, false, $6)");
    expect(bloco).toContain("pending_approval: true");
    expect(bloco).toContain("SET ativo = true, updated_at = NOW()");
    expect(bloco).toContain("podecriarUsuarios(solicitante?.cargo || '')");
  });

  it("não cria sessão automática e a página exige link válido", () => {
    expect(page).toContain("/api/convites-cadastro/");
    expect(page).toContain("pendente");
    expect(page).toContain("/colaborador/login");
    expect(page).not.toContain("setToken(");
  });
});

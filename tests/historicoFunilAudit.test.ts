import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (relative: string) => readFileSync(resolve(root, relative), "utf8");

describe("auditoria de mudanças do funil", () => {
  it("mantém a migration 094 aditiva e disponibiliza a função de referência", () => {
    const migration = read("db/migrations/094_onda2_historico_funil.sql");
    const aggregate = read("db/migrate.sql");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.crm_mover_funil");
    expect(migration).toContain("INSERT INTO public.crm_historico_funil");
    expect(migration).toContain("UPDATE public.leads");
    expect(migration).toContain("INSERT INTO public.crm_atividades");
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX|TRIGGER)/i);
    expect(aggregate).toContain("MIGRAÇÃO 094: função de movimentação/histórico do funil");
  });

  it("protege a leitura do histórico pela carteira do colaborador", () => {
    const server = read("server/index.ts");

    expect(server).toContain('app.get("/api/crm/historico-funil", auth');
    expect(server).toContain("leadPertenceAoColaborador(leadId, colaborador)");
    expect(server).toContain("ORDER BY h.created_at DESC NULLS LAST, h.id DESC");
    expect(server).toContain('res.status(503).json({ error: "O histórico de funil ainda não foi migrado.", migration_pending: true })');
  });

  it("audita apenas mudanças operacionais e não bloqueia o lead se a tabela estiver pendente", () => {
    const server = read("server/index.ts");

    expect(server).toContain("async function registrarHistoricoFunilSeguro");
    expect(server).toContain("if (err?.code === \"42P01\" || err?.code === \"42703\")");
    expect(server).toContain("if (etapaMudou || responsavelMudou)");
    expect(server).toContain("if (etapaMudouPatch || responsavelMudouPatch)");
    expect(server).toContain("origemIa: origem_ia === true");
  });

  it("carrega a ficha de forma tolerante e exibe o histórico cronológico", () => {
    const ficha = read("client/src/pages/colaborador/CRM.tsx");

    expect(ficha).toContain("apiFetch(`/api/crm/historico-funil?lead_id=${lead.id}`).catch(() => [])");
    expect(ficha).toContain("Histórico de mudanças");
    expect(ficha).toContain("evento.colaborador_nome");
    expect(ficha).toContain("evento.motivo");
    expect(ficha).toContain("evento.origem_ia");
  });
});

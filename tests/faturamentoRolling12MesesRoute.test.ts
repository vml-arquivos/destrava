import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// Endpoint novo, só leitura (Missão de evolução do Acervo Documental —
// faturamento rolling 12 meses): GET
// /api/documentacao/empresa/:empresaId/faturamento/rolling-12-meses. Este
// teste prova que o endpoint devolve a soma da janela de 12 meses calculada
// sobre empresas_faturamento_mensal, sem tocar em nenhum outro comportamento
// da rota de documentação.

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock("pg", () => {
  class PoolMock {
    query = mocks.poolQuery;
  }
  return { default: { Pool: PoolMock }, Pool: PoolMock };
});

vi.mock("../server/middleware/auth", () => ({
  auth: (_req: any, _res: any, next: any) => next(),
}));

import documentacaoRouter from "../server/routes/documentacao";

function appTeste() {
  const app = express();
  app.use(express.json());
  app.use("/api/documentacao", documentacaoRouter);
  return app;
}

const EMPRESA_ID = "74ab11d8-f53f-46b0-b4d7-48abef7c7ff6";

describe("GET /api/documentacao/empresa/:empresaId/faturamento/rolling-12-meses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it("404 quando a empresa não existe", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [] });
    const resposta = await request(appTeste()).get(`/api/documentacao/empresa/${EMPRESA_ID}/faturamento/rolling-12-meses`);
    expect(resposta.status).toBe(404);
  });

  it("devolve janela vazia quando nada foi registrado ainda (estado inicial, não é erro)", async () => {
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM public.empresas WHERE id")) return { rows: [{ id: EMPRESA_ID }] };
      if (sql.includes("FROM public.empresas_faturamento_mensal")) return { rows: [] };
      return { rows: [] };
    });
    const resposta = await request(appTeste()).get(`/api/documentacao/empresa/${EMPRESA_ID}/faturamento/rolling-12-meses?ano=2026&mes=7`);
    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({ empresa_id: EMPRESA_ID, total: 0, completo: false });
    expect(resposta.body.meses_faltantes).toHaveLength(12);
  });

  it("soma as competências registradas dentro da janela pedida por querystring", async () => {
    const competencias = [
      { id: "c1", empresa_id: EMPRESA_ID, ano: 2025, mes: 8, valor: "50000.00", fonte: "declaracao_faturamento", documento_id: null, regime_no_periodo: "Lucro Presumido", confianca: 0.8, observacao: null },
      { id: "c2", empresa_id: EMPRESA_ID, ano: 2026, mes: 7, valor: "70000.00", fonte: "extrato_bancario", documento_id: null, regime_no_periodo: "Lucro Real", confianca: 0.8, observacao: null },
    ];
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM public.empresas WHERE id")) return { rows: [{ id: EMPRESA_ID }] };
      if (sql.includes("FROM public.empresas_faturamento_mensal")) return { rows: competencias };
      return { rows: [] };
    });
    const resposta = await request(appTeste()).get(`/api/documentacao/empresa/${EMPRESA_ID}/faturamento/rolling-12-meses?ano=2026&mes=7`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.total).toBe(120000);
    expect(resposta.body.meses_com_dado).toBe(2);
    expect(resposta.body.regimes_no_periodo.sort()).toEqual(["Lucro Presumido", "Lucro Real"]);
  });

  it("sem querystring, usa o último mês fechado como referência padrão", async () => {
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM public.empresas WHERE id")) return { rows: [{ id: EMPRESA_ID }] };
      if (sql.includes("FROM public.empresas_faturamento_mensal")) return { rows: [] };
      return { rows: [] };
    });
    const resposta = await request(appTeste()).get(`/api/documentacao/empresa/${EMPRESA_ID}/faturamento/rolling-12-meses`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.referencia).toBeDefined();
    expect(resposta.body.janela).toHaveLength(12);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// Endpoint novo, só leitura (Missão de evolução do Acervo Documental, seção
// 11): GET /api/documentacao/empresa/:empresaId/regime-tributario/linha-do-tempo.
// Este teste prova que o endpoint devolve o histórico persistido em
// empresas_regime_tributario_historico sem tocar em nenhum outro comportamento
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

describe("GET /api/documentacao/empresa/:empresaId/regime-tributario/linha-do-tempo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it("404 quando a empresa não existe", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [] });
    const resposta = await request(appTeste()).get(`/api/documentacao/empresa/${EMPRESA_ID}/regime-tributario/linha-do-tempo`);
    expect(resposta.status).toBe(404);
  });

  it("devolve linha vazia quando nada foi registrado ainda (estado inicial, não é erro)", async () => {
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM public.empresas WHERE id")) return { rows: [{ id: EMPRESA_ID, regime_tributario: null }] };
      if (sql.includes("FROM public.empresas_regime_tributario_historico")) return { rows: [] };
      return { rows: [] };
    });
    const resposta = await request(appTeste()).get(`/api/documentacao/empresa/${EMPRESA_ID}/regime-tributario/linha-do-tempo`);
    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({ empresa_id: EMPRESA_ID, linha_do_tempo: [], regime_vigente_na_linha_do_tempo: null });
  });

  it("devolve o histórico registrado, com o período vigente identificado", async () => {
    const periodos = [
      { id: "p1", empresa_id: EMPRESA_ID, regime: "Simples Nacional", data_inicio: "2023-11-27", data_fim: "2025-12-31", fonte: "consulta_optantes", confianca: 0.9, documento_evidencia_id: null, observacao: null },
      { id: "p2", empresa_id: EMPRESA_ID, regime: "Lucro Presumido", data_inicio: "2026-01-01", data_fim: null, fonte: "darf", confianca: 0.85, documento_evidencia_id: "doc-darf-1", observacao: null },
    ];
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM public.empresas WHERE id")) return { rows: [{ id: EMPRESA_ID, regime_tributario: "Lucro Presumido" }] };
      if (sql.includes("FROM public.empresas_regime_tributario_historico")) return { rows: periodos };
      return { rows: [] };
    });
    const resposta = await request(appTeste()).get(`/api/documentacao/empresa/${EMPRESA_ID}/regime-tributario/linha-do-tempo`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.linha_do_tempo).toHaveLength(2);
    expect(resposta.body.regime_vigente_na_linha_do_tempo).toMatchObject({ regime: "Lucro Presumido", data_fim: null });
    expect(resposta.body.regime_atual_cadastrado).toBe("Lucro Presumido");
  });
});

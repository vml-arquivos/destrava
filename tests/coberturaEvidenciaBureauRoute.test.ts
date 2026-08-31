import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// Endpoint novo, só leitura (Missão de evolução do Acervo Documental —
// cobertura de evidência entre bureaus): GET
// /api/documentacao/empresa/:empresaId/cobertura-bureau. Prova que o
// endpoint devolve a cobertura consolidada calculada sobre
// document_evidence_coverage, sem tocar em nenhum outro comportamento da
// rota de documentação.

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

describe("GET /api/documentacao/empresa/:empresaId/cobertura-bureau", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it("404 quando a empresa não existe", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [] });
    const resposta = await request(appTeste()).get(`/api/documentacao/empresa/${EMPRESA_ID}/cobertura-bureau`);
    expect(resposta.status).toBe(404);
  });

  it("devolve cobertura vazia quando nada foi registrado ainda (estado inicial, não é erro)", async () => {
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM public.empresas WHERE id")) return { rows: [{ id: EMPRESA_ID }] };
      if (sql.includes("FROM public.document_evidence_coverage")) return { rows: [] };
      return { rows: [] };
    });
    const resposta = await request(appTeste()).get(`/api/documentacao/empresa/${EMPRESA_ID}/cobertura-bureau`);
    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({ empresa_id: EMPRESA_ID, cobertura: [] });
  });

  it("devolve um único documento respondendo por vários requisitos", async () => {
    const linhas = [
      { requirement_code: "SCR", coverage_status: "SATISFEITO", confidence: 0.9, documento_id: "doc-consolidado" },
      { requirement_code: "CCF", coverage_status: "SATISFEITO", confidence: 0.9, documento_id: "doc-consolidado" },
    ];
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM public.empresas WHERE id")) return { rows: [{ id: EMPRESA_ID }] };
      if (sql.includes("FROM public.document_evidence_coverage")) return { rows: linhas };
      return { rows: [] };
    });
    const resposta = await request(appTeste()).get(`/api/documentacao/empresa/${EMPRESA_ID}/cobertura-bureau`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.cobertura).toHaveLength(2);
    expect(resposta.body.cobertura.every((item: any) => item.documento_id === "doc-consolidado")).toBe(true);
  });
});

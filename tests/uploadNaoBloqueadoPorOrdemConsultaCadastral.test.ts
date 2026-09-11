import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regra de negócio (2026-08-30, Missão de evolução do Acervo Documental): a
// ordem recomendada de leitura das consultas cadastrais -- 1º SCR/Registrato,
// 2º CCS, 3º CCF -- nunca pode impedir tecnicamente o anexo do arquivo (mesma
// regra já aplicada à ordem CNPJ -> QSA -> Enquadramento -> Atos da Junta ->
// Contrato Social, ver tests/uploadNaoBloqueadoPorFasePipeline.test.ts). Antes
// desta mudança, POST /api/documentos/upload rejeitava (423
// ORDEM_CONSULTA_CADASTRAL_REQUERIDA) o anexo de um CCF do CNPJ quando o SCR e
// o CCS ainda não tinham sido anexados -- este teste prova que isso não
// acontece mais. A falta de SCR/CCS continua virando aviso/pendência visível
// no dossiê (ver `avisoOrdemRecomendada` em DocumentosEntidade.tsx), e a
// análise bancária continua incompleta até a sequência ser resolvida -- só o
// upload do arquivo em si é que nunca é recusado por isso.

const EMPRESA_ID = "74ab11d8-f53f-46b0-b4d7-48abef7c7ff6";
const USER_ID = "9c1c8b8e-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn(), saveDocumentBuffer: vi.fn() }));

vi.mock("pg", () => {
  class PoolMock {
    query = mocks.poolQuery;
  }
  return { default: { Pool: PoolMock }, Pool: PoolMock };
});

vi.mock("../server/middleware/auth", () => ({
  auth: (req: any, _res: any, next: any) => {
    req.colaborador = { id: USER_ID, role: "colaborador" };
    next();
  },
}));

vi.mock("../server/services/documentStorage", () => ({
  PersistentStorageError: class PersistentStorageError extends Error {
    statusCode = 503;
  },
  getDocumentStorageHealth: vi.fn(),
  resolveDocumentPath: vi.fn(() => ({ absolutePath: null, relativePath: null, candidates: [] })),
  saveDocumentBuffer: mocks.saveDocumentBuffer,
}));

describe("upload de documento não é bloqueado pela ordem de consulta cadastral (SCR -> CCS -> CCF)", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockReset();
    mocks.saveDocumentBuffer.mockReset();
    mocks.saveDocumentBuffer.mockResolvedValue({
      relativePath: "empresa/ccf.pdf",
      absolutePath: "/tmp/empresa/ccf.pdf",
    });

    mocks.poolQuery.mockImplementation(async (sql: string) => {
      // validarEntidade('empresa', ...) -> existsIn('empresas', id)
      if (sql.includes("information_schema.tables")) return { rows: [{ 1: 1 }] };
      if (sql.includes("FROM public.empresas")) return { rows: [{ 1: 1 }] };
      // Nenhum SCR/CCS anexado para a empresa -- se a checagem de ordem ainda
      // estivesse ativa na rota, isto faria o upload ser rejeitado com 423.
      if (sql.includes("FROM public.documentos_arquivos") && sql.includes("tipo_documento = ANY")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO public.documentos_arquivos")) {
        return {
          rows: [{
            id: "c8b9f3c1-3333-4333-8333-333333333333",
            entidade_tipo: "empresa",
            entidade_id: EMPRESA_ID,
            empresa_id: EMPRESA_ID,
            tipo_documento: "ccf_cnpj",
            status: "ativo",
          }],
        };
      }
      throw new Error(`SQL inesperado no teste: ${sql.slice(0, 120)}`);
    });
  });

  it("aceita o CCF (CNPJ) mesmo sem SCR/CCS anexados antes", async () => {
    const { default: documentosRouter } = await import("../server/routes/documentos");
    const app = express();
    app.use(express.json());
    app.use("/api/documentos", documentosRouter);

    const resposta = await request(app)
      .post("/api/documentos/upload")
      .field("entidade_tipo", "empresa")
      .field("entidade_id", EMPRESA_ID)
      .field("tipo_documento", "ccf_cnpj")
      .attach("file", Buffer.from("%PDF-1.4 conteudo de teste"), {
        filename: "ccf.pdf",
        contentType: "application/pdf",
      });

    expect(resposta.status).toBe(201);
    expect(resposta.body?.tipo_documento).toBe("ccf_cnpj");
    // Nunca deve devolver o código de bloqueio da ordem de consulta cadastral.
    expect(resposta.body?.code).not.toBe("ORDEM_CONSULTA_CADASTRAL_REQUERIDA");
  });
});

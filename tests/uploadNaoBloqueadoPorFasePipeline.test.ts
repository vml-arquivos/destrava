import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regra de negócio (2026-08-30): o anexo de um documento nunca pode ser
// tecnicamente bloqueado pela ordem/fase do pipeline documental (CNPJ -> QSA
// -> Enquadramento -> confirmação de regime -> Atos da Junta -> Contrato
// Social/Alteração). O que falta ou está fora de ordem vira pendência visível
// no dossiê (painel de pendências / checklist), mas nunca impede o upload em
// si -- só o dossiê completo para a proposta de crédito continua exigindo a
// ordem certa. Antes desta mudança, POST /api/documentos/upload rejeitava
// (423 PIPELINE_PREVIOUS_PHASE_REQUIRED) o anexo de Atos da Junta Comercial
// quando a Fase 1 (Identidade do CNPJ) ainda não estava aprovada -- este teste
// prova que isso não acontece mais, mesmo com a Fase 1 deliberadamente
// pendente no banco.

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

describe("upload de documento não é bloqueado pela fase do pipeline", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockReset();
    mocks.saveDocumentBuffer.mockReset();
    mocks.saveDocumentBuffer.mockResolvedValue({
      relativePath: "empresa/atos.pdf",
      absolutePath: "/tmp/empresa/atos.pdf",
    });

    mocks.poolQuery.mockImplementation(async (sql: string) => {
      // validarEntidade('empresa', ...) -> existsIn('empresas', id)
      if (sql.includes("information_schema.tables")) return { rows: [{ 1: 1 }] };
      if (sql.includes("FROM public.empresas")) return { rows: [{ 1: 1 }] };
      // INSERT em documentos_arquivos -- devolve uma linha mínima suficiente
      // para auditar()/agendarAnaliseRegraDocumental() não quebrarem.
      if (sql.includes("INSERT INTO public.documentos_arquivos")) {
        return {
          rows: [{
            id: "b7a8e2b0-2222-4222-8222-222222222222",
            entidade_tipo: "empresa",
            entidade_id: EMPRESA_ID,
            empresa_id: EMPRESA_ID,
            tipo_documento: "atos_junta_comercial",
            status: "ativo",
          }],
        };
      }
      // auditoria_documentos tem .catch() próprio -- pode "falhar" sem quebrar o teste.
      throw new Error(`SQL inesperado no teste: ${sql.slice(0, 120)}`);
    });
  });

  it("aceita Atos da Junta Comercial mesmo com a Fase 1 (Identidade do CNPJ) ainda pendente", async () => {
    const { default: documentosRouter } = await import("../server/routes/documentos");
    const app = express();
    app.use(express.json());
    app.use("/api/documentos", documentosRouter);

    const resposta = await request(app)
      .post("/api/documentos/upload")
      .field("entidade_tipo", "empresa")
      .field("entidade_id", EMPRESA_ID)
      .field("tipo_documento", "atos_junta_comercial")
      .attach("file", Buffer.from("%PDF-1.4 conteudo de teste"), {
        filename: "atos.pdf",
        contentType: "application/pdf",
      });

    expect(resposta.status).toBe(201);
    expect(resposta.body?.tipo_documento).toBe("atos_junta_comercial");
    // Nunca deve devolver o código de bloqueio por fase do pipeline.
    expect(resposta.body?.code).not.toBe("PIPELINE_PREVIOUS_PHASE_REQUIRED");
  });
});

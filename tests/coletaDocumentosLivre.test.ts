import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { saveDocumentBuffer, validarArquivo } = vi.hoisted(() => ({
  saveDocumentBuffer: vi.fn(async ({ entidadeId, filename }: { entidadeId: string; filename: string }) => ({
    absolutePath: `/tmp/${filename}`,
    relativePath: `uploads/documentos/cofre_publico/${entidadeId}/${filename}`,
    sha256: "f".repeat(64),
  })),
  validarArquivo: vi.fn(),
}));

vi.mock("../server/services/documentStorage", () => ({ saveDocumentBuffer }));
vi.mock("../server/routes/documentos", () => ({
  sanitizeFileName: (value: string) => value.replace(/[^a-zA-Z0-9_.-]/g, "_"),
  validarArquivo,
}));

import { createColetaDocumentosLivreRouter, tokenHash } from "../server/routes/coletaDocumentosLivre";

const LINK_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "33333333-3333-4333-8333-333333333333";

function makePool() {
  const calls: Array<{ sql: string; params?: any[] }> = [];
  const pool = {
    calls,
    query: vi.fn(async (sql: string, params?: any[]) => {
      calls.push({ sql, params });
      if (sql.includes("FROM public.links_cofre_documentos_publico") && sql.includes("token_hash")) {
        return {
          rows: params?.[0] === tokenHash("livre-valido")
            ? [{ id: LINK_ID, status: "ativo", expira_em: "2099-01-01T00:00:00.000Z" }]
            : [],
        };
      }
      if (sql.includes("INSERT INTO public.cofre_documentos_publico")) {
        return { rows: [{ id: ITEM_ID, status: "revisao_humana", criado_em: "2099-01-01T00:00:00.000Z" }] };
      }
      if (sql.includes("INSERT INTO public.links_cofre_documentos_publico")) {
        return { rows: [{ id: LINK_ID, expira_em: "2099-01-01T00:00:00.000Z" }] };
      }
      throw new Error(`SQL inesperado: ${sql.slice(0, 120)}`);
    }),
  } as any;
  return pool;
}

function makeApp(pool: any) {
  const app = express();
  app.use(express.json());
  app.use("/api/coleta-documentos-livre", createColetaDocumentosLivreRouter(pool));
  return app;
}

describe("cofre documental público livre", () => {
  beforeEach(() => {
    saveDocumentBuffer.mockClear();
    validarArquivo.mockClear();
  });

  it("usa token hash e retorna somente contrato mínimo sem empresa ou documentos de terceiros", async () => {
    const pool = makePool();
    const response = await request(makeApp(pool)).get("/api/coleta-documentos-livre/livre-valido");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body).not.toHaveProperty("empresa");
    expect(response.body).not.toHaveProperty("empresa_id");
    expect(response.body).not.toHaveProperty("items");
    expect(response.body.tipos_pessoa).toEqual(["pf", "pj"]);
    expect(response.body.consentimento_obrigatorio).toBe(true);
  });

  it("recusa token inválido sem tocar no storage ou criar registro", async () => {
    const pool = makePool();
    const response = await request(makeApp(pool)).get("/api/coleta-documentos-livre/token-de-outra-caixa");
    expect(response.status).toBe(410);
    expect(response.body.error).toMatch(/link inválido/i);
    expect(saveDocumentBuffer).not.toHaveBeenCalled();
    expect(pool.calls.some((call) => call.sql.includes("INSERT INTO public.cofre_documentos_publico"))).toBe(false);
  });

  it("recebe PF ou PJ no cofre separado e ignora empresa_id enviado pelo remetente", async () => {
    const pool = makePool();
    const response = await request(makeApp(pool))
      .post("/api/coleta-documentos-livre/livre-valido/upload")
      .field("tipo_pessoa", "pj")
      .field("nome_remetente", "Pessoa de Homologação")
      .field("documento_tipo", "cnpj")
      .field("documento_valor", "12.345.678/0001-90")
      .field("nome_organizacao", "Empresa de Homologação")
      .field("tipo_documento", "outros")
      .field("empresa_id", "99999999-9999-4999-8999-999999999999")
      .field("consentimento", "true")
      .attach("file", Buffer.from("arquivo de teste"), { filename: "documento.pdf", contentType: "application/pdf" });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("revisao_humana");
    expect(response.body.vinculado).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain("99999999-9999-4999-8999-999999999999");
    expect(saveDocumentBuffer).toHaveBeenCalledTimes(1);
    expect(validarArquivo).toHaveBeenCalledWith(expect.anything(), "outros");
    const insert = pool.calls.find((call) => call.sql.includes("INSERT INTO public.cofre_documentos_publico"));
    expect(insert?.sql).not.toContain("empresa_id");
  });

  it("exige consentimento antes de gravar o arquivo", async () => {
    const pool = makePool();
    const response = await request(makeApp(pool))
      .post("/api/coleta-documentos-livre/livre-valido/upload")
      .field("tipo_pessoa", "pf")
      .field("nome_remetente", "Pessoa de Homologação")
      .field("tipo_documento", "cpf")
      .field("consentimento", "false")
      .attach("file", Buffer.from("arquivo de teste"), { filename: "documento.pdf", contentType: "application/pdf" });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/aceitar o uso/i);
    expect(saveDocumentBuffer).not.toHaveBeenCalled();
  });
});

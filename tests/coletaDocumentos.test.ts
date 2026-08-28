import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { montarDossieCreditoEmpresa } = vi.hoisted(() => ({ montarDossieCreditoEmpresa: vi.fn() }));

vi.mock("../server/routes/documentacao", () => ({ montarDossieCreditoEmpresa }));

import {
  createColetaDocumentosRouter,
  mapItemToPhysicalType,
  severeAlert,
  tokenHash,
} from "../server/routes/coletaDocumentos";

function fakePool() {
  return {
    query: vi.fn(async (sql: string, params?: any[]) => {
      if (sql.includes("to_regclass")) return { rows: [{ exists: true }] };
      if (sql.includes("FROM public.links_coleta_documentos") && sql.includes("token_hash")) {
        return {
          rows: params?.[0] === tokenHash("token-valido")
            ? [{ id: "11111111-1111-4111-8111-111111111111", empresa_id: "22222222-2222-4222-8222-222222222222", status: "ativo", expira_em: "2099-01-01T00:00:00.000Z" }]
            : [],
        };
      }
      if (sql.includes("FROM public.coleta_documentos") && sql.includes("ORDER BY criado_em DESC")) return { rows: [] };
      if (sql.includes("UPDATE public.links_coleta_documentos")) return { rows: [] };
      throw new Error(`SQL inesperado no teste: ${sql.slice(0, 100)}`);
    }),
    connect: vi.fn(),
  } as any;
}

describe("coleta documental pública", () => {
  beforeEach(() => {
    montarDossieCreditoEmpresa.mockReset();
    montarDossieCreditoEmpresa.mockResolvedValue({
      empresa: {
        id: "22222222-2222-4222-8222-222222222222",
        razao_social: "Empresa Simples Nacional LTDA",
        email: "interno-nao-expor@example.com",
      },
      mapa_documental_credito: {
        etapa_atual: 1,
        etapas: [
          {
            numero: 1,
            titulo: "Identidade do CNPJ",
            objetivo: "Confirmar os dados empresariais.",
            bloqueada: false,
            documentos: [
              {
                codigo: "cartao_cnpj",
                nome: "Cartão CNPJ",
                finalidade: "Confirmar o CNPJ.",
                obrigatorio: true,
                tipos_arquivo: ["cartao_cnpj", "cnpj_cartao"],
                anexado: false,
              },
              {
                codigo: "qsa",
                nome: "QSA",
                finalidade: "Confirmar os sócios.",
                obrigatorio: true,
                tipos_arquivo: ["qsa"],
                anexado: false,
              },
            ],
          },
        ],
      },
    });
  });

  it("usa hash irreversível e determinístico para o token", () => {
    expect(tokenHash("abc")).toHaveLength(64);
    expect(tokenHash("abc")).toBe(tokenHash("abc"));
    expect(tokenHash("abc")).not.toBe(tokenHash("def"));
  });

  it("não expõe dados internos nem outra empresa na resposta pública", async () => {
    const pool = fakePool();
    const app = express();
    app.use(express.json());
    app.use("/api/coleta-documentos", createColetaDocumentosRouter(pool, vi.fn().mockResolvedValue(true)));

    const response = await request(app).get("/api/coleta-documentos/token-valido");

    expect(response.status).toBe(200);
    expect(response.body.empresa).toEqual({ nome: "Empresa Simples Nacional LTDA" });
    expect(response.body.proximo_documento.codigo).toBe("cartao_cnpj");
    expect(response.body.progresso).toMatchObject({ enviados: 0, total: 2, faltam: 2, percentual: 0 });
    expect(response.body).not.toHaveProperty("programas_referencia");
    expect(response.body).not.toHaveProperty("avisos");
    expect(JSON.stringify(response.body)).not.toContain("interno-nao-expor@example.com");
    expect(JSON.stringify(response.body)).not.toContain("22222222-2222-4222-8222-222222222222");
  });

  it("devolve mensagem clara para token inválido sem consultar mapa de empresa", async () => {
    const pool = fakePool();
    const app = express();
    app.use("/api/coleta-documentos", createColetaDocumentosRouter(pool, vi.fn().mockResolvedValue(true)));

    const response = await request(app).get("/api/coleta-documentos/token-de-outra-empresa");

    expect(response.status).toBe(410);
    expect(response.body.error).toMatch(/link inválido/i);
    expect(montarDossieCreditoEmpresa).not.toHaveBeenCalled();
  });

  it("aceita apenas o tipo físico conhecido ou cai em outros sem violar a constraint", () => {
    expect(mapItemToPhysicalType({ codigo: "faturamento_12m", nome: "", finalidade: "", tipos_arquivo: ["faturamento_12_meses"], obrigatorio: true, fase: 4 })).toBe("faturamento_12_meses");
    expect(mapItemToPhysicalType({ codigo: "ccmei", nome: "", finalidade: "", tipos_arquivo: ["ccmei"], obrigatorio: true, fase: 3 })).toBe("outros");
  });

  it("trata alertas altos ou críticos como revisão e não como aprovação automática", () => {
    expect(severeAlert({ alertas: [{ severidade: "alta" }] })).toBe(true);
    expect(severeAlert({ alertas: [{ severidade: "media" }] })).toBe(false);
    expect(severeAlert({ divergencias: [{ severidade: "critica" }] })).toBe(true);
  });
});

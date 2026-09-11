import { describe, expect, it } from "vitest";
import {
  calcularDataMaturidade12Meses,
  empresaInativaParaAcompanhamento,
  formatarDataMaturidade12Meses,
  reconciliarFollowupMaturidade12Meses,
} from "../server/services/empresaMaturidadeFollowup";

describe("empresaMaturidadeFollowup", () => {
  it("calcula exatamente doze meses corridos sem deslocamento de timezone", () => {
    const data = calcularDataMaturidade12Meses("2025-08-27");

    expect(data?.toISOString()).toBe("2026-08-27T00:00:00.000Z");
    expect(formatarDataMaturidade12Meses(data!)).toBe("27/08/2026");
  });

  it("normaliza 29 de fevereiro para o último dia do mês de destino", () => {
    const data = calcularDataMaturidade12Meses("2024-02-29");

    expect(data?.toISOString()).toBe("2025-02-28T00:00:00.000Z");
  });

  it("recusa datas inválidas e não inventa data de maturidade", () => {
    expect(calcularDataMaturidade12Meses("2025-02-29")).toBeNull();
    expect(calcularDataMaturidade12Meses(null)).toBeNull();
  });

  it.each([
    { status: "inativo", arquivado_por_duplicidade: false },
    { status: "arquivada", arquivado_por_duplicidade: false },
    { status: "ativo", arquivado_por_duplicidade: true },
  ])("fecha o acompanhamento para cadastro inativo/duplicado: %#", empresa => {
    expect(empresaInativaParaAcompanhamento(empresa)).toBe(true);
  });

  it("mantém empresas ativas no acompanhamento", () => {
    expect(
      empresaInativaParaAcompanhamento({
        status: "ativo",
        arquivado_por_duplicidade: false,
      })
    ).toBe(false);
  });
});

type FakePool = {
  calls: unknown[][];
  query: (...args: unknown[]) => Promise<{ rows: any[] }>;
};

function criarPoolFake(respostas: Array<{ rows: any[] }>): FakePool {
  const calls: unknown[][] = [];
  return {
    calls,
    query: async (...args: unknown[]) => {
      calls.push(args);
      const resposta = respostas.shift();
      if (!resposta) throw new Error("Resposta fake não configurada");
      return resposta;
    },
  };
}

describe("reconciliação do follow-up de maturidade", () => {
  it("cria um único lembrete para uma empresa ainda recente", async () => {
    const pool = criarPoolFake([
      {
        rows: [
          {
            id: "empresa-1",
            data_abertura: "2025-08-27",
            status: "ativo",
            arquivado_por_duplicidade: false,
          },
        ],
      },
      { rows: [] },
      {
        rows: [
          {
            id: "followup-1",
            empresa_id: "empresa-1",
            titulo:
              "Reavaliar elegibilidade de crédito — empresa completa 12 meses de abertura em 27/08/2026.",
            tipo: "ligacao",
            data_agendada: "2026-08-27T00:00:00.000Z",
            descricao:
              "Lembrete automático de acompanhamento. Reavaliar a aptidão para crédito a partir de 27/08/2026, após revisar os documentos e demais critérios vigentes.",
            origem: "maturidade_12_meses",
            concluido: false,
          },
        ],
      },
    ]);

    const result = await reconciliarFollowupMaturidade12Meses(
      pool as any,
      "empresa-1",
      {
        empresaApta12Meses: false,
        agora: new Date("2026-01-01T00:00:00.000Z"),
      }
    );

    expect(result.alterado).toBe(true);
    expect(result.followup?.origem).toBe("maturidade_12_meses");
    expect(pool.calls).toHaveLength(3);
  });

  it("não insere uma duplicata quando o lembrete automático já existe", async () => {
    const pool = criarPoolFake([
      {
        rows: [
          {
            id: "empresa-1",
            data_abertura: "2025-08-27",
            status: "ativo",
            arquivado_por_duplicidade: false,
          },
        ],
      },
      {
        rows: [
          {
            id: "followup-1",
            empresa_id: "empresa-1",
            titulo:
              "Reavaliar elegibilidade de crédito — empresa completa 12 meses de abertura em 27/08/2026.",
            tipo: "ligacao",
            data_agendada: "2026-08-27T00:00:00.000Z",
            descricao:
              "Lembrete automático de acompanhamento. Reavaliar a aptidão para crédito a partir de 27/08/2026, após revisar os documentos e demais critérios vigentes.",
            origem: "maturidade_12_meses",
            concluido: false,
          },
        ],
      },
    ]);

    const result = await reconciliarFollowupMaturidade12Meses(
      pool as any,
      "empresa-1",
      { empresaApta12Meses: false }
    );

    expect(result.alterado).toBe(false);
    expect(pool.calls).toHaveLength(2);
  });

  it("atualiza e reabre o lembrete quando a data de abertura é corrigida", async () => {
    const pool = criarPoolFake([
      {
        rows: [
          {
            id: "empresa-1",
            data_abertura: "2025-09-01",
            status: "ativo",
            arquivado_por_duplicidade: false,
          },
        ],
      },
      {
        rows: [
          {
            id: "followup-1",
            empresa_id: "empresa-1",
            titulo: "título antigo",
            tipo: "ligacao",
            data_agendada: "2026-08-27T00:00:00.000Z",
            descricao: "descrição antiga",
            origem: "maturidade_12_meses",
            concluido: true,
            concluido_em: "2026-08-28T00:00:00.000Z",
          },
        ],
      },
      { rows: [{ id: "followup-1", concluido: false }] },
    ]);

    await reconciliarFollowupMaturidade12Meses(pool as any, "empresa-1", {
      empresaApta12Meses: false,
    });

    expect(pool.calls).toHaveLength(3);
    expect((pool.calls[2]?.[1] as unknown[])[1]).toBe(
      "2026-09-01T00:00:00.000Z"
    );
    expect((pool.calls[2]?.[1] as unknown[])[3]).toBe(true);
  });

  it("fecha o lembrete pendente quando a empresa é arquivada", async () => {
    const pool = criarPoolFake([
      {
        rows: [
          {
            id: "empresa-1",
            data_abertura: "2025-08-27",
            status: "inativo",
            arquivado_por_duplicidade: false,
          },
        ],
      },
      {
        rows: [
          {
            id: "followup-1",
            empresa_id: "empresa-1",
            origem: "maturidade_12_meses",
            concluido: false,
          },
        ],
      },
      { rows: [{ id: "followup-1", concluido: true }] },
    ]);

    const result = await reconciliarFollowupMaturidade12Meses(
      pool as any,
      "empresa-1"
    );

    expect(result.alterado).toBe(true);
    expect(result.followup?.concluido).toBe(true);
    expect(pool.calls).toHaveLength(3);
  });
});

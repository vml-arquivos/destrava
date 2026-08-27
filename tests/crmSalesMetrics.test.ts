import { describe, expect, it } from "vitest";
import {
  arredondarMoeda,
  agruparForecast,
  agruparMetricasVendas,
  normalizarMetas,
  normalizarPeriodoMensal,
  percentualAtingimento,
} from "../server/services/crmSalesMetrics";

describe("crmSalesMetrics", () => {
  it("normaliza um período para o primeiro dia do mês e seu limite exclusivo", () => {
    expect(normalizarPeriodoMensal("2026-08")).toEqual({
      chave: "2026-08-01",
      inicio: "2026-08-01T00:00:00.000Z",
      fim: "2026-09-01T00:00:00.000Z",
    });
    expect(normalizarPeriodoMensal("2026-08-27").chave).toBe("2026-08-01");
  });

  it("rejeita período e metas inválidos", () => {
    expect(() => normalizarPeriodoMensal("08/2026")).toThrow(/YYYY-MM/);
    expect(() => normalizarMetas({ meta_leads: -1 })).toThrow(/meta_leads/);
    expect(() => normalizarMetas({ meta_convertidos: 1.5 })).toThrow(/inteiro/);
    expect(() => normalizarMetas({ meta_valor: "abc" })).toThrow(/meta_valor/);
  });

  it("normaliza metas vazias e calcula atingimento sem dividir por zero", () => {
    expect(normalizarMetas({})).toEqual({ meta_leads: 0, meta_convertidos: 0, meta_valor: 0 });
    expect(percentualAtingimento(5, 10)).toBe(50);
    expect(percentualAtingimento(5, 0)).toBeNull();
    expect(arredondarMoeda("1234.567")).toBe(1234.57);
  });

  it("agrega métricas de vendas sem contar contratos sem lead no ciclo", () => {
    const result = agruparMetricasVendas([
      { responsavel_id: "a", responsavel_nome: "Ana", contratos_fechados: 2, receita_fechada: 3000, ticket_medio: 1500, tempo_ciclo_dias: 10, contratos_sem_lead: 1 },
      { responsavel_id: null, responsavel_nome: null, contratos_fechados: 1, receita_fechada: 500, ticket_medio: 500, tempo_ciclo_dias: null, contratos_sem_lead: 1 },
    ]);
    expect(result.totais).toEqual({
      contratos_fechados: 3,
      receita_fechada: 3500,
      ticket_medio: 1166.67,
      tempo_ciclo_dias: 10,
      contratos_sem_lead: 2,
    });
    expect(result.por_vendedor[0]).toMatchObject({ responsavel_id: "a", contratos_fechados: 2, receita_fechada: 3000 });
  });

  it("agrega pipeline bruto e forecast ponderado sem misturar responsáveis", () => {
    const result = agruparForecast([
      { etapa_funil: "novo", responsavel_id: "a", responsavel_nome: "Ana", total_leads: 2, pipeline_bruto: "1000", forecast_ponderado: "250" },
      { etapa_funil: "negociacao", responsavel_id: "a", responsavel_nome: "Ana", total_leads: 1, pipeline_bruto: 2000, forecast_ponderado: 1000 },
      { etapa_funil: "novo", responsavel_id: null, responsavel_nome: null, total_leads: 1, pipeline_bruto: 500, forecast_ponderado: 0 },
    ]);

    expect(result.totais).toEqual({ total_leads: 4, pipeline_bruto: 3500, forecast_ponderado: 1250 });
    expect(result.por_etapa[0]).toMatchObject({ etapa_funil: "negociacao", total_leads: 1, forecast_ponderado: 1000 });
    expect(result.por_responsavel).toEqual([
      { responsavel_id: "a", responsavel_nome: "Ana", total_leads: 3, pipeline_bruto: 3000, forecast_ponderado: 1250 },
      { responsavel_id: null, responsavel_nome: null, total_leads: 1, pipeline_bruto: 500, forecast_ponderado: 0 },
    ]);
  });
});

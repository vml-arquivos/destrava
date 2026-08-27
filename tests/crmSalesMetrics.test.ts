import { describe, expect, it } from "vitest";
import {
  arredondarMoeda,
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
});

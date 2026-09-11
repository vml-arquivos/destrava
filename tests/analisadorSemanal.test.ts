import { afterEach, describe, expect, it, vi } from "vitest";
import { analisarLote } from "../server/services/analisadorSemanal";

describe("analisarLote", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registra a semana inválida e continua processando as demais", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const resultado = analisarLote({
      client_id: "cliente-log-1",
      annual_revenue_declared: 1_200_000,
      weeks: [
        {
          numero_semana: 1,
          data_referencia_inicio: "2026-08-03",
          entrada_pix: 25_000,
        },
        {
          numero_semana: 2,
          data_referencia_inicio: "data-invalida",
          entrada_pix: 30_000,
        },
        {
          numero_semana: 3,
          data_referencia_inicio: "2026-08-17",
          entrada_pix: 28_000,
        },
      ],
    });

    expect(resultado.summary.total_weeks).toBe(2);
    expect(resultado.analyses).toHaveLength(2);
    expect(resultado.analyses.map((analysis) => analysis.week_start)).toEqual([
      "2026-08-03",
      "2026-08-17",
    ]);
    expect(warn).toHaveBeenCalledWith(
      "[analisadorSemanal] Semana com dados inválidos ignorada no lote (client_id=cliente-log-1, data_referencia_inicio=data-invalida):",
      'week_start inválido: "data-inval". Use o formato YYYY-MM-DD.'
    );
  });
});

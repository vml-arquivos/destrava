import { describe, expect, it } from "vitest";
import { calcularPosicaoSemanaNoMes } from "../server/funcoes_acompanhamento";

describe("calcularPosicaoSemanaNoMes", () => {
  const semanas = [
    { numero_semana: 1, data_referencia_inicio: "2026-08-01" },
    { numero_semana: 2, data_referencia_inicio: "2026-08-08" },
    { numero_semana: 3, data_referencia_inicio: "2026-09-01" },
    { numero_semana: 4, data_referencia_inicio: "2026-09-08" },
    { numero_semana: 5, data_referencia_inicio: "2026-09-15" },
  ];

  it("reinicia a posição na virada do mês e inclui a semana atual", () => {
    expect(calcularPosicaoSemanaNoMes(semanas, 3, 9, 2026)).toBe(1);
    expect(calcularPosicaoSemanaNoMes(semanas, 4, 9, 2026)).toBe(2);
  });

  it("ignora semanas futuras e semanas de outro mês ou ano", () => {
    expect(calcularPosicaoSemanaNoMes(semanas, 4, 8, 2026)).toBe(2);
    expect(calcularPosicaoSemanaNoMes(semanas, 4, 9, 2025)).toBe(1);
  });

  it("retorna a posição inicial segura quando não há data compatível", () => {
    expect(
      calcularPosicaoSemanaNoMes(
        [{ numero_semana: 1 }, { numero_semana: 2, data_referencia_inicio: null }],
        2,
        9,
        2026
      )
    ).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { calcularInteligenciaAcompanhamentoBancario } from "../server/services/inteligenciaAcompanhamentoBancarioService";

const acompanhamentoBase = {
  id: "acomp-1",
  nome_empresa: "Empresa Rating Teste LTDA",
  banco_observado: "SICOOB",
  faturamento_anual: 355000,
  media_mensal: 29583.33,
  margem_seguranca_30: 38458.33,
  percentual_operacional: 30,
  rating_interno_inicial: "R12",
  rating_interno_atual: "R10",
  rating_bacen_inicial: "D",
};

function semana(overrides: Record<string, any>) {
  return {
    numero_semana: 1,
    data_referencia_inicio: "2026-06-01",
    data_referencia_fim: "2026-06-07",
    entrada_maquininha: 0,
    entrada_pix: 0,
    entrada_boleto: 0,
    entrada_ted: 0,
    entrada_dinheiro: 0,
    outras_entradas: 0,
    total_saidas: 0,
    saldo_semanal: 0,
    status_aderencia: "aguardando_atualizacao",
    ...overrides,
  };
}

describe("inteligenciaAcompanhamentoBancarioService", () => {
  it("funciona com acompanhamento sem semanas e não retorna arrays undefined", () => {
    const r = calcularInteligenciaAcompanhamentoBancario({ acompanhamento: acompanhamentoBase, atualizacoes: undefined as any });
    expect(r.statusInteligente).toBeDefined();
    expect(Array.isArray(r.diagnostico)).toBe(true);
    expect(Array.isArray(r.alertas)).toBe(true);
    expect(Array.isArray(r.planoAcao)).toBe(true);
    expect(r.parecerTecnico.length).toBeGreaterThan(20);
  });

  it("classifica saldo negativo como crítico e não recomendada", () => {
    const r = calcularInteligenciaAcompanhamentoBancario({
      acompanhamento: acompanhamentoBase,
      atualizacoes: [
        semana({
          numero_semana: 7,
          data_referencia_inicio: "2026-06-11",
          data_referencia_fim: "2026-06-17",
          entrada_pix: 15773.29,
          entrada_boleto: 1215,
          total_saidas: 21207.86,
          saldo_semanal: -4219.57,
          status_aderencia: "critico",
        }),
      ],
    });
    expect(r.statusInteligente).toBe("critico");
    expect(r.prontidaoCredito).toBe("nao_recomendada");
    expect(r.impactoNoRating).toBe("exige_correcao");
    expect(r.alertas.some((a) => a.titulo.toLowerCase().includes("saldo"))).toBe(true);
  });

  it("classifica acompanhamento positivo como quase pronto ou pronto", () => {
    const r = calcularInteligenciaAcompanhamentoBancario({
      acompanhamento: acompanhamentoBase,
      atualizacoes: [
        semana({ numero_semana: 1, entrada_pix: 7400, total_saidas: 3000, saldo_semanal: 4400, status_aderencia: "dentro_da_faixa" }),
        semana({ numero_semana: 2, data_referencia_inicio: "2026-06-08", data_referencia_fim: "2026-06-14", entrada_pix: 7600, total_saidas: 3100, saldo_semanal: 4500, status_aderencia: "dentro_da_faixa" }),
        semana({ numero_semana: 3, data_referencia_inicio: "2026-06-15", data_referencia_fim: "2026-06-21", entrada_pix: 7700, total_saidas: 3200, saldo_semanal: 4500, status_aderencia: "dentro_da_faixa" }),
      ],
    });
    expect(r.statusInteligente).toBe("positivo");
    expect(["quase_pronta", "pronta"]).toContain(r.prontidaoCredito);
    expect(["melhora", "mantem"]).toContain(r.impactoNoRating);
  });

  it("aponta atenção quando a movimentação fica abaixo da referência", () => {
    const r = calcularInteligenciaAcompanhamentoBancario({
      acompanhamento: acompanhamentoBase,
      atualizacoes: [semana({ entrada_pix: 1000, total_saidas: 500, saldo_semanal: 500, status_aderencia: "abaixo_da_referencia" })],
    });
    expect(r.statusInteligente).toBe("atencao");
    expect(r.pontosAtencao.some((p) => p.titulo.toLowerCase().includes("abaixo"))).toBe(true);
  });

  it("não inventa faturamento quando a base financeira está ausente", () => {
    const r = calcularInteligenciaAcompanhamentoBancario({
      acompanhamento: { ...acompanhamentoBase, faturamento_anual: null },
      atualizacoes: [semana({ entrada_pix: 5000, total_saidas: 2000, saldo_semanal: 3000 })],
    });
    expect(r.metricas.faturamento_anual).toBeNull();
    expect(r.alertas.some((a) => a.titulo.includes("Faturamento anual"))).toBe(true);
  });
});

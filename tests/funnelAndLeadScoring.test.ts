import { describe, expect, it } from "vitest";
import {
  etapaFunilEhValida,
  etapaFunilParaPersistencia,
  etapaFunilPersistidaParaUi,
  normalizarEtapaFunil,
} from "../shared/funnel";
import {
  calcularScoreBasico,
  calcularScoreEfetivo,
} from "../shared/leadScoring";

describe("taxonomia única do funil", () => {
  it("normaliza etapas canônicas e legadas para o mesmo ID de UI", () => {
    expect(normalizarEtapaFunil("Novo")).toBe("novo_lead");
    expect(normalizarEtapaFunil("contato")).toBe("tentando_contato");
    expect(normalizarEtapaFunil("documentacao")).toBe("documentos_pendentes");
    expect(normalizarEtapaFunil("ganho")).toBe("fechado");
  });

  it("mantém a fronteira de persistência legada sem duplicar mapas no backend", () => {
    expect(etapaFunilParaPersistencia("novo_lead")).toBe("entrada");
    expect(etapaFunilParaPersistencia("em_atendimento")).toBe("contato");
    expect(etapaFunilParaPersistencia("fechado")).toBe("ganho");
    expect(etapaFunilPersistidaParaUi("carteira")).toBe("em_execucao");
  });

  it("rejeita valores desconhecidos sem alterar o fallback de normalização", () => {
    expect(etapaFunilEhValida("etapa_inexistente")).toBe(false);
    expect(normalizarEtapaFunil("etapa_inexistente")).toBe("novo_lead");
    expect(etapaFunilEhValida("novo_lead")).toBe(true);
  });
});

describe("score básico operacional", () => {
  it("aplica a fórmula determinística e limita o resultado entre 0 e 100", () => {
    const score = calcularScoreBasico({
      valor_solicitado: 100_000,
      prazo_meses: 36,
      nome: "Empresa Exemplo",
      telefone: "61999999999",
      email: "contato@exemplo.com",
      empresa: "Exemplo Ltda",
      cpf_cnpj: "12.345.678/0001-90",
      temperatura: "quente",
    });

    expect(score).toBe(82);
    expect(calcularScoreBasico({ valor_solicitado: -1, prazo_meses: -1 })).toBe(
      0
    );
    expect(
      calcularScoreBasico({
        valor_solicitado: 5_000_000,
        prazo_meses: 60,
        nome: "A",
        telefone: "1",
        email: "a@a",
        empresa: "A",
        cpf_cnpj: "1",
        temperatura: "urgente",
      })
    ).toBe(100);
  });

  it("prioriza score manual, depois IA, depois score básico persistido", () => {
    expect(
      calcularScoreEfetivo({ score_manual: 42, score_ia: 90, score_basico: 80 })
    ).toBe(42);
    expect(calcularScoreEfetivo({ score_ia: 90, score_basico: 80 })).toBe(90);
    expect(calcularScoreEfetivo({ score_ia: 0, score_basico: 80 })).toBe(80);
  });
});

import { describe, expect, it } from "vitest";
import goldenCases from "./fixtures/analise-documental-golden.json";
import { executarAgenteAnaliseSocietaria } from "../server/services/analiseDocumentalEspecializada";

describe("dataset dourado de análise documental societária", () => {
  for (const caso of goldenCases) {
    it(caso.id, () => {
      const resultado = executarAgenteAnaliseSocietaria(
        caso.contrato,
        caso.atos,
        caso.empresa,
        caso.socios_qsa
      );

      expect(resultado.status_documento).toBe(caso.expected.status_documento);
      expect(resultado.confronto_qsa.status).toBe(caso.expected.confronto_qsa);
      expect(resultado.estado_atual.fonte).toBe(
        caso.expected.estado_atual_fonte
      );
      expect(resultado.qsa_adicional_necessario).toBe(
        caso.expected.qsa_adicional_necessario
      );
      expect(resultado.revisao_obrigatoria).toBe(
        caso.expected.revisao_obrigatoria
      );
      if (caso.expected.ato_praticado_contains) {
        expect(resultado.ato_praticado).toContain(
          caso.expected.ato_praticado_contains
        );
      }
    });
  }
});

import { describe, expect, it } from "vitest";
import { gerarCodigoIndicacao, montarLinkIndicacao, normalizarCodigoIndicacao } from "../server/services/referralService";

describe("serviço de indicação", () => {
  it("normaliza códigos sem aceitar conteúdo arbitrário", () => {
    expect(normalizarCodigoIndicacao(" parc-abc!  ")).toBe("PARC-ABC");
    expect(normalizarCodigoIndicacao("***")).toBe(null);
    expect(normalizarCodigoIndicacao("A".repeat(100))).toHaveLength(64);
  });

  it("gera código opaco e link público codificado", () => {
    const codigo = gerarCodigoIndicacao();
    expect(codigo).toMatch(/^PARC-[A-F0-9]{12}$/);
    expect(montarLinkIndicacao(codigo, "https://exemplo.test/")).toBe(
      `https://exemplo.test/simular?ref=${encodeURIComponent(codigo)}`,
    );
  });
});

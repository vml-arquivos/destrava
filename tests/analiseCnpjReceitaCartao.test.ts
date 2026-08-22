import { describe, expect, it } from "vitest";
import { calcularScore } from "../server/services/analiseCnpjReceitaCartao";

describe("calcularScore — leitura do Cartão CNPJ", () => {
  const camposReceitaCompletos = {
    cnpj_limpo: "12345678000190",
    nome_empresarial: "Empresa Exemplo Ltda.",
    data_abertura: "2020-01-01",
    cnae_principal: "6201501",
    natureza_juridica: "2062",
    situacao_cadastral: "ATIVA",
    idade_meses: 60,
  };

  it("alerta quando o cartão existe, a extração falha e não há data manual", () => {
    const alertas: any[] = [];
    const resultado = calcularScore({
      camposReceita: camposReceitaCompletos,
      cartao: { id: "cartao-1" },
      extracao: null,
      divergencias: [],
      alertas,
      socios: [{ nome: "Sócio Exemplo" }],
    });

    expect(resultado.score).toBe(95);
    expect(alertas).toContainEqual(expect.objectContaining({
      codigo: "cartao_cnpj_extracao_falhou",
      severidade: "media",
    }));
  });

  it("não cria o alerta quando existe data de emissão manual", () => {
    const alertas: any[] = [];
    calcularScore({
      camposReceita: camposReceitaCompletos,
      cartao: { id: "cartao-1", data_emissao_documento: "2026-08-01" },
      extracao: null,
      divergencias: [],
      alertas,
      socios: [{ nome: "Sócio Exemplo" }],
    });

    expect(alertas).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ codigo: "cartao_cnpj_extracao_falhou" }),
    ]));
  });
});

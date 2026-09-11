/**
 * situacaoCadastral.test.ts
 *
 * Sprint 8.1 — Normalização Cadastral e Blindagem dos Diagnósticos.
 */

import { describe, expect, it } from "vitest";
import {
  classificarSituacaoCadastral,
  isSituacaoAtiva,
  isSituacaoInativa,
  isSituacaoIrregular,
  normalizarSituacaoCadastral,
} from "../server/utils/situacaoCadastral";
import { calcularPendencias } from "../server/services/pendenciasEmpresaService";
import { calcularPropostaBancaria } from "../server/services/propostaBancariaService";
import { gerarRelatorioTecnico } from "../server/services/relatorioTecnicoEmpresaService";
import { calcularEsteiraCredito } from "../server/services/esteiraCreditoService";

function inputBase(situacao_cadastral: unknown) {
  return {
    empresa: {
      id: "emp-situacao",
      cnpj: "12345678000195",
      razao_social: "Empresa Situação Teste LTDA",
      situacao_cadastral,
      cnae_principal: "6201-5/01",
      email: "contato@teste.com",
      telefone: "11999999999",
      faturamento_anual: 1_200_000,
      capital_social: 100_000,
    },
    socios: [{ id: "s1", nome: "Sócio Teste", cpf_cnpj: "12345678901", representante_legal: true }],
    documentos: [
      { id: "d1", tipo: "contrato_social", arquivo_path: "/docs/contrato.pdf", status: "validado" },
      { id: "d2", tipo: "cartao_cnpj", arquivo_path: "/docs/cnpj.pdf", status: "validado" },
      { id: "d3", tipo: "extrato", arquivo_path: "/docs/extrato.pdf", status: "validado" },
    ],
    simulacoes: [{ id: "sim1", produto: "Capital de Giro", valor_solicitado: 100000, prazo_meses: 24, status: "ativa" }],
    orcamentos: [],
    contratos: [],
    historico: [],
    followups: [],
    acompanhamentos: [],
  };
}

describe("situacaoCadastral utilitário", () => {
  it("normaliza acentos, caixa e ruído textual", () => {
    expect(normalizarSituacaoCadastral("Situação cadastral: ATIVA")).toBe("situacao cadastral ativa");
  });

  it.each(["ATIVA", "ativa", "Ativa", "Situação cadastral: ATIVA", "Regular", "HABILITADA"])(
    "%s deve ser ativa",
    (valor) => {
      expect(isSituacaoAtiva(valor)).toBe(true);
      expect(classificarSituacaoCadastral(valor)).toBe("ativa");
    },
  );

  it.each(["INATIVA", "inativa", "BAIXADA", "SUSPENSA", "INAPTA", "NULA", "CANCELADA", "PARALISADA"])(
    "%s nunca pode ser ativa",
    (valor) => {
      expect(isSituacaoAtiva(valor)).toBe(false);
      expect(isSituacaoInativa(valor)).toBe(true);
      expect(isSituacaoIrregular(valor)).toBe(true);
    },
  );

  it("não confunde textos longos com INATIVA", () => {
    expect(isSituacaoAtiva("Situação cadastral: INATIVA")).toBe(false);
    expect(isSituacaoIrregular("Situação cadastral: INATIVA")).toBe(true);
  });

  it("classifica empresa baixada na Receita como irregular", () => {
    expect(isSituacaoIrregular("Empresa baixada na Receita")).toBe(true);
    expect(classificarSituacaoCadastral("Empresa baixada na Receita")).toBe("inativa");
  });

  it.each([null, undefined, "", "Não informado", "não informada"])("%s deve ser desconhecida e não ativa", (valor) => {
    expect(isSituacaoAtiva(valor)).toBe(false);
    expect(isSituacaoIrregular(valor)).toBe(false);
    expect(classificarSituacaoCadastral(valor)).toBe("desconhecida");
  });
});

describe("blindagem dos motores com situação INATIVA", () => {
  it("Motor de Pendências cria pendência crítica para INATIVA", () => {
    const resultado = calcularPendencias(inputBase("INATIVA"));
    const pendencia = resultado.grupos.flatMap((g) => g.pendencias).find((p) => p.id.includes("situacao-irregular"));
    expect(pendencia).toBeTruthy();
    expect(pendencia?.prioridade).toBe("alta");
  });

  it("Proposta Bancária não considera INATIVA como pronta", () => {
    const resultado = calcularPropostaBancaria(inputBase("INATIVA"));
    expect(resultado.status_proposta).not.toBe("apto_analise");
    expect(resultado.riscos.some((r) => r.tipo === "regulatório")).toBe(true);
    expect(resultado.pontosFortes.join(" ")).not.toContain("situação cadastral ativa");
  });

  it("Relatório Técnico aponta risco cadastral para BAIXADA", () => {
    const resultado = gerarRelatorioTecnico(inputBase("BAIXADA"));
    expect(resultado.analise_cadastral.status).toBe("critico");
    expect(resultado.pendencias.some((p) => p.descricao.includes("Situação cadastral irregular"))).toBe(true);
  });

  it("Esteira de Crédito bloqueia cadastro para INAPTA", () => {
    const resultado = calcularEsteiraCredito(inputBase("INAPTA"));
    const etapaCadastro = resultado.etapas.find((e) => e.id === "cadastro_qualificacao");
    expect(etapaCadastro?.status).toBe("bloqueada");
    expect(etapaCadastro?.bloqueios.some((b) => b.id === "e1-situacao")).toBe(true);
  });

  it("motores aceitam ATIVA como situação positiva", () => {
    const pendencias = calcularPendencias(inputBase("ATIVA"));
    expect(pendencias.grupos.flatMap((g) => g.pendencias).some((p) => p.id.includes("situacao-irregular"))).toBe(false);

    const proposta = calcularPropostaBancaria(inputBase("ATIVA"));
    expect(proposta.pontosFortes.join(" ")).toContain("situação cadastral ativa");
  });
});

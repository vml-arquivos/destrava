import { describe, expect, it } from "vitest";
import { obterPerfilAnaliseDocumental } from "../server/services/documentAnalysisProfiles";

// CORREÇÃO (Rodada 33, 05/09/2026, diagnóstico cruzado de duas pesquisas
// independentes -- "Manus AI" e GPT -- sobre a matriz documental de crédito):
// as duas pesquisas descrevem Cartão CNPJ, CADIN, SCR/rating Bacen, CCS, CCF,
// Cenprot e Serasa como snapshot/consulta de cadastro ou bureau, SEM prazo de
// validade com fonte normativa (CADIN citado nominalmente pelas duas como não
// equivalente a uma CND federal) -- diferente das certidões com prazo
// definido em serviço oficial (CND/PGFN, CRF/FGTS, CNDT, estaduais/municipais)
// e das obrigações fiscais com prazo em lei (PGDAS-D, ECF, ECD, DEFIS etc.).
// Este teste prova que a nova classificação `grauFonte` reflete essa
// distinção sem alterar nenhum resultado de classificação temporal já
// existente (politicaTemporal/validadePadraoDias continuam idênticos).
describe("obterPerfilAnaliseDocumental -- grauFonte (Rodada 33)", () => {
  it("bureau/cadastro (snapshot sem fonte normativa de prazo) é classificado como PRATICA_MERCADO, mantendo a política temporal já existente", () => {
    for (const tipo of [
      "cartao_cnpj", "cadin_cnpj", "cadin_cpf", "rating_bacen_cnpj", "ccs_cnpj",
      "ccf_cnpj", "cenprot_cnpj", "consulta_serasa_cnpj", "situacao_fiscal_cnpj",
    ]) {
      const perfil = obterPerfilAnaliseDocumental(tipo);
      expect(perfil.grauFonte).toBe("PRATICA_MERCADO");
      expect(perfil.politicaTemporal).toBe("emissao_30_dias");
      expect(perfil.validadePadraoDias).toBe(30);
    }
  });

  it("certidões com validade definida por serviço oficial continuam ORGAO_OFICIAL, sem prazo fixo inventado", () => {
    for (const tipo of ["cnd_rfb_cnpj", "pgfn_cnpj", "crf_fgts", "cndt", "cnd_estadual", "cnd_municipal"]) {
      const perfil = obterPerfilAnaliseDocumental(tipo);
      expect(perfil.grauFonte).toBe("ORGAO_OFICIAL");
      expect(perfil.politicaTemporal).toBe("validade_expressa");
      expect(perfil.validadePadraoDias).toBeNull();
    }
  });

  it("obrigações fiscais por competência são LEI_NORMA", () => {
    for (const tipo of ["pgdas", "dctf", "ecf", "ecd", "defis", "dasn_simei", "efd_contribuicoes"]) {
      expect(obterPerfilAnaliseDocumental(tipo).grauFonte).toBe("LEI_NORMA");
    }
  });

  it("comprovante de residência é PRATICA_MERCADO (prazo de 60 dias é política, não lei -- ver diagnóstico da Rodada 33)", () => {
    const perfil = obterPerfilAnaliseDocumental("comprovante_residencia");
    expect(perfil.grauFonte).toBe("PRATICA_MERCADO");
    expect(perfil.politicaTemporal).toBe("emissao_60_dias");
    expect(perfil.validadePadraoDias).toBe(60);
  });

  it("tipo fora da tabela POLITICA_POR_TIPO (perfil genérico por categoria) devolve grauFonte nulo, sem inventar classificação", () => {
    const perfil = obterPerfilAnaliseDocumental("tipo_documento_totalmente_desconhecido_xyz");
    expect(perfil.grauFonte).toBeNull();
    expect(perfil.politicaTemporal).toBe("sem_validade_formal");
  });

  it("descricaoPerfilParaPrompt avisa explicitamente quando o prazo é prática de mercado, para a IA nunca apresentar como obrigação legal", async () => {
    const { descricaoPerfilParaPrompt } = await import("../server/services/documentAnalysisProfiles");
    expect(descricaoPerfilParaPrompt("cadin_cnpj")).toMatch(/política de crédito\/prática de mercado, não obrigação legal/);
    expect(descricaoPerfilParaPrompt("ecf")).not.toMatch(/política de crédito\/prática de mercado/);
  });
});

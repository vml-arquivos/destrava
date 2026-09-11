import { describe, expect, it } from "vitest";
import { obterPerfilAnaliseDocumental, descricaoPerfilParaPrompt } from "../server/services/documentAnalysisProfiles";

describe("matriz temporal documental oficial", () => {
  it("cadastros e consultas públicas são snapshots, sem vencimento fixo inventado", () => {
    for (const tipo of [
      "cartao_cnpj", "cadin_cnpj", "cadin_cpf", "pgfn_cnpj", "pgfn_cpf",
      "rating_bacen_cnpj", "ccs_cnpj", "ccf_cnpj", "cenprot_cnpj", "situacao_fiscal_cnpj",
    ]) {
      const perfil = obterPerfilAnaliseDocumental(tipo);
      expect(perfil.grauFonte).toBe("ORGAO_OFICIAL");
      expect(perfil.politicaTemporal).toBe("snapshot_atual");
      expect(perfil.validadePadraoDias).toBeNull();
    }
  });

  it("Serasa é snapshot de bureau privado/prática de crédito, sem validade legal fixa", () => {
    for (const tipo of ["consulta_serasa_cnpj", "consulta_serasa_cpf"]) {
      const perfil = obterPerfilAnaliseDocumental(tipo);
      expect(perfil.grauFonte).toBe("PRATICA_MERCADO");
      expect(perfil.politicaTemporal).toBe("snapshot_atual");
      expect(perfil.validadePadraoDias).toBeNull();
    }
  });

  it("certidões com validade definida pelo emissor continuam com validade expressa", () => {
    for (const tipo of ["cnd_rfb_cnpj", "crf_fgts", "cndt", "cnd_estadual", "cnd_municipal"]) {
      const perfil = obterPerfilAnaliseDocumental(tipo);
      expect(perfil.grauFonte).toBe("ORGAO_OFICIAL");
      expect(perfil.politicaTemporal).toBe("validade_expressa");
      expect(perfil.validadePadraoDias).toBeNull();
    }
  });

  it("obrigações fiscais por competência continuam LEI_NORMA", () => {
    for (const tipo of ["pgdas", "dctf", "ecf", "ecd", "defis", "dasn_simei", "efd_contribuicoes"]) {
      expect(obterPerfilAnaliseDocumental(tipo).grauFonte).toBe("LEI_NORMA");
    }
  });

  it("recibo PGDAS exige prova de entrega, não os campos da declaração completa", () => {
    const perfil = obterPerfilAnaliseDocumental("recibo_pgdas");
    expect(perfil.camposObrigatorios).toEqual(["cnpj", "competencia", "recibo_ou_protocolo"]);
    expect(perfil.camposObrigatorios).not.toContain("receita_bruta");
  });

  it("compartilhamento eCAC exige autorização oficial e token, não campos ausentes no PDF", () => {
    expect(obterPerfilAnaliseDocumental("compartilhamento_ecac").camposObrigatorios).toEqual([
      "autorizacao",
      "registro_blockchain",
      "token_autorizacao",
    ]);
  });

  it("comprovante de endereço usa política de crédito configurável, não validade nacional de 60/90 dias", () => {
    const perfil = obterPerfilAnaliseDocumental("comprovante_residencia");
    expect(perfil.grauFonte).toBe("PRATICA_MERCADO");
    expect(perfil.politicaTemporal).toBe("politica_credito_configuravel");
    expect(perfil.validadePadraoDias).toBeNull();
    expect(descricaoPerfilParaPrompt("comprovante_residencia")).toMatch(/recência é política de crédito configurável/i);
  });

  it("tipo desconhecido continua sem inventar política temporal", () => {
    const perfil = obterPerfilAnaliseDocumental("tipo_documento_totalmente_desconhecido_xyz");
    expect(perfil.grauFonte).toBeNull();
    expect(perfil.politicaTemporal).toBe("sem_validade_formal");
  });

  it("snapshot público não recebe mensagem de prazo de prática de mercado", () => {
    expect(descricaoPerfilParaPrompt("cadin_cnpj")).not.toMatch(/prazo.*30 dias/i);
    expect(descricaoPerfilParaPrompt("cartao_cnpj")).not.toMatch(/prazo.*30 dias/i);
  });
});

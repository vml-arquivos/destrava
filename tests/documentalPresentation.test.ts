import { describe, expect, it } from "vitest";
import { construirSecoesAnaliseDocumento, documentoSocietarioDispensadoPorMei, estadoVisualDocumento } from "@shared/documentalPresentation";

describe("construirSecoesAnaliseDocumento — validação objetiva", () => {
  it("Cartão CNPJ mostra só confirmação cadastral essencial, sem reproduzir o cartão", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída; documento considerado consistente.",
      tipo_documento: "cartao_cnpj",
      status: "concluido",
      satisfaz_requisito: true,
      dados_extraidos: {
        cnpj: "52.008.368/0001-03",
        razao_social: "PALUMA BURGER LTDA",
        nome_fantasia: "PALUMA BURGER",
        data_abertura: "2023-08-30",
        cnae_principal: "5611-2/01",
        natureza_juridica: "206-2",
        porte: "ME",
        situacao_cadastral: "ATIVA",
        matriz_filial: "matriz",
        municipio: "Goiânia",
        uf: "GO",
        endereco_completo: "Rua X, 123, Goiânia, GO",
        email: "empresa@exemplo.com",
        telefone: "62999999999",
      },
    }, { tipo_documento: "cartao_cnpj", analisado: true, consistente: true });

    const serializado = JSON.stringify(secoes);
    expect(serializado).toContain("52.008.368/0001-03");
    expect(serializado).toContain("ATIVA");
    expect(serializado).toContain("matriz");
    expect(serializado).toContain("Goiânia / GO");
    expect(serializado).not.toContain("PALUMA BURGER LTDA");
    expect(serializado).not.toContain("5611-2/01");
    expect(serializado).not.toContain("natureza_juridica");
    expect(serializado).not.toContain("empresa@exemplo.com");
    expect(serializado).not.toContain("62999999999");
  });

  it("QSA confirma vínculo, quantidade e administração sem despejar capital/razão social", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída; QSA compatível.",
      tipo_documento: "qsa",
      tipo_leitura: "qsa",
      qsa_leitura: true,
      satisfaz_requisito: true,
      dados_extraidos: {
        cnpj: "52.008.368/0001-03",
        razao_social: "PALUMA BURGER LTDA",
        capital_social: 65000,
        socios: [{ nome: "Jonnathas Rodrigues Pires", qualificacao: "Sócio-Administrador", administrador: true }],
      },
    }, { tipo_documento: "qsa", analisado: true, consistente: true });

    const serializado = JSON.stringify(secoes);
    expect(serializado).toContain("CNPJ do QSA");
    expect(serializado).toContain("Vínculo com o CNPJ");
    expect(serializado).toContain("1 integrante(s) identificado(s)");
    expect(serializado).toContain("Jonnathas Rodrigues Pires");
    expect(serializado).toContain("QSA validado");
    expect(serializado).not.toContain("65000");
    expect(serializado).not.toContain("PALUMA BURGER LTDA");
  });

  it("Atos da Junta mostra NIRE, último ato e só pede o anterior quando a janela de 12 meses exige", () => {
    const recente = new Date();
    recente.setUTCMonth(recente.getUTCMonth() - 4);
    const anterior = new Date();
    anterior.setUTCMonth(anterior.getUTCMonth() - 16);

    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída.",
      tipo_documento: "atos_junta_comercial",
      status: "concluido",
      dados_extraidos: {
        nire: "52206183723",
        historico_arquivamentos: [
          { numero: "20251505987", data: recente.toISOString().slice(0, 10), tipo_ato: "ALTERAÇÃO" },
          { numero: "20244323909", data: anterior.toISOString().slice(0, 10), tipo_ato: "ALTERAÇÃO" },
          { numero: "20231507946", data: "2023-08-30", tipo_ato: "CONTRATO" },
        ],
      },
    }, { tipo_documento: "atos_junta_comercial", analisado: true, consistente: true });

    const campos = secoes.flatMap((secao) => secao.campos || []);
    expect(campos.some((c) => c.label === "NIRE" && c.valor === "52206183723")).toBe(true);
    expect(campos.some((c) => c.label === "Última alteração")).toBe(true);
    expect(campos.some((c) => c.label === "Arquivamento" && c.valor === "20251505987")).toBe(true);
    expect(campos.some((c) => c.label === "Histórico de 12 meses" && /Exige/.test(c.valor))).toBe(true);
    expect(campos.some((c) => c.label === "Alteração anterior")).toBe(true);
    expect(JSON.stringify(secoes)).not.toContain("total_alteracoes_historico");
  });

  it("Contrato/alteração mostra somente conferência registral e resumo do que mudou", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída; documento considerado consistente.",
      tipo_documento: "alteracao_contratual",
      status: "concluido",
      satisfaz_requisito: true,
      dados_extraidos: {
        contrato: {
          data_registro: "2025-06-06",
          numero_arquivamento: "20251505987",
          razao_social: "PALUMA BURGER LTDA",
          capital_social_atual: 65000,
        },
      },
      alteracoes_societarias: [{
        tipo_alteracao: "transferencia_quotas",
        cedente: { nome: "Marcos Henrique Soares Pio", quotas: 65000 },
        cessionario: { nome: "Jonnathas Rodrigues Pires", quotas: 65000 },
        quotas_transferidas: 65000,
        percentual_transferido: 100,
      }],
    }, { tipo_documento: "alteracao_contratual", analisado: true, consistente: true });

    const serializado = JSON.stringify(secoes);
    expect(serializado).toContain("2025-06-06");
    expect(serializado).toContain("20251505987");
    expect(serializado).toContain("Correspondência confirmada");
    expect(serializado).toContain("Transferência de titularidade");
    expect(serializado).toContain("Marcos Henrique Soares Pio");
    expect(serializado).toContain("Jonnathas Rodrigues Pires");
    expect(serializado).not.toContain("PALUMA BURGER LTDA");
    expect(serializado).not.toContain("capital_social_atual");
    expect(serializado).not.toContain("Evidências documentais");
  });

  it("Enquadramento mostra apenas CNPJ, regime, situação e confirmação", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída.",
      tipo_documento: "enquadramento_tributario_cnpj",
      status: "concluido",
      satisfaz_requisito: true,
      dados_extraidos: {
        cnpj: "52.008.368/0001-03",
        regime_tributario: "Simples Nacional",
        situacao_simples: "Optante",
        data_opcao_simples: "2025-01-01",
        motivo_exclusao: "texto que não deve poluir a tela",
      },
    }, { tipo_documento: "enquadramento_tributario_cnpj", analisado: true, consistente: true });

    const serializado = JSON.stringify(secoes);
    expect(serializado).toContain("Simples Nacional");
    expect(serializado).toContain("Optante");
    expect(serializado).toContain("Enquadramento confirmado");
    expect(serializado).not.toContain("motivo_exclusao");
    expect(serializado).not.toContain("texto que não deve poluir");
  });

  it("Consulta de crédito mostra resultado objetivo e não reproduz a consulta", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída.",
      tipo_documento: "serasa",
      status: "concluido",
      satisfaz_requisito: true,
      dados_extraidos: {
        possui_negativacao: false,
        quantidade_negativacoes: 0,
        score: 812,
        data_consulta: "2026-09-05",
        texto_integral_consulta: "conteúdo extenso da consulta",
      },
    }, { tipo_documento: "serasa", analisado: true, consistente: true });

    const serializado = JSON.stringify(secoes);
    expect(serializado).toContain("Sem negativação identificada");
    expect(serializado).toContain("812");
    expect(serializado).toContain("2026-09-05");
    expect(serializado).not.toContain("conteúdo extenso da consulta");
  });

  it("Certidão genérica mostra só regularidade, validade e vínculo básico", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída; documento considerado consistente.",
      tipo_documento: "cndt",
      status: "concluido",
      satisfaz_requisito: true,
      dados_extraidos: {
        campos_comprovados: {
          cnpj: "12.345.678/0001-90",
          numero_registro: "4567",
          data_validade: "2026-09-30",
          situacao_certidao: "negativa",
          orgao_emissor: "Justiça do Trabalho",
        },
      },
    }, { tipo_documento: "cndt", analisado: true, consistente: true });

    const serializado = JSON.stringify(secoes);
    expect(serializado).toContain("12.345.678/0001-90");
    expect(serializado).toContain("negativa");
    expect(serializado).toContain("2026-09-30");
    expect(serializado).not.toContain("4567");
    expect(serializado).not.toContain("Justiça do Trabalho");
  });

  it("não exibe confiança, OCR, evidência ou checklist técnico na camada de validação", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída.",
      tipo_documento: "cndt",
      nivel_confianca: 0.94,
      dados_extraidos: {
        cnpj: "12.345.678/0001-90",
        fonte_extracao: "local_deterministica",
        evidencias: ["trecho literal do documento"],
      },
      evidencias: ["outro trecho literal"],
      validacoes: ["campo técnico"],
    }, { tipo_documento: "cndt", analisado: true, consistente: true });

    const serializado = JSON.stringify(secoes);
    expect(serializado).not.toContain("Confiança da leitura");
    expect(serializado).not.toContain("local_deterministica");
    expect(serializado).not.toContain("trecho literal");
    expect(serializado).not.toContain("Checklist técnico");
  });

  it("não pinta de verde documento incompatível, stale, não satisfeito ou sem análise", () => {
    expect(estadoVisualDocumento({ documento_compativel: false, satisfaz_requisito: false }, { consistente: true })).toBe("incompativel");
    expect(estadoVisualDocumento({ analysis_status: "REANALISE_NECESSARIA", conclusao: "Leitura concluída; documento considerado consistente." }, { consistente: true })).toBe("reanalisar");
    expect(estadoVisualDocumento({ satisfaz_requisito: false, identidade_status: "IDENTIFICADO" }, { consistente: true })).toBe("revisao");
    expect(estadoVisualDocumento({}, { analisado: false, consistente: true })).toBe("aguardando");
    expect(estadoVisualDocumento({ status: "concluido", satisfaz_requisito: true }, { consistente: true })).toBe("aprovado");
  });
});

// CORREÇÃO (Rodada 34, 05/09/2026 -- print real da tela em produção: uma
// empresa MEI mostrava "Atos da Junta Comercial"/"Contrato social e
// alterações contratuais" com o selo "OBRIGATÓRIO NA ETAPA", mesmo já
// dispensada dos dois pelo backend, `montarValidacaoSocietaria`,
// `atos_dispensados_por_mei`). O selo do checklist (`DocumentosEntidade.tsx`)
// era fixo no código, sem checar essa dispensa -- regra geral, vale para
// qualquer empresa MEI, não só a do print.
describe("documentoSocietarioDispensadoPorMei", () => {
  it("considera dispensados Atos da Junta e Contrato Social quando o backend já confirmou atos_dispensados_por_mei", () => {
    expect(documentoSocietarioDispensadoPorMei("atos_junta_comercial", true)).toBe(true);
    expect(documentoSocietarioDispensadoPorMei("contrato_social", true)).toBe(true);
  });

  it("não dispensa quando atos_dispensados_por_mei é false, null, undefined ou ausente", () => {
    expect(documentoSocietarioDispensadoPorMei("atos_junta_comercial", false)).toBe(false);
    expect(documentoSocietarioDispensadoPorMei("contrato_social", null)).toBe(false);
    expect(documentoSocietarioDispensadoPorMei("atos_junta_comercial", undefined)).toBe(false);
  });

  it("não dispensa outros tipos documentais mesmo com atos_dispensados_por_mei true -- a dispensa é só para os dois tipos societários do grupo Junta Comercial", () => {
    expect(documentoSocietarioDispensadoPorMei("requerimento_empresario", true)).toBe(false);
    expect(documentoSocietarioDispensadoPorMei("ccmei", true)).toBe(false);
    expect(documentoSocietarioDispensadoPorMei("estatuto", true)).toBe(false);
    expect(documentoSocietarioDispensadoPorMei("alteracao_contratual", true)).toBe(false);
  });
});

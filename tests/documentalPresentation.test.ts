import { describe, expect, it } from "vitest";
import { construirSecoesAnaliseDocumento } from "@shared/documentalPresentation";

describe("construirSecoesAnaliseDocumento", () => {
  it("apresenta somente resultado, transação, titular vigente e evidências", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída; documento considerado consistente.",
      diagnostico_factual: "A última alteração transferiu a empresa para Jonnathas Rodrigues Pires.",
      alteracoes_societarias: [{
        tipo_alteracao: "transferencia_quotas",
        cedente: { nome: "Marcos Henrique Soares Pio", quotas: 65000 },
        cessionario: { nome: "Jonnathas Rodrigues Pires", quotas: 65000 },
        quotas_transferidas: 65000,
        percentual_transferido: 100,
        clausula: "Cláusula segunda",
        pagina: 3,
        evidencia: "retira-se da sociedade Marcos Henrique Soares Pio e cede suas quotas a Jonnathas Rodrigues Pires",
      }],
      quadro_societario_final: [{ nome: "Jonnathas Rodrigues Pires", quotas: 65000, percentual: 100, administrador: true }],
      analise_societaria_auditavel: {
        status_documento: "atual",
        ato_praticado: "Transferência integral de quotas",
        estado_atual: { descricao: "Quadro final com sócio único" },
        confronto_qsa: { status: "confirmado", mensagem: "QSA compatível" },
      },
      evidencias: ["retira-se da sociedade Marcos Henrique Soares Pio e cede suas quotas a Jonnathas Rodrigues Pires"],
      campos: [{ label: "NIRE", valor: "123" }],
      observacoes: ["Laudo persistido"],
      alertas: [{ severidade: "baixa", mensagem: "alerta histórico" }],
    }, { nome: "Alteração consolidada vigente" });

    expect(secoes.map((secao) => secao.id)).toEqual([
      "resultado",
      "transacoes",
      "titular_atual",
      "validacoes",
      "evidencias",
    ]);
    expect(secoes.find((secao) => secao.id === "transacoes")?.itens?.[0]).toContain("Ação realizada: Transferência de quotas");
    expect(secoes.find((secao) => secao.id === "transacoes")?.itens?.[0]).toContain("Cedente/retirante: Marcos Henrique Soares Pio");
    expect(secoes.find((secao) => secao.id === "transacoes")?.itens?.[0]).toContain("Cessionário/admitido: Jonnathas Rodrigues Pires");
    expect(secoes.find((secao) => secao.id === "transacoes")?.itens?.[0]).toContain("Quotas transferidas: 65.000 (100%)");
    expect(secoes.find((secao) => secao.id === "titular_atual")?.itens?.[0]).toContain("Jonnathas Rodrigues Pires");
    expect(secoes.find((secao) => secao.id === "evidencias")?.itens?.[0]).toContain("Jonnathas Rodrigues Pires");
    expect(JSON.stringify(secoes)).not.toContain("alerta histórico");
    expect(JSON.stringify(secoes)).not.toContain("NIRE");
    expect(JSON.stringify(secoes)).not.toContain("Cláusula segunda");
  });

  it("exibe nomes lidos, amostra objetiva e validações do QSA", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída; QSA compatível.",
      tipo_documento: "qsa",
      tipo_leitura: "qsa",
      qsa_leitura: true,
      cnpj: "12.345.678/0001-90",
      razao_social: "Empresa Exemplo Ltda.",
      capital_social: 8400000,
      socios_lidos: [
        { nome: "Jonnathas Rodrigues Pires", qualificacao: "Sócio", administrador: true },
        { nome: "Maria de Fátima Souza", qualificacao: "Sócia", administrador: false },
      ],
      campos: [
        { label: "CNPJ", valor: "12.345.678/0001-90" },
        { label: "Razão social", valor: "Empresa Exemplo Ltda." },
      ],
    }, { codigo: "qsa", nome: "QSA / Quadro Societário" });

    expect(secoes.map((secao) => secao.id)).toEqual(["resultado", "amostra_dados", "qsa_nomes", "validacoes"]);
    expect(secoes.find((secao) => secao.id === "qsa_nomes")?.itens).toEqual([
      "Jonnathas Rodrigues Pires — Sócio — Sócio-Administrador",
      "Maria de Fátima Souza — Sócia — Sócio",
    ]);
    expect(JSON.stringify(secoes)).toContain("CNPJ: identificado");
    expect(JSON.stringify(secoes)).toContain("Sócio-Administrador: Jonnathas Rodrigues Pires");
  });

  it("não chama sócio histórico de titular atual", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída.",
      status_societario: "historico",
      alteracoes_societarias: [{
        tipo_alteracao: "transferencia_quotas",
        cedente: { nome: "Irene Correia dos Reis Silva", quotas: 32500 },
        cessionario: { nome: "Marcos Henrique Soares Pio", quotas: 32500 },
        quotas_transferidas: 32500,
        evidencia: "cessão de quotas para Marcos Henrique Soares Pio",
      }],
      quadro_societario_final: [{ nome: "Marcos Henrique Soares Pio", quotas: 65000, percentual: 100 }],
    }, { nome: "Contrato histórico" });

    expect(secoes.map((secao) => secao.id)).toEqual(["resultado", "transacoes", "evidencias"]);
    expect(JSON.stringify(secoes)).not.toContain("titular_atual");
  });

  it("mantém resultado e diagnóstico para documentos sem leitura societária", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída.",
      diagnostico_factual: "A Junta Comercial registra o ato mais recente em 2025-06-06.",
    }, { nome: "Atos da Junta Comercial" });

    expect(secoes).toEqual([
      { id: "resultado", titulo: "Resultado da análise", texto: "Leitura concluída." },
      { id: "diagnostico_factual", titulo: "Diagnóstico objetivo do documento", texto: "A Junta Comercial registra o ato mais recente em 2025-06-06." },
    ]);
  });
});

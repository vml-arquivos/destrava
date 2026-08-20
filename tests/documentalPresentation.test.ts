import { describe, expect, it } from "vitest";
import { construirSecoesAnaliseDocumento } from "@shared/documentalPresentation";

// Reprojetado a pedido do usuário (relatório documental "poluído", com uma
// seção dizendo "validado" e, logo abaixo, um checklist técnico dizendo "não
// identificado" para o mesmo dado -- contradição visível no PDF/tela). O
// relatório passou a mostrar só o essencial por padrão (resultado, dados-chave,
// próxima ação) e empurrar o texto de apoio (checklist técnico, evidência
// literal, texto jurídico completo) para seções `colapsavel: true`, que ficam
// atrás de um botão "Ver informações técnicas" na tela e NUNCA aparecem no PDF
// (server/routes/documentacao.ts filtra `colapsavel` antes de desenhar o HTML).
describe("construirSecoesAnaliseDocumento", () => {
  it("resume a alteração societária (data, 12 meses, resultado) e empurra o texto jurídico completo para trás do botão de informações", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída; documento considerado consistente.",
      diagnostico_factual: "A última alteração transferiu a empresa para Jonnathas Rodrigues Pires.",
      data_registro: "2025-06-06",
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
      "resumo_alteracao",
      "transacoes",
      "titular_atual",
      "diagnostico_factual",
      "validacoes",
      "evidencias",
    ]);

    // O resumo objetivo é a seção que fica visível por padrão: quando foi,
    // se completa 12 meses, e qual foi o resultado -- sem precisar abrir nada.
    const resumo = secoes.find((secao) => secao.id === "resumo_alteracao");
    expect(resumo?.colapsavel).toBeFalsy();
    expect(resumo?.texto).toContain("Transferência de titularidade");
    expect(resumo?.texto).toContain("Marcos Henrique Soares Pio");
    expect(resumo?.texto).toContain("Jonnathas Rodrigues Pires");
    expect(resumo?.campos?.find((c) => c.label === "Última alteração em")?.valor).toBe("06/06/2025");
    expect(resumo?.campos?.find((c) => c.label === "Completa 12 meses de histórico")?.valor).toMatch(/^(Sim|Não)/);

    // O texto jurídico completo, o checklist técnico e a evidência literal
    // continuam existindo -- só que marcados como colapsavel (escondidos por
    // padrão na tela, e nunca desenhados no PDF).
    expect(secoes.find((secao) => secao.id === "transacoes")?.colapsavel).toBe(true);
    expect(secoes.find((secao) => secao.id === "diagnostico_factual")?.colapsavel).toBe(true);
    expect(secoes.find((secao) => secao.id === "validacoes")?.colapsavel).toBe(true);
    expect(secoes.find((secao) => secao.id === "evidencias")?.colapsavel).toBe(true);
    expect(secoes.find((secao) => secao.id === "titular_atual")?.colapsavel).toBeFalsy();

    expect(secoes.find((secao) => secao.id === "transacoes")?.itens?.[0]).toContain("Cedente/retirante: Marcos Henrique Soares Pio");
    expect(secoes.find((secao) => secao.id === "titular_atual")?.itens?.[0]).toContain("Jonnathas Rodrigues Pires");
    expect(secoes.find((secao) => secao.id === "evidencias")?.itens?.[0]).toContain("Jonnathas Rodrigues Pires");
    expect(JSON.stringify(secoes)).not.toContain("alerta histórico");
    expect(JSON.stringify(secoes)).not.toContain("NIRE");
    expect(JSON.stringify(secoes)).not.toContain("Cláusula segunda");
  });

  it("exibe nomes lidos, amostra objetiva e validações do QSA -- sem contradizer 'identificado' com 'não identificado' para o mesmo dado", () => {
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
    expect(secoes.find((secao) => secao.id === "validacoes")?.colapsavel).toBe(true);
    expect(secoes.find((secao) => secao.id === "qsa_nomes")?.itens).toEqual([
      "Jonnathas Rodrigues Pires — Sócio — Sócio-Administrador",
      "Maria de Fátima Souza — Sócia — Sócio",
    ]);
    expect(JSON.stringify(secoes)).toContain("CNPJ: identificado");
    expect(JSON.stringify(secoes)).toContain("Sócio-Administrador: Jonnathas Rodrigues Pires");
  });

  it("recupera nomes do QSA quando existem apenas em dados_extraidos", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída; documento considerado consistente.",
      diagnostico_factual: "O QSA apresenta o quadro societário vigente na data da emissão.",
      tipo_documento: "qsa",
      tipo_leitura: "qsa",
      qsa_leitura: true,
      dados_extraidos: {
        cnpj: "52.008.368/0001-03",
        razao_social: "Paluma Burger Ltda.",
        capital_social: 65000,
        socios: [{ nome: "Jonnathas Rodrigues Pires", qualificacao: "Sócio-Administrador", administrador: true }],
      },
    }, { codigo: "qsa", nome: "QSA / Quadro Societário" });

    expect(secoes.map((secao) => secao.id)).toEqual([
      "resultado",
      "amostra_dados",
      "qsa_nomes",
      "diagnostico_factual",
      "validacoes",
    ]);
    expect(secoes.find((secao) => secao.id === "diagnostico_factual")?.colapsavel).toBe(true);
    expect(secoes.find((secao) => secao.id === "qsa_nomes")?.itens).toEqual([
      "Jonnathas Rodrigues Pires — Sócio-Administrador — Sócio-Administrador",
    ]);
    expect(JSON.stringify(secoes)).toContain("Jonnathas Rodrigues Pires");
    expect(JSON.stringify(secoes)).toContain("Sócios lidos no QSA");
    expect(JSON.stringify(secoes)).toContain("Descrição objetiva da leitura");
  });

  // Bug real reportado com print do relatório em produção: o card do QSA dizia
  // "Validado"/"documento considerado consistente" no topo e, no checklist
  // técnico logo abaixo, "CNPJ: não identificado" / "Razão social: não
  // identificada" / "Capital social: não identificado" -- mesmo com esses três
  // valores aparecendo corretamente na seção "Dados do QSA" do mesmo card. A
  // extração populava só `resultado.campos` (array de label/valor), não os
  // objetos `dados_extraidos`/`dados_qsa`/`campos_principais` que o checklist
  // conferia -- o checklist ficava "cego" pro dado que a tela já mostrava.
  it("não contradiz 'identificado' quando o CNPJ/razão social/capital do QSA só existem no array `campos`", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída; documento considerado consistente.",
      tipo_documento: "qsa",
      tipo_leitura: "qsa",
      qsa_leitura: true,
      socios_lidos: [{ nome: "Jonnathas Rodrigues Pires", qualificacao: "Sócio-Administrador", administrador: true }],
      campos: [
        { label: "CNPJ do QSA", valor: "52.008.360/0001-33" },
        { label: "Razão social do QSA", valor: "Paluma Burger Ltda" },
        { label: "Capital social do QSA", valor: "65000" },
      ],
    }, { codigo: "qsa", nome: "QSA / Quadro Societário" });

    const validacoes = secoes.find((secao) => secao.id === "validacoes")?.itens || [];
    expect(validacoes).toContain("CNPJ: identificado");
    expect(validacoes).toContain("Razão social: identificada");
    expect(validacoes).toContain("Capital social: identificado");
    expect(validacoes.join(" ")).not.toContain("não identificad");
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

    expect(secoes.map((secao) => secao.id)).toEqual(["resultado", "resumo_alteracao", "transacoes", "evidencias"]);
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

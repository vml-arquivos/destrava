import { describe, expect, it } from "vitest";
import { construirSecoesAnaliseDocumento, documentoSocietarioDispensadoPorMei, estadoVisualDocumento } from "@shared/documentalPresentation";

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
    expect(resumo?.campos?.find((c) => c.label === "Janela societária de 12 meses")?.valor).toBe("Atendida pela última alteração");

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
    // CORREÇÃO (2026-08-31, print real: "PAULO BOLSONI BALDI - 49-Sócio-
    // Administrador — Sócio-Administrador"): quando a qualificação lida do
    // documento já diz "Sócio-Administrador", o sufixo derivado de
    // `administrador: true` não repete mais a mesma informação.
    expect(secoes.find((secao) => secao.id === "qsa_nomes")?.itens).toEqual([
      "Jonnathas Rodrigues Pires — Sócio-Administrador",
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

  it("pede alteração anterior quando a última alteração tem menos de 12 meses", () => {
    const recente = new Date();
    recente.setUTCMonth(recente.getUTCMonth() - 4);
    const dataRecente = recente.toISOString().slice(0, 10);
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída.",
      data_registro: dataRecente,
      alteracoes_societarias: [{ tipo_alteracao: "alteracao_contratual", data: dataRecente }],
      quadro_societario_final: [{ nome: "Sócio Atual" }],
      analise_societaria_auditavel: { status_documento: "atual" },
    }, { nome: "Alteração recente" });

    const resumo = secoes.find((secao) => secao.id === "resumo_alteracao");
    expect(resumo?.campos?.find((campo) => campo.label === "Janela societária de 12 meses")?.valor)
      .toContain("validar também a alteração/contrato anterior");
  });

  it("mostra NIRE, última e penúltima alteração dos Atos da Junta a partir do laudo persistido", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída.",
      tipo_documento: "atos_junta_comercial",
      status: "concluido",
      dados_extraidos: {
        nire: "52206183723",
        total_alteracoes_historico: 2,
        historico_arquivamentos: [
          { numero: "20231507946", data: "2023-08-30", tipo_ato: "CONTRATO" },
          { numero: "20244323909", data: "2025-03-27", tipo_ato: "ALTERAÇÃO" },
          { numero: "20251505987", data: "2025-06-06", tipo_ato: "ALTERAÇÃO" },
        ],
      },
    }, { tipo_documento: "atos_junta_comercial", nome: "Atos da Junta Comercial" });

    const campos = secoes.flatMap((secao) => secao.campos || []);
    expect(campos).toContainEqual({ label: "NIRE", valor: "52206183723" });
    expect(campos).toContainEqual({ label: "Última alteração", valor: "2025-06-06" });
    expect(campos).toContainEqual({ label: "Arquivamento da última alteração", valor: "20251505987" });
    expect(campos).toContainEqual({ label: "Penúltima alteração", valor: "2025-03-27" });
    expect(campos).toContainEqual({ label: "Arquivamento da penúltima", valor: "20244323909" });
  });

  it("mostra os dados persistidos do Cartão CNPJ sem depender do dossiê completo", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída.",
      tipo_documento: "cartao_cnpj",
      status: "concluido",
      dados_extraidos: {
        cnpj: "52.008.368/0001-03",
        razao_social: "PALUMA BURGER LTDA",
        nome_fantasia: "Paluma Burger",
        data_abertura: "2023-08-30",
        cnae_principal: "5611-2/01",
        natureza_juridica: "206-2",
        porte: "ME",
        situacao_cadastral: "ATIVA",
      },
    }, { tipo_documento: "cartao_cnpj", nome: "Cartão CNPJ" });

    const serializado = JSON.stringify(secoes);
    expect(serializado).toContain("52.008.368/0001-03");
    expect(serializado).toContain("PALUMA BURGER LTDA");
    expect(serializado).toContain("ATIVA");
    expect(serializado).toContain("2023-08-30");
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

  it("exibe a confiança da leitura no resumo genérico e converte escala de 0 a 1 para percentual", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Documento processado pela extração especializada.",
      nivel_confianca: 0.94,
    }, { nome: "Comprovante de residência" });

    expect(secoes[0].campos).toContainEqual({ label: "Confiança da leitura", valor: "94%" });
  });

  it("exibe a confiança da leitura no resumo societário sem duplicar campo existente", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "QSA lido.",
      tipo_documento: "qsa",
      tipo_leitura: "qsa",
      qsa_leitura: true,
      socios_lidos: [{ nome: "Jonnathas Rodrigues Pires", administrador: true }],
      nivel_confianca: 87,
      campos: [{ label: "Confiança da leitura", valor: "87%" }],
    }, { codigo: "qsa", nome: "QSA" });

    const campos = secoes.flatMap((secao) => secao.campos || []);
    expect(campos.filter((campo) => campo.label === "Confiança da leitura")).toHaveLength(1);
    expect(campos).toContainEqual({ label: "Confiança da leitura", valor: "87%" });
  });

  it("não pinta de verde documento incompatível, stale, não satisfeito ou sem análise", () => {
    expect(estadoVisualDocumento({ documento_compativel: false, satisfaz_requisito: false }, { consistente: true })).toBe("incompativel");
    expect(estadoVisualDocumento({ analysis_status: "REANALISE_NECESSARIA", conclusao: "Leitura concluída; documento considerado consistente." }, { consistente: true })).toBe("reanalisar");
    expect(estadoVisualDocumento({ satisfaz_requisito: false, identidade_status: "IDENTIFICADO" }, { consistente: true })).toBe("revisao");
    expect(estadoVisualDocumento({ dados_extraidos: { tipo_esperado: "ECF", tipo_detectado: "PGDAS_D", documento_compativel: false, satisfaz_requisito: false } }, { consistente: true })).toBe("incompativel");
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

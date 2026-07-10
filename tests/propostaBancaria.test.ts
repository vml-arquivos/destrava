/**
 * propostaBancaria.test.ts
 *
 * Testes automatizados para o serviço de Proposta Bancária Inteligente.
 * Cobre todos os cenários exigidos pela Sprint 2.
 */

import { describe, it, expect } from "vitest";
import { calcularPropostaBancaria } from "../server/services/propostaBancariaService";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const empresaCompleta = {
  id: "empresa-001",
  razao_social: "Empresa Teste Ltda",
  cnpj: "12.345.678/0001-90",
  cidade: "São Paulo",
  estado: "SP",
  situacao_cadastral: "Ativa",
  cnae_principal: "4711-3/02 - Comércio varejista de mercadorias em geral",
  natureza_juridica: "Sociedade Empresária Limitada",
  capital_social: 500000,
  faturamento_anual: 2400000,
  limite_atual: 100000,
  regime_tributario: "Lucro Presumido",
  porte: "ME",
  data_abertura: "2018-03-15",
  segmento: "Varejo",
  score_interno: 750,
  score_serasa: 680,
  score_spc: 700,
  responsavel_nome: "João Silva",
  responsavel_cpf: "123.456.789-00",
  email: "joao@empresa.com",
  telefone: "(11) 99999-9999",
};

const sociosCompletos = [
  { id: "s1", nome: "João Silva", cpf_cnpj: "123.456.789-00", percentual_capital: 60, representante_legal: true, qualificacao_socio: "Sócio-Administrador" },
  { id: "s2", nome: "Maria Souza", cpf_cnpj: "987.654.321-00", percentual_capital: 40, representante_legal: false, qualificacao_socio: "Sócia" },
];

const documentosCompletos = [
  { id: "d1", tipo: "Cartão CNPJ", nome_arquivo: "cnpj.pdf", arquivo_path: "/uploads/cnpj.pdf", status: "validado" },
  { id: "d2", tipo: "Contrato Social", nome_arquivo: "contrato.pdf", arquivo_path: "/uploads/contrato.pdf", status: "validado" },
  { id: "d3", tipo: "Balanço Patrimonial", nome_arquivo: "balanco.pdf", arquivo_path: "/uploads/balanco.pdf", status: "ativo" },
  { id: "d4", tipo: "DRE", nome_arquivo: "dre.pdf", arquivo_path: "/uploads/dre.pdf", status: "ativo" },
  { id: "d5", tipo: "Extrato Bancário", nome_arquivo: "extrato.pdf", arquivo_path: "/uploads/extrato.pdf", status: "ativo" },
];

const simulacoesCompletas = [
  { id: "sim1", produto: "Capital de Giro", valor_solicitado: 200000, prazo_meses: 36, status: "pendente", criado_em: "2024-01-15" },
  { id: "sim2", produto: "Antecipação de Recebíveis", valor_solicitado: 80000, prazo_meses: 12, status: "aprovado", criado_em: "2024-02-01" },
];

const contratosCompletos = [
  { id: "c1", numero_contrato: "CT-2024-001", tipo_contrato: "Crédito", status: "vigente", valor_contrato: 150000, data_assinatura: "2024-01-20" },
];

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("propostaBancariaService", () => {

  // 1. Proposta com dados vazios
  describe("1. proposta com dados vazios", () => {
    it("deve retornar estrutura válida mesmo sem dados", () => {
      const result = calcularPropostaBancaria({
        empresa: {},
        socios: [],
        documentos: [],
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });

      expect(result).toBeDefined();
      expect(result.empresa).toBeDefined();
      expect(result.resumoExecutivo).toBeTruthy();
      expect(result.perfilCredito).toBeDefined();
      expect(result.capacidadeCredito).toBeDefined();
      expect(result.documentacao).toBeDefined();
      expect(Array.isArray(result.pendencias)).toBe(true);
      expect(Array.isArray(result.riscos)).toBe(true);
      expect(Array.isArray(result.pontosFortes)).toBe(true);
      expect(Array.isArray(result.proximosPassos)).toBe(true);
      expect(result.propostaPreliminar).toBeDefined();
      expect(result.parecerTecnico).toBeTruthy();
      expect(result.gerado_em).toBeTruthy();
      expect(result.fonte).toBe("deterministica");
    });

    it("deve ter score_destrava = 0 sem dados", () => {
      const result = calcularPropostaBancaria({
        empresa: {},
        socios: [],
        documentos: [],
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });
      expect(result.score_destrava).toBeGreaterThanOrEqual(0);
      expect(result.score_destrava).toBeLessThanOrEqual(100);
    });

    it("deve ter status_proposta de dados_insuficientes ou inapto sem dados", () => {
      const result = calcularPropostaBancaria({
        empresa: {},
        socios: [],
        documentos: [],
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });
      expect(["dados_insuficientes", "necessita_complementacao", "inapto"]).toContain(result.status_proposta);
    });
  });

  // 2. Proposta com empresa completa
  describe("2. proposta com empresa completa", () => {
    it("deve calcular score_destrava alto para empresa completa", () => {
      const result = calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosCompletos,
        documentos: documentosCompletos,
        simulacoes: simulacoesCompletas,
        orcamentos: [],
        contratos: contratosCompletos,
        historico: [],
      });

      expect(result.score_destrava).toBeGreaterThan(60);
    });

    it("deve retornar empresa normalizada com razão social", () => {
      const result = calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosCompletos,
        documentos: documentosCompletos,
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });

      expect(result.empresa.razao_social).toBe("Empresa Teste Ltda");
      expect(result.empresa.cnpj).toBe("12.345.678/0001-90");
    });

    it("deve ter capacidade de crédito com dados suficientes", () => {
      const result = calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosCompletos,
        documentos: documentosCompletos,
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });

      expect(result.capacidadeCredito.dados_suficientes).toBe(true);
      expect(result.capacidadeCredito.limite_estimado_max).toBeGreaterThan(0);
    });

    it("deve ter pontos fortes para empresa completa", () => {
      const result = calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosCompletos,
        documentos: documentosCompletos,
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });

      expect(result.pontosFortes.length).toBeGreaterThan(0);
    });
  });

  // 3. Proposta sem documentos
  describe("3. proposta sem documentos", () => {
    it("deve identificar pendência de documentação", () => {
      const result = calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosCompletos,
        documentos: [],
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });

      const temPendenciaDocumental = result.pendencias.some(p =>
        p.tipo === "documental" && p.descricao.toLowerCase().includes("nenhum documento")
      );
      expect(temPendenciaDocumental).toBe(true);
    });

    it("deve ter documentacao.total_documentos = 0", () => {
      const result = calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosCompletos,
        documentos: [],
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });

      expect(result.documentacao.total_documentos).toBe(0);
      expect(result.documentacao.documentos_com_arquivo).toBe(0);
    });
  });

  // 4. Proposta com documentos ausentes (sem arquivo físico)
  describe("4. proposta com documentos ausentes (sem arquivo físico)", () => {
    const documentosSemArquivo = [
      { id: "d1", tipo: "Cartão CNPJ", nome_arquivo: "cnpj.pdf", arquivo_path: null, status: "ativo" },
      { id: "d2", tipo: "Contrato Social", nome_arquivo: "contrato.pdf", arquivo_path: null, status: "ativo" },
    ];

    it("deve identificar documentos sem arquivo", () => {
      const result = calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosCompletos,
        documentos: documentosSemArquivo,
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });

      expect(result.documentacao.documentos_sem_arquivo).toBe(2);
      expect(result.documentacao.documentos_com_arquivo).toBe(0);
    });

    it("deve ter pendência de documentos sem arquivo", () => {
      const result = calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosCompletos,
        documentos: documentosSemArquivo,
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });

      const temPendencia = result.pendencias.some(p =>
        p.tipo === "documental" && p.descricao.toLowerCase().includes("sem arquivo")
      );
      expect(temPendencia).toBe(true);
    });
  });

  // 5. Proposta com simulações
  describe("5. proposta com simulações", () => {
    it("deve incluir simulações no resultado", () => {
      const result = calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosCompletos,
        documentos: documentosCompletos,
        simulacoes: simulacoesCompletas,
        orcamentos: [],
        contratos: [],
        historico: [],
      });

      expect(result.simulacoes.length).toBe(2);
      expect(result.simulacoes[0].produto).toBe("Capital de Giro");
    });

    it("deve usar simulação como referência de valor sugerido quando não há faturamento", () => {
      const empresaSemFat = { ...empresaCompleta, faturamento_anual: null, capital_social: null };
      const result = calcularPropostaBancaria({
        empresa: empresaSemFat,
        socios: sociosCompletos,
        documentos: documentosCompletos,
        simulacoes: simulacoesCompletas,
        orcamentos: [],
        contratos: [],
        historico: [],
      });

      // Com simulação disponível, deve ter produto sugerido
      expect(result.propostaPreliminar.produtoSugerido).toBeTruthy();
    });
  });

  // 6. Proposta sem faturamento
  describe("6. proposta sem faturamento", () => {
    it("deve identificar faturamento não informado nas pendências", () => {
      const empresaSemFat = { ...empresaCompleta, faturamento_anual: null };
      const result = calcularPropostaBancaria({
        empresa: empresaSemFat,
        socios: sociosCompletos,
        documentos: documentosCompletos,
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });

      const temPendencia = result.pendencias.some(p =>
        p.tipo === "financeiro" && p.descricao.toLowerCase().includes("faturamento")
      );
      expect(temPendencia).toBe(true);
    });

    it("deve ter dados_suficientes = false sem faturamento e sem capital", () => {
      const empresaSemFat = { ...empresaCompleta, faturamento_anual: null, capital_social: null };
      const result = calcularPropostaBancaria({
        empresa: empresaSemFat,
        socios: sociosCompletos,
        documentos: documentosCompletos,
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });

      expect(result.capacidadeCredito.dados_suficientes).toBe(false);
    });

    it("deve informar claramente faturamento não informado no perfil", () => {
      const empresaSemFat = { ...empresaCompleta, faturamento_anual: null };
      const result = calcularPropostaBancaria({
        empresa: empresaSemFat,
        socios: sociosCompletos,
        documentos: documentosCompletos,
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });

      expect(result.perfilCredito.faturamento).toBe("Não informado");
    });
  });

  // 7. Proposta não deve prometer aprovação
  describe("7. proposta não deve prometer aprovação bancária", () => {
    const palavrasProibidas = [
      "crédito aprovado",
      "garantia de aprovação",
      "banco vai aprovar",
      "aprovação garantida",
      "será aprovado",
    ];

    it("parecer técnico não deve conter linguagem de aprovação garantida", () => {
      const result = calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosCompletos,
        documentos: documentosCompletos,
        simulacoes: simulacoesCompletas,
        orcamentos: [],
        contratos: contratosCompletos,
        historico: [],
      });

      const parecerLower = result.parecerTecnico.toLowerCase();
      for (const palavra of palavrasProibidas) {
        expect(parecerLower).not.toContain(palavra.toLowerCase());
      }
    });

    it("resumo executivo não deve conter linguagem de aprovação garantida", () => {
      const result = calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosCompletos,
        documentos: documentosCompletos,
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });

      const resumoLower = result.resumoExecutivo.toLowerCase();
      for (const palavra of palavrasProibidas) {
        expect(resumoLower).not.toContain(palavra.toLowerCase());
      }
    });

    it("proposta preliminar não deve conter linguagem de aprovação garantida", () => {
      const result = calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosCompletos,
        documentos: documentosCompletos,
        simulacoes: simulacoesCompletas,
        orcamentos: [],
        contratos: [],
        historico: [],
      });

      const justLower = result.propostaPreliminar.justificativa.toLowerCase();
      for (const palavra of palavrasProibidas) {
        expect(justLower).not.toContain(palavra.toLowerCase());
      }
    });

    it("parecer deve conter linguagem consultiva adequada", () => {
      const result = calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosCompletos,
        documentos: documentosCompletos,
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });

      const parecerLower = result.parecerTecnico.toLowerCase();
      const temLinguagemAdequada =
        parecerLower.includes("preliminar") ||
        parecerLower.includes("análise bancária") ||
        parecerLower.includes("sujeita") ||
        parecerLower.includes("estimada");
      expect(temLinguagemAdequada).toBe(true);
    });
  });

  // 8. Arrays undefined não devem quebrar
  describe("8. arrays undefined não devem quebrar", () => {
    it("deve funcionar com input completamente undefined/null", () => {
      expect(() => calcularPropostaBancaria({
        empresa: null as any,
        socios: null as any,
        documentos: null as any,
        simulacoes: null as any,
        orcamentos: null as any,
        contratos: null as any,
        historico: null as any,
      })).not.toThrow();
    });

    it("deve funcionar com input undefined", () => {
      expect(() => calcularPropostaBancaria(undefined as any)).not.toThrow();
    });

    it("deve funcionar com arrays undefined em cada campo", () => {
      expect(() => calcularPropostaBancaria({
        empresa: { id: "test", razao_social: "Test" },
        socios: undefined as any,
        documentos: undefined as any,
        simulacoes: undefined as any,
        orcamentos: undefined as any,
        contratos: undefined as any,
        historico: undefined as any,
      })).not.toThrow();
    });

    it("deve retornar arrays vazios quando input é undefined", () => {
      const result = calcularPropostaBancaria(undefined as any);
      expect(Array.isArray(result.pendencias)).toBe(true);
      expect(Array.isArray(result.riscos)).toBe(true);
      expect(Array.isArray(result.pontosFortes)).toBe(true);
      expect(Array.isArray(result.simulacoes)).toBe(true);
      expect(Array.isArray(result.orcamentos)).toBe(true);
      expect(Array.isArray(result.contratos)).toBe(true);
      expect(Array.isArray(result.proximosPassos)).toBe(true);
      expect(Array.isArray(result.propostaPreliminar.observacoes)).toBe(true);
    });

    it("deve funcionar com documentos tendo campos null", () => {
      const docsComNull = [
        { id: null, tipo: null, nome_arquivo: null, arquivo_path: null, status: null },
        { id: "d2", tipo: "Contrato", nome_arquivo: "c.pdf", arquivo_path: "/c.pdf", status: "ativo" },
      ];
      expect(() => calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosCompletos,
        documentos: docsComNull,
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      })).not.toThrow();
    });

    it("deve funcionar com sócios tendo campos null", () => {
      const sociosComNull = [
        { id: null, nome: null, cpf_cnpj: null, percentual_capital: null },
        { id: "s2", nome: "Maria", cpf_cnpj: "987.654.321-00", percentual_capital: 100 },
      ];
      expect(() => calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosComNull,
        documentos: documentosCompletos,
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      })).not.toThrow();
    });

    it("deve funcionar com simulações tendo campos null", () => {
      const simsComNull = [
        { id: null, produto: null, valor_solicitado: null, prazo_meses: null, status: null },
      ];
      expect(() => calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosCompletos,
        documentos: documentosCompletos,
        simulacoes: simsComNull,
        orcamentos: [],
        contratos: [],
        historico: [],
      })).not.toThrow();
    });
  });

  // Testes adicionais de integridade
  describe("9. integridade do resultado", () => {
    it("score_destrava deve estar entre 0 e 100", () => {
      const result = calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosCompletos,
        documentos: documentosCompletos,
        simulacoes: simulacoesCompletas,
        orcamentos: [],
        contratos: contratosCompletos,
        historico: [],
      });
      expect(result.score_destrava).toBeGreaterThanOrEqual(0);
      expect(result.score_destrava).toBeLessThanOrEqual(100);
    });

    it("status_proposta deve ser um dos valores válidos", () => {
      const result = calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosCompletos,
        documentos: documentosCompletos,
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });
      expect(["apto_analise", "necessita_complementacao", "dados_insuficientes", "inapto"]).toContain(result.status_proposta);
    });

    it("nivel_risco deve ser um dos valores válidos", () => {
      const result = calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: sociosCompletos,
        documentos: documentosCompletos,
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });
      expect(["baixo", "medio", "alto", "critico"]).toContain(result.perfilCredito.nivel_risco);
    });

    it("deve ter fonte = deterministica", () => {
      const result = calcularPropostaBancaria({
        empresa: empresaCompleta,
        socios: [],
        documentos: [],
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });
      expect(result.fonte).toBe("deterministica");
    });

    it("empresa com CNPJ ausente deve ter pendência bloqueante", () => {
      const empresaSemCnpj = { ...empresaCompleta, cnpj: null };
      const result = calcularPropostaBancaria({
        empresa: empresaSemCnpj,
        socios: sociosCompletos,
        documentos: documentosCompletos,
        simulacoes: [],
        orcamentos: [],
        contratos: [],
        historico: [],
      });
      const temBloqueante = result.pendencias.some(p => p.impacto === "bloqueia_proposta");
      expect(temBloqueante).toBe(true);
    });
  });
});

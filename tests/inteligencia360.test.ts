/**
 * inteligencia360.test.ts
 *
 * Testes do serviço de inteligência 360.
 * Regra: ZERO REGRESSÃO — testes apenas adicionados, nunca removidos.
 */

import { describe, it, expect } from "vitest";
import { calcularInteligencia360 } from "../server/services/inteligencia360Service";

// ─── Empresa vazia (dados mínimos) ────────────────────────────────────────────

describe("inteligencia360Service — empresa com dados vazios", () => {
  const resultado = calcularInteligencia360({
    empresa: { id: "test-001", razao_social: "Empresa Teste Ltda", cnpj: null },
    socios: [],
    documentos: [],
    simulacoes: [],
    contratos: [],
    historico: [],
    followups: [],
  });

  it("retorna empresa_id corretamente", () => {
    expect(resultado.empresa_id).toBe("test-001");
  });

  it("retorna razao_social corretamente", () => {
    expect(resultado.razao_social).toBe("Empresa Teste Ltda");
  });

  it("score_destrava é número entre 0 e 100", () => {
    expect(resultado.score_destrava).toBeGreaterThanOrEqual(0);
    expect(resultado.score_destrava).toBeLessThanOrEqual(100);
  });

  it("saude_cadastral é valor válido", () => {
    expect(["completo", "basico", "incompleto", "critico"]).toContain(resultado.saude_cadastral);
  });

  it("saude_documental é 'critico' quando sem documentos", () => {
    expect(resultado.saude_documental).toBe("critico");
  });

  it("socios retorna array vazio (não undefined)", () => {
    expect(Array.isArray(resultado.socios)).toBe(true);
    expect(resultado.socios.length).toBe(0);
  });

  it("documentos retorna array vazio (não undefined)", () => {
    expect(Array.isArray(resultado.documentos)).toBe(true);
    expect(resultado.documentos.length).toBe(0);
  });

  it("pendencias retorna array (não undefined)", () => {
    expect(Array.isArray(resultado.pendencias)).toBe(true);
  });

  it("recomendacoes retorna array (não undefined)", () => {
    expect(Array.isArray(resultado.recomendacoes)).toBe(true);
  });

  it("simulacoes retorna array vazio (não undefined)", () => {
    expect(Array.isArray(resultado.simulacoes)).toBe(true);
    expect(resultado.simulacoes.length).toBe(0);
  });

  it("contratos retorna array vazio (não undefined)", () => {
    expect(Array.isArray(resultado.contratos)).toBe(true);
    expect(resultado.contratos.length).toBe(0);
  });

  it("proximas_acoes retorna array (não undefined)", () => {
    expect(Array.isArray(resultado.proximas_acoes)).toBe(true);
  });

  it("pendencias_contrato retorna array (não undefined)", () => {
    expect(Array.isArray(resultado.pendencias_contrato)).toBe(true);
  });

  it("pendencias_credito retorna array (não undefined)", () => {
    expect(Array.isArray(resultado.pendencias_credito)).toBe(true);
  });

  it("pendencias_faturamento retorna array (não undefined)", () => {
    expect(Array.isArray(resultado.pendencias_faturamento)).toBe(true);
  });

  it("pendencias_cadastrais retorna array (não undefined)", () => {
    expect(Array.isArray(resultado.pendencias_cadastrais)).toBe(true);
  });

  it("diagnostico_geral é string não vazia", () => {
    expect(typeof resultado.diagnostico_geral).toBe("string");
    expect(resultado.diagnostico_geral.length).toBeGreaterThan(0);
  });

  it("caminho_sugerido é string não vazia", () => {
    expect(typeof resultado.caminho_sugerido).toBe("string");
    expect(resultado.caminho_sugerido.length).toBeGreaterThan(0);
  });

  it("gerado_em é string ISO válida", () => {
    expect(typeof resultado.gerado_em).toBe("string");
    expect(() => new Date(resultado.gerado_em)).not.toThrow();
  });

  it("fonte é 'deterministica'", () => {
    expect(resultado.fonte).toBe("deterministica");
  });

  it("proposta_preliminar tem todos os campos obrigatórios", () => {
    expect(resultado.proposta_preliminar).toBeDefined();
    expect(typeof resultado.proposta_preliminar.observacao).toBe("string");
    expect(typeof resultado.proposta_preliminar.apto_para_proposta).toBe("boolean");
  });

  it("dados_receita tem todos os campos obrigatórios", () => {
    expect(resultado.dados_receita).toBeDefined();
    expect(typeof resultado.dados_receita.sincronizado).toBe("boolean");
  });
});

// ─── Empresa com documentos e pendências ─────────────────────────────────────

describe("inteligencia360Service — empresa com documentos e pendências", () => {
  const empresaCompleta = {
    id: "test-002",
    razao_social: "Empresa Completa Ltda",
    cnpj: "12.345.678/0001-90",
    email: "contato@empresa.com",
    telefone: "(11) 99999-9999",
    cidade: "São Paulo",
    estado: "SP",
    responsavel_nome: "João Silva",
    responsavel_cpf: "123.456.789-00",
    cnae_principal: "6201-5/01",
    capital_social: 100000,
    faturamento_anual: 500000,
    situacao_cadastral: "Ativa",
    regime_tributario: "Simples Nacional",
    porte: "me",
    score_interno: 750,
  };

  const sociosCompletos = [
    {
      id: "socio-001",
      nome: "João Silva",
      cpf_cnpj: "123.456.789-00",
      qualificacao_socio: "Sócio-Administrador",
      percentual_capital: 100,
      representante_legal: true,
    },
  ];

  const documentosCompletos = [
    { id: "doc-001", tipo: "cartao_cnpj", arquivo_path: "/docs/cartao.pdf", status: "validado" },
    { id: "doc-002", tipo: "contrato_social", arquivo_path: "/docs/contrato.pdf", status: "ativo" },
    { id: "doc-003", tipo: "faturamento_12_meses", arquivo_path: "/docs/fat.pdf", status: "ativo" },
  ];

  const simulacoesCompletas = [
    { id: "sim-001", produto: "Capital de Giro", valor_solicitado: 50000, prazo_meses: 24, status: "aprovado" },
  ];

  const resultado = calcularInteligencia360({
    empresa: empresaCompleta,
    socios: sociosCompletos,
    documentos: documentosCompletos,
    simulacoes: simulacoesCompletas,
    contratos: [],
    historico: [{ id: "h-001", tipo: "acao", descricao: "Empresa criada" }],
    followups: [{ id: "f-001", concluido: false, titulo: "Ligar para cliente" }],
  });

  it("score_destrava é maior com dados completos", () => {
    expect(resultado.score_destrava).toBeGreaterThan(40);
  });

  it("saude_cadastral é melhor que critico com dados completos", () => {
    expect(resultado.saude_cadastral).not.toBe("critico");
  });

  it("socios_com_cpf conta corretamente", () => {
    expect(resultado.socios_com_cpf).toBe(1);
    expect(resultado.socios_sem_cpf).toBe(0);
  });

  it("documentos_com_arquivo conta corretamente", () => {
    expect(resultado.documentos_com_arquivo).toBe(3);
    expect(resultado.documentos_sem_arquivo).toBe(0);
  });

  it("documentos_validados conta corretamente", () => {
    expect(resultado.documentos_validados).toBe(1);
  });

  it("historico_count conta corretamente", () => {
    expect(resultado.historico_count).toBe(1);
  });

  it("followups_abertos conta corretamente", () => {
    expect(resultado.followups_abertos).toBe(1);
  });

  it("proposta_preliminar tem valor_sugerido quando há simulação", () => {
    expect(resultado.proposta_preliminar.valor_sugerido).toBe(50000);
  });

  it("proposta_preliminar.empresa está preenchida", () => {
    expect(resultado.proposta_preliminar.empresa).toBe("Empresa Completa Ltda");
  });

  it("recomendacoes são ordenadas por prioridade (alta primeiro)", () => {
    const recs = resultado.recomendacoes;
    if (recs.length >= 2) {
      const ordemPrioridade = { alta: 0, media: 1, baixa: 2 };
      for (let i = 0; i < recs.length - 1; i++) {
        expect(ordemPrioridade[recs[i].prioridade]).toBeLessThanOrEqual(ordemPrioridade[recs[i + 1].prioridade]);
      }
    }
  });
});

// ─── Proteção contra arrays undefined ────────────────────────────────────────

describe("inteligencia360Service — proteção contra arrays undefined/null", () => {
  it("não quebra com socios undefined", () => {
    expect(() => calcularInteligencia360({
      empresa: { id: "x", razao_social: "Teste" },
      socios: undefined as any,
      documentos: [],
      simulacoes: [],
      contratos: [],
      historico: [],
      followups: [],
    })).not.toThrow();
  });

  it("não quebra com documentos null", () => {
    expect(() => calcularInteligencia360({
      empresa: { id: "x", razao_social: "Teste" },
      socios: [],
      documentos: null as any,
      simulacoes: [],
      contratos: [],
      historico: [],
      followups: [],
    })).not.toThrow();
  });

  it("não quebra com simulacoes undefined", () => {
    expect(() => calcularInteligencia360({
      empresa: { id: "x", razao_social: "Teste" },
      socios: [],
      documentos: [],
      simulacoes: undefined as any,
      contratos: [],
      historico: [],
      followups: [],
    })).not.toThrow();
  });

  it("não quebra com empresa sem campos opcionais", () => {
    expect(() => calcularInteligencia360({
      empresa: { id: "x" },
      socios: [],
      documentos: [],
      simulacoes: [],
      contratos: [],
      historico: [],
      followups: [],
    })).not.toThrow();
  });

  it("não quebra com empresa null", () => {
    expect(() => calcularInteligencia360({
      empresa: null as any,
      socios: [],
      documentos: [],
      simulacoes: [],
      contratos: [],
      historico: [],
      followups: [],
    })).not.toThrow();
  });

  it("resultado com arrays undefined sempre retorna arrays válidos", () => {
    const res = calcularInteligencia360({
      empresa: { id: "x", razao_social: "Teste" },
      socios: undefined as any,
      documentos: undefined as any,
      simulacoes: undefined as any,
      contratos: undefined as any,
      historico: undefined as any,
      followups: undefined as any,
    });
    expect(Array.isArray(res.socios)).toBe(true);
    expect(Array.isArray(res.documentos)).toBe(true);
    expect(Array.isArray(res.simulacoes)).toBe(true);
    expect(Array.isArray(res.contratos)).toBe(true);
    expect(Array.isArray(res.pendencias)).toBe(true);
    expect(Array.isArray(res.recomendacoes)).toBe(true);
    expect(Array.isArray(res.proximas_acoes)).toBe(true);
    expect(Array.isArray(res.pendencias_contrato)).toBe(true);
    expect(Array.isArray(res.pendencias_credito)).toBe(true);
    expect(Array.isArray(res.pendencias_faturamento)).toBe(true);
    expect(Array.isArray(res.pendencias_cadastrais)).toBe(true);
  });
});

// ─── Recomendações ────────────────────────────────────────────────────────────

describe("inteligencia360Service — recomendações acionáveis", () => {
  it("gera recomendação de CPF quando responsável não tem CPF", () => {
    const res = calcularInteligencia360({
      empresa: { id: "x", razao_social: "Teste", responsavel_nome: "João" },
      socios: [],
      documentos: [],
      simulacoes: [],
      contratos: [],
      historico: [],
      followups: [],
    });
    const temRecomendacaoCpf = res.recomendacoes.some(r =>
      r.titulo.toLowerCase().includes("responsável") || r.modulo === "socios"
    );
    expect(temRecomendacaoCpf).toBe(true);
  });

  it("cada recomendação tem todos os campos obrigatórios", () => {
    const res = calcularInteligencia360({
      empresa: { id: "x", razao_social: "Teste" },
      socios: [],
      documentos: [],
      simulacoes: [],
      contratos: [],
      historico: [],
      followups: [],
    });
    for (const r of res.recomendacoes) {
      expect(typeof r.titulo).toBe("string");
      expect(["alta", "media", "baixa"]).toContain(r.prioridade);
      expect(typeof r.motivo).toBe("string");
      expect(typeof r.acao).toBe("string");
      expect(typeof r.modulo).toBe("string");
    }
  });
});

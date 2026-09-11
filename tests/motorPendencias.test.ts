/**
 * motorPendencias.test.ts
 *
 * Testes automatizados para o serviço pendenciasEmpresaService.
 * Cobre: empresa sem dados, empresa completa, documentos ausentes,
 * sócio incompleto, faturamento ausente, pendências por prioridade,
 * arrays undefined não quebram.
 */

import { describe, it, expect } from "vitest";
import { calcularPendencias } from "../server/services/pendenciasEmpresaService";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const empresaCompleta = {
  id: "emp-001",
  razao_social: "Tech Solutions Ltda",
  cnpj: "12.345.678/0001-99",
  situacao_cadastral: "Ativa",
  natureza_juridica: "Sociedade Limitada",
  porte: "ME",
  regime_tributario: "Simples Nacional",
  cnae_principal: "6201-5/01",
  capital_social: 50000,
  faturamento_anual: 600000,
  limite_atual: 30000,
  numero_funcionarios: 8,
  email: "contato@techsol.com.br",
  telefone: "(11) 99999-0000",
  whatsapp: "11999990000",
  responsavel_nome: "João Silva",
  responsavel_cpf: "123.456.789-00",
  cidade: "São Paulo",
  estado: "SP",
  score_interno: 720,
};

const socioCompleto = {
  nome: "João Silva",
  cpf_cnpj: "123.456.789-00",
  percentual_capital: 60,
  qualificacao_socio: "Sócio-Administrador",
  representante_legal: true,
  ativo: true,
};

const socioSemCpf = {
  nome: "Maria Oliveira",
  cpf_cnpj: "",
  percentual_capital: 40,
  qualificacao_socio: "Sócia",
  representante_legal: false,
  ativo: true,
};

const docComArquivo = {
  tipo: "Contrato Social",
  nome_arquivo: "contrato_social.pdf",
  arquivo_path: "/uploads/docs/contrato_social.pdf",
  status: "validado",
  created_at: "2024-01-15T10:00:00Z",
};

const docSemArquivo = {
  tipo: "Balanço Patrimonial",
  nome_arquivo: "balanco.pdf",
  arquivo_path: null,
  status: "ativo",
  created_at: "2024-02-01T10:00:00Z",
};

const simulacao = {
  id: "sim-001",
  produto: "Capital de Giro",
  valor_solicitado: 80000,
  prazo_meses: 24,
  status: "pendente",
};

const contrato = {
  id: "ct-001",
  numero_contrato: "CT-2024-001",
  tipo_contrato: "Prestação de Serviços",
  status: "ativo",
  valor_contrato: 120000,
  data_assinatura: "2024-03-01T00:00:00Z",
};

const inputVazio = { empresa: {}, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [], followups: [] };

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("calcularPendencias — empresa sem dados", () => {
  it("não deve lançar erro com input vazio", () => {
    expect(() => calcularPendencias(inputVazio)).not.toThrow();
  });

  it("deve retornar campos obrigatórios mesmo com empresa vazia", () => {
    const r = calcularPendencias(inputVazio);
    expect(r).toHaveProperty("calculado_em");
    expect(r).toHaveProperty("total");
    expect(r).toHaveProperty("altas");
    expect(r).toHaveProperty("medias");
    expect(r).toHaveProperty("baixas");
    expect(r).toHaveProperty("grupos");
    expect(r).toHaveProperty("plano_acao");
    expect(r).toHaveProperty("resumo");
    expect(r).toHaveProperty("score_completude");
    expect(r).toHaveProperty("status_geral");
  });

  it("deve gerar pendências críticas para empresa completamente vazia", () => {
    const r = calcularPendencias(inputVazio);
    expect(r.altas).toBeGreaterThan(0);
  });

  it("status_geral deve ser critico para empresa vazia", () => {
    const r = calcularPendencias(inputVazio);
    expect(r.status_geral).toBe("critico");
  });

  it("score_completude deve ser baixo para empresa vazia", () => {
    const r = calcularPendencias(inputVazio);
    expect(r.score_completude).toBeLessThan(30);
  });

  it("resumo deve indicar pendências críticas", () => {
    const r = calcularPendencias(inputVazio);
    expect(typeof r.resumo).toBe("string");
    expect(r.resumo.length).toBeGreaterThan(10);
  });

  it("não deve quebrar com arrays null/undefined", () => {
    expect(() => calcularPendencias({
      empresa: null as any,
      socios: null as any,
      documentos: null as any,
      simulacoes: null as any,
      orcamentos: null as any,
      contratos: null as any,
      historico: null as any,
      followups: null as any,
    })).not.toThrow();
  });
});

describe("calcularPendencias — empresa completa", () => {
  it("deve ter menos pendências críticas que empresa vazia", () => {
    const vazio = calcularPendencias(inputVazio);
    const completo = calcularPendencias({
      empresa: empresaCompleta,
      socios: [socioCompleto],
      documentos: [docComArquivo, docComArquivo, docComArquivo, docComArquivo, docComArquivo],
      simulacoes: [simulacao],
      orcamentos: [{ id: "orc-001", descricao: "Orçamento", valor_total: 50000, status: "ativo" }],
      contratos: [contrato],
      historico: [{ id: "h-001", tipo: "contato", descricao: "Primeiro contato", created_at: "2024-01-01" }],
      followups: [{ id: "f-001", tipo: "ligacao", descricao: "Follow-up", created_at: "2024-01-02" }],
    });
    expect(completo.altas).toBeLessThan(vazio.altas);
  });

  it("score_completude deve ser alto para empresa completa", () => {
    const r = calcularPendencias({
      empresa: empresaCompleta,
      socios: [socioCompleto],
      documentos: [docComArquivo, docComArquivo, docComArquivo, docComArquivo, docComArquivo],
      simulacoes: [simulacao],
      orcamentos: [],
      contratos: [contrato],
      historico: [],
      followups: [],
    });
    expect(r.score_completude).toBeGreaterThan(60);
  });

  it("plano de ação deve ter números sequenciais", () => {
    const r = calcularPendencias({ empresa: empresaCompleta, socios: [socioCompleto], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [], followups: [] });
    r.plano_acao.forEach((p, i) => expect(p.numero).toBe(i + 1));
  });

  it("plano de ação deve estar ordenado por prioridade (alta primeiro)", () => {
    const r = calcularPendencias(inputVazio);
    const prioridades = r.plano_acao.map(p => p.prioridade);
    const ordem = { alta: 0, media: 1, baixa: 2 };
    for (let i = 0; i < prioridades.length - 1; i++) {
      expect((ordem[prioridades[i]] ?? 3)).toBeLessThanOrEqual((ordem[prioridades[i + 1]] ?? 3));
    }
  });
});

describe("calcularPendencias — documentos ausentes", () => {
  it("deve gerar pendência documental com acervo vazio", () => {
    const r = calcularPendencias({ ...inputVazio, empresa: empresaCompleta });
    const docPends = r.grupos.find(g => g.categoria === "documental");
    expect(docPends).toBeDefined();
    expect(docPends!.total).toBeGreaterThan(0);
  });

  it("deve gerar pendência para documentos sem arquivo físico", () => {
    const r = calcularPendencias({ ...inputVazio, empresa: empresaCompleta, documentos: [docSemArquivo] });
    const docPends = r.grupos.find(g => g.categoria === "documental");
    const semArquivoPend = docPends?.pendencias.find(p => p.id.includes("sem-arquivo"));
    expect(semArquivoPend).toBeDefined();
    expect(semArquivoPend?.prioridade).toBe("alta");
  });

  it("deve identificar documentos não validados", () => {
    const docNaoValidado = { ...docComArquivo, status: "ativo" };
    const r = calcularPendencias({ ...inputVazio, empresa: empresaCompleta, documentos: [docNaoValidado] });
    const docPends = r.grupos.find(g => g.categoria === "documental");
    const naoValidadoPend = docPends?.pendencias.find(p => p.id.includes("nao-validados"));
    expect(naoValidadoPend).toBeDefined();
    expect(naoValidadoPend?.prioridade).toBe("media");
  });
});

describe("calcularPendencias — sócio incompleto", () => {
  it("deve gerar pendência societária com sócio sem CPF", () => {
    const r = calcularPendencias({ ...inputVazio, empresa: empresaCompleta, socios: [socioSemCpf] });
    const socPends = r.grupos.find(g => g.categoria === "societaria");
    const semCpfPend = socPends?.pendencias.find(p => p.id.includes("sem-cpf"));
    expect(semCpfPend).toBeDefined();
    expect(semCpfPend?.prioridade).toBe("alta");
  });

  it("deve gerar pendência para sócio sem representante legal", () => {
    const r = calcularPendencias({ ...inputVazio, empresa: empresaCompleta, socios: [socioSemCpf] });
    const socPends = r.grupos.find(g => g.categoria === "societaria");
    const semRepPend = socPends?.pendencias.find(p => p.id.includes("representante"));
    expect(semRepPend).toBeDefined();
    expect(semRepPend?.prioridade).toBe("media");
  });

  it("deve gerar pendência crítica quando não há sócios", () => {
    const r = calcularPendencias({ ...inputVazio, empresa: empresaCompleta });
    const socPends = r.grupos.find(g => g.categoria === "societaria");
    const semSociosPend = socPends?.pendencias.find(p => p.id.includes("sem-socios"));
    expect(semSociosPend).toBeDefined();
    expect(semSociosPend?.prioridade).toBe("alta");
  });
});

describe("calcularPendencias — faturamento ausente", () => {
  it("deve gerar pendência de crédito para faturamento ausente", () => {
    const semFat = { ...empresaCompleta, faturamento_anual: undefined };
    const r = calcularPendencias({ ...inputVazio, empresa: semFat });
    const credPends = r.grupos.find(g => g.categoria === "credito");
    const fatPend = credPends?.pendencias.find(p => p.id.includes("faturamento-ausente"));
    expect(fatPend).toBeDefined();
    expect(fatPend?.prioridade).toBe("alta");
  });

  it("deve gerar pendência de faturamento para faturamento não comprovado", () => {
    const semFat = { ...empresaCompleta, faturamento_anual: undefined };
    const r = calcularPendencias({ ...inputVazio, empresa: semFat });
    const fatPends = r.grupos.find(g => g.categoria === "faturamento");
    expect(fatPends).toBeDefined();
    expect(fatPends!.total).toBeGreaterThan(0);
  });

  it("deve gerar pendência de score quando todos os scores estão ausentes", () => {
    const semScore = { ...empresaCompleta, score_interno: undefined, score_serasa: undefined, score_spc: undefined };
    const r = calcularPendencias({ ...inputVazio, empresa: semScore });
    const credPends = r.grupos.find(g => g.categoria === "credito");
    const scorePend = credPends?.pendencias.find(p => p.id.includes("score-ausente"));
    expect(scorePend).toBeDefined();
    expect(scorePend?.prioridade).toBe("media");
  });
});

describe("calcularPendencias — pendências por prioridade", () => {
  it("pendências de alta prioridade devem ter prazo 'Imediato'", () => {
    const r = calcularPendencias(inputVazio);
    const altasPlano = r.plano_acao.filter(p => p.prioridade === "alta");
    altasPlano.forEach(p => expect(p.prazo).toBe("Imediato"));
  });

  it("pendências de média prioridade devem ter prazo de 5 dias", () => {
    const r = calcularPendencias(inputVazio);
    const mediasPlano = r.plano_acao.filter(p => p.prioridade === "media");
    mediasPlano.forEach(p => expect(p.prazo).toContain("5 dias"));
  });

  it("pendências de baixa prioridade devem ter prazo de 15 dias", () => {
    const r = calcularPendencias(inputVazio);
    const baixasPlano = r.plano_acao.filter(p => p.prioridade === "baixa");
    baixasPlano.forEach(p => expect(p.prazo).toContain("15 dias"));
  });

  it("cada pendência deve ter id único", () => {
    const r = calcularPendencias(inputVazio);
    const todasPendencias = r.grupos.flatMap(g => g.pendencias);
    const ids = todasPendencias.map(p => p.id);
    const unicos = new Set(ids);
    expect(unicos.size).toBe(ids.length);
  });

  it("grupos devem conter apenas categorias com pendências", () => {
    const r = calcularPendencias(inputVazio);
    r.grupos.forEach(g => expect(g.total).toBeGreaterThan(0));
  });
});

describe("calcularPendencias — proteção contra arrays undefined", () => {
  it("não deve quebrar com empresa tendo campos null", () => {
    const empNull = { id: "x", razao_social: null, cnpj: null, faturamento_anual: null, capital_social: null };
    expect(() => calcularPendencias({ empresa: empNull, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [], followups: [] })).not.toThrow();
  });

  it("não deve quebrar com sócios tendo campos null", () => {
    const socNull = { nome: null, cpf_cnpj: null, percentual_capital: null, representante_legal: null };
    expect(() => calcularPendencias({ empresa: empresaCompleta, socios: [socNull], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [], followups: [] })).not.toThrow();
  });

  it("não deve quebrar com documentos tendo campos null", () => {
    const docNull = { tipo: null, nome_arquivo: null, arquivo_path: null, status: null };
    expect(() => calcularPendencias({ empresa: empresaCompleta, socios: [], documentos: [docNull], simulacoes: [], orcamentos: [], contratos: [], historico: [], followups: [] })).not.toThrow();
  });

  it("calculado_em deve ser uma data ISO válida", () => {
    const r = calcularPendencias(inputVazio);
    expect(() => new Date(r.calculado_em)).not.toThrow();
    expect(new Date(r.calculado_em).getFullYear()).toBeGreaterThan(2020);
  });

  it("total deve ser igual à soma de altas + medias + baixas", () => {
    const r = calcularPendencias(inputVazio);
    expect(r.total).toBe(r.altas + r.medias + r.baixas + r.resolvidas);
  });

  it("deve retornar resumo de 'sem pendências' quando empresa está completa", () => {
    // Empresa com todos os dados preenchidos e sem pendências críticas
    const r = calcularPendencias({
      empresa: empresaCompleta,
      socios: [socioCompleto],
      documentos: [docComArquivo, docComArquivo, docComArquivo, docComArquivo, docComArquivo],
      simulacoes: [simulacao],
      orcamentos: [{ id: "o1", descricao: "Orçamento", valor_total: 50000, status: "ativo" }],
      contratos: [contrato],
      historico: [{ id: "h1", tipo: "contato", descricao: "Contato", created_at: "2024-01-01" }],
      followups: [{ id: "f1", tipo: "ligacao", descricao: "Follow-up", created_at: "2024-01-02" }],
    });
    // Empresa completa deve ter status bom ou excelente
    expect(["bom", "excelente"]).toContain(r.status_geral);
  });
});

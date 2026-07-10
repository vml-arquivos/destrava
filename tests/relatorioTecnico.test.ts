/**
 * relatorioTecnico.test.ts
 *
 * Testes automatizados para o serviço relatorioTecnicoEmpresaService.
 * Cobre: empresa vazia, empresa completa, documentos, pendências,
 * sem score, sem faturamento, proteção contra nulos e linguagem consultiva.
 */

import { describe, it, expect } from "vitest";
import { gerarRelatorioTecnico } from "../server/services/relatorioTecnicoEmpresaService";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const empresaCompleta = {
  id: "emp-001",
  razao_social: "Tech Solutions Ltda",
  nome_fantasia: "TechSol",
  cnpj: "12.345.678/0001-99",
  situacao_cadastral: "Ativa",
  data_abertura: "2015-03-10",
  natureza_juridica: "Sociedade Limitada",
  porte: "ME",
  regime_tributario: "Simples Nacional",
  cnae_principal: "6201-5/01",
  cnae_descricao: "Desenvolvimento de programas de computador",
  segmento: "Tecnologia",
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
  cep: "01310-100",
  site: "https://techsol.com.br",
  score_interno: 720,
  score_serasa: 680,
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

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("gerarRelatorioTecnico — empresa vazia", () => {
  it("não deve lançar erro com input vazio", () => {
    expect(() => gerarRelatorioTecnico({ empresa: {}, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] })).not.toThrow();
  });

  it("deve retornar campos obrigatórios mesmo com empresa vazia", () => {
    const r = gerarRelatorioTecnico({ empresa: {}, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(r).toHaveProperty("gerado_em");
    expect(r).toHaveProperty("resumo_executivo");
    expect(r).toHaveProperty("pendencias");
    expect(r).toHaveProperty("plano_acao");
    expect(r).toHaveProperty("recomendacoes");
    expect(r).toHaveProperty("analise_credito");
    expect(r).toHaveProperty("analise_documental");
    expect(r).toHaveProperty("analise_cadastral");
    expect(r).toHaveProperty("analise_faturamento");
    expect(r).toHaveProperty("observacoes_legais");
    expect(r.fonte).toBe("deterministica");
  });

  it("deve retornar 'Não informado' para campos ausentes na identificação", () => {
    const r = gerarRelatorioTecnico({ empresa: {}, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(r.identificacao.razao_social).toBe("Não informado");
    expect(r.identificacao.cnpj).toBe("Não informado");
    expect(r.contato.email).toBe("Não informado");
    expect(r.contato.cidade).toBe("Não informado");
  });

  it("score deve ser baixo para empresa vazia", () => {
    const r = gerarRelatorioTecnico({ empresa: {}, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(r.analise_credito.score_destrava).toBeLessThan(30);
  });

  it("deve gerar pendências críticas para empresa sem CNPJ e sem sócios", () => {
    const r = gerarRelatorioTecnico({ empresa: {}, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    const criticas = r.pendencias.filter(p => p.prioridade === "critica");
    expect(criticas.length).toBeGreaterThan(0);
  });

  it("não deve quebrar com input null/undefined em arrays", () => {
    expect(() => gerarRelatorioTecnico({ empresa: null as any, socios: null as any, documentos: null as any, simulacoes: null as any, orcamentos: null as any, contratos: null as any, historico: null as any })).not.toThrow();
  });
});

describe("gerarRelatorioTecnico — empresa completa", () => {
  it("deve retornar score alto para empresa com dados completos", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [socioCompleto], documentos: [docComArquivo, docComArquivo, docComArquivo], simulacoes: [simulacao], orcamentos: [], contratos: [contrato], historico: [] });
    expect(r.analise_credito.score_destrava).toBeGreaterThanOrEqual(50);
  });

  it("deve identificar situação ativa corretamente", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [socioCompleto], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(r.identificacao.situacao_cadastral).toBe("Ativa");
  });

  it("deve calcular capacidade de crédito com base no faturamento", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [socioCompleto], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(r.analise_credito.capacidade_estimada_min).not.toBe("Não informado");
    expect(r.analise_credito.capacidade_estimada_max).not.toBe("Não informado");
  });

  it("deve incluir sócios normalizados", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [socioCompleto], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(r.socios).toHaveLength(1);
    expect(r.socios[0].nome).toBe("João Silva");
    expect(r.socios[0].representante_legal).toBe(true);
    expect(r.socios[0].tem_cpf).toBe(true);
  });

  it("deve incluir contratos normalizados", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [contrato], historico: [] });
    expect(r.contratos).toHaveLength(1);
    expect(r.contratos[0].numero).toBe("CT-2024-001");
  });
});

describe("gerarRelatorioTecnico — documentos", () => {
  it("deve calcular cobertura documental corretamente", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [], documentos: [docComArquivo, docSemArquivo], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(r.analise_documental.total).toBe(2);
    expect(r.analise_documental.com_arquivo).toBe(1);
    expect(r.analise_documental.sem_arquivo).toBe(1);
    expect(r.analise_documental.percentual_cobertura).toBe(50);
  });

  it("deve listar documentos sem arquivo em documentos_ausentes", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [], documentos: [docSemArquivo], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(r.analise_documental.documentos_ausentes).toContain("Balanço Patrimonial");
  });

  it("deve identificar documentos validados", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [], documentos: [docComArquivo], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(r.analise_documental.validados).toBe(1);
    expect(r.documentos[0].validado).toBe(true);
  });

  it("deve gerar pendência documental quando há documentos sem arquivo", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [], documentos: [docSemArquivo], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    const docPendencias = r.pendencias.filter(p => p.tipo === "documental");
    expect(docPendencias.length).toBeGreaterThan(0);
  });

  it("deve retornar cobertura 0% com acervo vazio", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(r.analise_documental.percentual_cobertura).toBe(0);
    expect(r.analise_documental.total).toBe(0);
  });
});

describe("gerarRelatorioTecnico — pendências", () => {
  it("deve gerar pendência crítica para empresa sem sócios", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    const p = r.pendencias.find(p => p.tipo === "societário" && p.prioridade === "critica");
    expect(p).toBeDefined();
  });

  it("deve gerar pendência para sócio sem CPF", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [socioSemCpf], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    const p = r.pendencias.find(p => p.tipo === "societário" && p.prioridade === "alta");
    expect(p).toBeDefined();
  });

  it("deve gerar pendência para faturamento ausente", () => {
    const { faturamento_anual, ...semFat } = empresaCompleta as any;
    const r = gerarRelatorioTecnico({ empresa: semFat, socios: [socioCompleto], documentos: [docComArquivo], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    const p = r.pendencias.find(p => p.tipo === "financeiro");
    expect(p).toBeDefined();
  });

  it("deve gerar plano de ação com pelo menos 2 passos", () => {
    const r = gerarRelatorioTecnico({ empresa: {}, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(r.plano_acao.length).toBeGreaterThanOrEqual(2);
  });

  it("plano de ação deve ter números sequenciais", () => {
    const r = gerarRelatorioTecnico({ empresa: {}, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    r.plano_acao.forEach((p, i) => expect(p.numero).toBe(i + 1));
  });
});

describe("gerarRelatorioTecnico — sem score", () => {
  it("deve retornar 'Não informado' para score_interno ausente", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    // empresaCompleta tem score_interno, mas testamos sem
    const semScore = { ...empresaCompleta, score_interno: undefined, score_serasa: undefined, score_spc: undefined };
    const r2 = gerarRelatorioTecnico({ empresa: semScore, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(r2.analise_credito.score_interno).toBe("Não informado");
    expect(r2.analise_credito.score_serasa).toBe("Não informado");
    expect(r2.analise_credito.score_spc).toBe("Não informado");
  });

  it("score Destrava deve ser calculado mesmo sem scores externos", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(typeof r.analise_credito.score_destrava).toBe("number");
    expect(r.analise_credito.score_destrava).toBeGreaterThanOrEqual(0);
    expect(r.analise_credito.score_destrava).toBeLessThanOrEqual(100);
  });
});

describe("gerarRelatorioTecnico — sem faturamento", () => {
  it("deve retornar 'Não informado' para capacidade de crédito sem faturamento e sem capital", () => {
    const semFat = { ...empresaCompleta, faturamento_anual: undefined, capital_social: undefined };
    const r = gerarRelatorioTecnico({ empresa: semFat, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(r.analise_credito.capacidade_estimada_min).toBe("Não informado");
    expect(r.analise_credito.capacidade_estimada_max).toBe("Não informado");
  });

  it("deve calcular capacidade com base no capital social quando faturamento ausente", () => {
    const semFat = { ...empresaCompleta, faturamento_anual: undefined };
    const r = gerarRelatorioTecnico({ empresa: semFat, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(r.analise_credito.capacidade_estimada_min).not.toBe("Não informado");
  });

  it("análise de faturamento deve indicar ausência", () => {
    const semFat = { ...empresaCompleta, faturamento_anual: undefined };
    const r = gerarRelatorioTecnico({ empresa: semFat, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(r.analise_faturamento.tem_faturamento).toBe(false);
    expect(r.analise_faturamento.observacoes.length).toBeGreaterThan(0);
  });
});

describe("gerarRelatorioTecnico — linguagem consultiva", () => {
  it("parecer não deve prometer aprovação de crédito", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [socioCompleto], documentos: [docComArquivo, docComArquivo, docComArquivo], simulacoes: [simulacao], orcamentos: [], contratos: [], historico: [] });
    const parecer = r.analise_credito.parecer.toLowerCase();
    expect(parecer).not.toContain("aprovado");
    expect(parecer).not.toContain("garantido");
    expect(parecer).toContain("sujeita");
  });

  it("observações legais devem conter aviso de não garantia", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(r.observacoes_legais).toContain("não constituem garantia");
  });

  it("resumo executivo deve ser uma string não vazia", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(typeof r.resumo_executivo).toBe("string");
    expect(r.resumo_executivo.length).toBeGreaterThan(50);
  });

  it("responsável deve ser 'Sistema Destrava Crédito' quando não informado", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(r.responsavel_analise).toBe("Sistema Destrava Crédito");
  });

  it("responsável deve ser o nome informado quando passado", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [], responsavel_nome: "Ana Costa" });
    expect(r.responsavel_analise).toBe("Ana Costa");
  });
});

describe("gerarRelatorioTecnico — proteção contra nulos", () => {
  it("não deve quebrar com empresa tendo campos null", () => {
    const empNull = { id: "x", razao_social: null, cnpj: null, faturamento_anual: null, capital_social: null, situacao_cadastral: null };
    expect(() => gerarRelatorioTecnico({ empresa: empNull, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] })).not.toThrow();
  });

  it("não deve quebrar com sócios tendo campos null", () => {
    const socNull = { nome: null, cpf_cnpj: null, percentual_capital: null, qualificacao_socio: null, representante_legal: null };
    expect(() => gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [socNull], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] })).not.toThrow();
  });

  it("não deve quebrar com documentos tendo campos null", () => {
    const docNull = { tipo: null, nome_arquivo: null, arquivo_path: null, status: null, created_at: null };
    expect(() => gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [], documentos: [docNull], simulacoes: [], orcamentos: [], contratos: [], historico: [] })).not.toThrow();
  });

  it("simulacoes e contratos devem ser limitados a 5 itens", () => {
    const sims = Array(10).fill(simulacao);
    const cts = Array(10).fill(contrato);
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [], documentos: [], simulacoes: sims, orcamentos: [], contratos: cts, historico: [] });
    expect(r.simulacoes.length).toBeLessThanOrEqual(5);
    expect(r.contratos.length).toBeLessThanOrEqual(5);
  });

  it("gerado_em deve ser uma data ISO válida", () => {
    const r = gerarRelatorioTecnico({ empresa: empresaCompleta, socios: [], documentos: [], simulacoes: [], orcamentos: [], contratos: [], historico: [] });
    expect(() => new Date(r.gerado_em)).not.toThrow();
    expect(new Date(r.gerado_em).getFullYear()).toBeGreaterThan(2020);
  });
});

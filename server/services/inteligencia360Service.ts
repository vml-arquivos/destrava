/**
 * inteligencia360Service.ts
 *
 * Serviço de consolidação de dados empresariais para a Central de Inteligência 360.
 * Gera diagnóstico determinístico sem dependência de IA externa.
 * Regra: ZERO REGRESSÃO — apenas leitura, sem alterar dados existentes.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Recomendacao360 {
  titulo: string;
  prioridade: "alta" | "media" | "baixa";
  motivo: string;
  acao: string;
  modulo: string;
}

export interface Pendencia360 {
  tipo: "contrato" | "credito" | "faturamento" | "cadastral" | "documental";
  descricao: string;
  severidade: "critica" | "alta" | "media" | "baixa";
}

export interface PropostaPreliminar {
  empresa: string;
  cnpj: string | null;
  segmento: string | null;
  cnae: string | null;
  capital_social: number | null;
  faturamento: number | null;
  score_interno: number | null;
  documentos_disponiveis: number;
  pendencias_count: number;
  valor_sugerido: number | null;
  observacao: string;
  apto_para_proposta: boolean;
}

export interface Inteligencia360Result {
  empresa_id: string;
  razao_social: string;
  cnpj: string | null;

  // Saúde geral
  saude_cadastral: "completo" | "basico" | "incompleto" | "critico";
  saude_documental: "completo" | "parcial" | "insuficiente" | "critico";
  risco_documental: "baixo" | "medio" | "alto" | "critico";
  risco_credito: "baixo" | "medio" | "alto" | "critico";
  prontidao_contrato: "pronto" | "pendencias_menores" | "pendencias_criticas" | "inapto";
  prontidao_proposta_bancaria: "pronto" | "necessita_complementacao" | "insuficiente";

  // Scores
  score_destrava: number; // 0-100
  score_serasa: number | null;
  score_spc: number | null;
  score_interno: number | null;

  // Situação cadastral
  situacao_cadastral: string;
  regime_tributario: string | null;
  porte: string | null;
  capital_social: number | null;
  data_abertura: string | null;
  cnae_principal: string | null;
  segmento: string | null;

  // Dados da Receita
  dados_receita: {
    sincronizado: boolean;
    ultima_sincronizacao: string | null;
    situacao: string | null;
    data_situacao: string | null;
    motivo_situacao: string | null;
    matriz_filial: string | null;
    natureza_juridica: string | null;
  };

  // Sócios
  socios: any[];
  socios_com_cpf: number;
  socios_sem_cpf: number;
  socios_com_pendencias: number;

  // Documentos
  documentos: any[];
  documentos_com_arquivo: number;
  documentos_sem_arquivo: number;
  documentos_validados: number;
  documentos_pendentes_validacao: number;

  // Pendências
  pendencias: Pendencia360[];
  pendencias_contrato: string[];
  pendencias_credito: string[];
  pendencias_faturamento: string[];
  pendencias_cadastrais: string[];

  // Histórico
  simulacoes: any[];
  contratos: any[];
  faturamento: number | null;
  historico_count: number;
  followups_abertos: number;

  // Proposta preliminar
  proposta_preliminar: PropostaPreliminar;

  // Recomendações acionáveis
  recomendacoes: Recomendacao360[];

  // Próximas ações
  proximas_acoes: string[];

  // Diagnóstico textual
  diagnostico_geral: string;
  caminho_sugerido: string;

  // Metadados
  gerado_em: string;
  fonte: "deterministica" | "ia_assistida";

  // Automation Engine (Destrava <-> Nexus) -- opcional, populado quando o
  // chamador fornece os dados; ausência não quebra o resultado (arrays/objetos
  // vazios), preservando compatibilidade com o comportamento anterior.
  automacao_engine: AutomacaoEngineResumo;
  recomendacoes_automacao: string[];
}

export interface AutomacaoEngineAcompanhamentoResumo {
  em_andamento: boolean;
  banco_observado: string | null;
  semanas_total: number;
  semanas_concluidas: number;
  semanas_pendentes: number;
  ultima_atualizacao_em: string | null;
  semanas_sem_atualizacao: number;
}

export interface AutomacaoEngineResumo {
  contrato_assessoria_ativo: boolean;
  contrato_vigencia_fim: string | null;
  rotina_cnd_ultima_geracao: string | null;
  rotina_cemprot_ultima_geracao: string | null;
  acompanhamento_bancario: AutomacaoEngineAcompanhamentoResumo | null;
}

// ─── Utilitários internos ─────────────────────────────────────────────────────

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function safeString(value: unknown, fallback = "Não informado"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function calcularScoreDestrava(params: {
  empresa: any;
  socios: any[];
  documentos: any[];
  simulacoes: any[];
  contratos: any[];
}): number {
  const { empresa, socios, documentos, simulacoes, contratos } = params;
  let score = 0;

  // Situação cadastral (0-20)
  const situacao = String(empresa?.situacao_cadastral || "").toLowerCase();
  if (situacao === "ativa" || situacao === "regular") score += 20;
  else if (situacao.includes("ativ")) score += 15;
  else if (situacao !== "") score += 5;

  // Dados cadastrais completos (0-15)
  const camposCadastrais = [
    empresa?.razao_social, empresa?.cnpj, empresa?.email,
    empresa?.telefone, empresa?.cidade, empresa?.estado,
    empresa?.responsavel_nome, empresa?.responsavel_cpf,
  ];
  const camposPreenchidos = camposCadastrais.filter(c => c && String(c).trim() !== "").length;
  score += Math.round((camposPreenchidos / camposCadastrais.length) * 15);

  // Sócios com CPF (0-10)
  const sociosArr = safeArray<any>(socios);
  const sociosComCpf = sociosArr.filter(s => s?.cpf_cnpj && String(s.cpf_cnpj).replace(/\D/g, "").length >= 11);
  if (sociosArr.length > 0) {
    score += Math.round((sociosComCpf.length / sociosArr.length) * 10);
  } else {
    score += 0;
  }

  // Documentos disponíveis (0-20)
  const docsArr = safeArray<any>(documentos);
  const docsComArquivo = docsArr.filter(d => d?.arquivo_path || d?.url || d?.file_path);
  if (docsArr.length > 0) {
    score += Math.min(20, Math.round((docsComArquivo.length / Math.max(docsArr.length, 1)) * 20));
  }

  // Simulações realizadas (0-10)
  if (safeArray(simulacoes).length > 0) score += 10;

  // Contratos firmados (0-10)
  if (safeArray(contratos).length > 0) score += 10;

  // Capital social informado (0-5)
  if (empresa?.capital_social && Number(empresa.capital_social) > 0) score += 5;

  // Faturamento informado (0-10)
  if (empresa?.faturamento_anual && Number(empresa.faturamento_anual) > 0) score += 10;

  return Math.min(100, Math.max(0, score));
}

function classificarSaudeCadastral(empresa: any): Inteligencia360Result["saude_cadastral"] {
  const campos = [
    empresa?.razao_social, empresa?.cnpj, empresa?.email,
    empresa?.telefone, empresa?.cidade, empresa?.estado,
    empresa?.responsavel_nome, empresa?.responsavel_cpf,
    empresa?.cnae_principal, empresa?.capital_social,
  ];
  const preenchidos = campos.filter(c => c !== null && c !== undefined && String(c).trim() !== "").length;
  const pct = preenchidos / campos.length;

  if (pct >= 0.9) return "completo";
  if (pct >= 0.6) return "basico";
  if (pct >= 0.3) return "incompleto";
  return "critico";
}

function classificarSaudeDocumental(documentos: any[]): Inteligencia360Result["saude_documental"] {
  const docs = safeArray<any>(documentos);
  const comArquivo = docs.filter(d => d?.arquivo_path || d?.url || d?.file_path).length;

  if (docs.length === 0) return "critico";
  const pct = comArquivo / docs.length;
  if (pct >= 0.8) return "completo";
  if (pct >= 0.5) return "parcial";
  if (pct >= 0.2) return "insuficiente";
  return "critico";
}

function classificarRiscoDocumental(empresa: any, documentos: any[], socios: any[]): Inteligencia360Result["risco_documental"] {
  const docs = safeArray<any>(documentos);
  const socsArr = safeArray<any>(socios);

  const temCartaoCnpj = docs.some(d => d?.tipo === "cartao_cnpj" && (d?.arquivo_path || d?.url));
  const temContratoSocial = docs.some(d => (d?.tipo === "contrato_social" || d?.tipo === "alteracao_contratual") && (d?.arquivo_path || d?.url));
  const temDocSocio = socsArr.length === 0 || socsArr.some(s => s?.cpf_cnpj);

  const situacao = String(empresa?.situacao_cadastral || "").toLowerCase();
  const situacaoIrregular = !situacao.includes("ativ") && situacao !== "" && situacao !== "regular";

  if (situacaoIrregular) return "critico";
  if (!temCartaoCnpj && !temContratoSocial) return "alto";
  if (!temCartaoCnpj || !temContratoSocial || !temDocSocio) return "medio";
  return "baixo";
}

function classificarRiscoCredito(empresa: any, socios: any[]): Inteligencia360Result["risco_credito"] {
  const score = safeNumber(empresa?.score_interno) ?? safeNumber(empresa?.score_serasa) ?? null;
  const risco = String(empresa?.risco_classificacao || "").toLowerCase();

  if (risco === "critico") return "critico";
  if (risco === "alto") return "alto";
  if (risco === "medio") return "medio";
  if (risco === "baixo") return "baixo";

  // Inferir pelo score
  if (score !== null) {
    if (score >= 700) return "baixo";
    if (score >= 500) return "medio";
    if (score >= 300) return "alto";
    return "critico";
  }

  // Sem dados suficientes
  const situacao = String(empresa?.situacao_cadastral || "").toLowerCase();
  if (situacao.includes("irregular") || situacao.includes("suspens") || situacao.includes("baixad")) return "critico";

  return "medio";
}

function calcularProntidaoContrato(empresa: any, socios: any[], documentos: any[]): Inteligencia360Result["prontidao_contrato"] {
  const pendencias: string[] = [];
  const socsArr = safeArray<any>(socios);

  if (!empresa?.razao_social) pendencias.push("Razão social ausente");
  if (!empresa?.cnpj) pendencias.push("CNPJ ausente");
  if (!empresa?.responsavel_nome) pendencias.push("Responsável não informado");
  if (!empresa?.responsavel_cpf) pendencias.push("CPF do responsável ausente");

  const socioSemCpf = socsArr.filter(s => !s?.cpf_cnpj || String(s.cpf_cnpj).replace(/\D/g, "").length < 11);
  if (socsArr.length === 0) pendencias.push("Nenhum sócio cadastrado");
  else if (socioSemCpf.length > 0) pendencias.push(`${socioSemCpf.length} sócio(s) sem CPF`);

  if (pendencias.length === 0) return "pronto";
  if (pendencias.length <= 2) return "pendencias_menores";
  if (pendencias.length <= 4) return "pendencias_criticas";
  return "inapto";
}

function calcularProntidaoProposta(empresa: any, documentos: any[], simulacoes: any[]): Inteligencia360Result["prontidao_proposta_bancaria"] {
  const docs = safeArray<any>(documentos);
  const sims = safeArray<any>(simulacoes);

  const temCartaoCnpj = docs.some(d => d?.tipo === "cartao_cnpj");
  const temContratoSocial = docs.some(d => d?.tipo === "contrato_social" || d?.tipo === "alteracao_contratual");
  const temFaturamento = empresa?.faturamento_anual || docs.some(d => d?.tipo === "faturamento_12_meses");
  const temSimulacao = sims.length > 0;

  const requisitos = [temCartaoCnpj, temContratoSocial, temFaturamento, temSimulacao, !!empresa?.cnpj, !!empresa?.razao_social];
  const atendidos = requisitos.filter(Boolean).length;

  if (atendidos >= 5) return "pronto";
  if (atendidos >= 3) return "necessita_complementacao";
  return "insuficiente";
}

function gerarPendencias(empresa: any, socios: any[], documentos: any[]): {
  pendencias: Pendencia360[];
  pendencias_contrato: string[];
  pendencias_credito: string[];
  pendencias_faturamento: string[];
  pendencias_cadastrais: string[];
} {
  const pendencias: Pendencia360[] = [];
  const pendencias_contrato: string[] = [];
  const pendencias_credito: string[] = [];
  const pendencias_faturamento: string[] = [];
  const pendencias_cadastrais: string[] = [];

  const socsArr = safeArray<any>(socios);
  const docsArr = safeArray<any>(documentos);

  // Cadastrais
  if (!empresa?.responsavel_nome) {
    pendencias_cadastrais.push("Nome do responsável não informado");
    pendencias.push({ tipo: "cadastral", descricao: "Nome do responsável não informado", severidade: "alta" });
  }
  if (!empresa?.responsavel_cpf) {
    pendencias_cadastrais.push("CPF do responsável ausente");
    pendencias_contrato.push("CPF do responsável ausente");
    pendencias.push({ tipo: "cadastral", descricao: "CPF do responsável ausente", severidade: "critica" });
  }
  if (!empresa?.email) {
    pendencias_cadastrais.push("E-mail da empresa não informado");
    pendencias.push({ tipo: "cadastral", descricao: "E-mail da empresa não informado", severidade: "media" });
  }
  if (!empresa?.telefone) {
    pendencias_cadastrais.push("Telefone não informado");
    pendencias.push({ tipo: "cadastral", descricao: "Telefone não informado", severidade: "baixa" });
  }
  if (!empresa?.cnae_principal) {
    pendencias_cadastrais.push("CNAE principal não informado");
    pendencias_credito.push("CNAE principal ausente — necessário para análise bancária");
    pendencias.push({ tipo: "cadastral", descricao: "CNAE principal não informado", severidade: "media" });
  }
  if (!empresa?.capital_social || Number(empresa.capital_social) <= 0) {
    pendencias_cadastrais.push("Capital social não informado");
    pendencias_credito.push("Capital social ausente — necessário para proposta bancária");
    pendencias.push({ tipo: "cadastral", descricao: "Capital social não informado", severidade: "media" });
  }

  // Sócios
  if (socsArr.length === 0) {
    pendencias_contrato.push("Nenhum sócio/QSA cadastrado");
    pendencias_credito.push("QSA ausente — necessário para análise de crédito");
    pendencias.push({ tipo: "contrato", descricao: "Nenhum sócio/QSA cadastrado", severidade: "critica" });
  } else {
    const semCpf = socsArr.filter(s => !s?.cpf_cnpj || String(s.cpf_cnpj).replace(/\D/g, "").length < 11);
    if (semCpf.length > 0) {
      pendencias_contrato.push(`${semCpf.length} sócio(s) sem CPF completo`);
      pendencias_credito.push(`${semCpf.length} sócio(s) sem CPF — obrigatório para análise`);
      pendencias.push({ tipo: "contrato", descricao: `${semCpf.length} sócio(s) sem CPF completo`, severidade: "alta" });
    }
  }

  // Documentais
  const temCartaoCnpj = docsArr.some(d => d?.tipo === "cartao_cnpj" && (d?.arquivo_path || d?.url || d?.file_path));
  if (!temCartaoCnpj) {
    pendencias_credito.push("Cartão CNPJ não anexado");
    pendencias.push({ tipo: "documental", descricao: "Cartão CNPJ não anexado", severidade: "alta" });
  }

  const temContratoSocial = docsArr.some(d =>
    (d?.tipo === "contrato_social" || d?.tipo === "alteracao_contratual") &&
    (d?.arquivo_path || d?.url || d?.file_path)
  );
  if (!temContratoSocial) {
    pendencias_contrato.push("Contrato social ou alteração contratual não anexado");
    pendencias_credito.push("Contrato social ausente — necessário para proposta bancária");
    pendencias.push({ tipo: "documental", descricao: "Contrato social não anexado", severidade: "alta" });
  }

  // Faturamento
  if (!empresa?.faturamento_anual || Number(empresa.faturamento_anual) <= 0) {
    const temDocFaturamento = docsArr.some(d => d?.tipo === "faturamento_12_meses" && (d?.arquivo_path || d?.url));
    if (!temDocFaturamento) {
      pendencias_faturamento.push("Faturamento anual não informado e sem extrato de faturamento");
      pendencias_credito.push("Faturamento ausente — necessário para análise de capacidade de crédito");
      pendencias.push({ tipo: "faturamento", descricao: "Faturamento não informado", severidade: "media" });
    }
  }

  return { pendencias, pendencias_contrato, pendencias_credito, pendencias_faturamento, pendencias_cadastrais };
}

function gerarRecomendacoes(params: {
  empresa: any;
  socios: any[];
  documentos: any[];
  simulacoes: any[];
  contratos: any[];
  pendencias: Pendencia360[];
}): Recomendacao360[] {
  const { empresa, socios, documentos, simulacoes, contratos, pendencias } = params;
  const recomendacoes: Recomendacao360[] = [];
  const socsArr = safeArray<any>(socios);
  const docsArr = safeArray<any>(documentos);

  // Responsável sem CPF
  if (!empresa?.responsavel_cpf) {
    recomendacoes.push({
      titulo: "Completar dados do responsável",
      prioridade: "alta",
      motivo: "Contrato e análise de crédito exigem CPF/RG/estado civil/profissão.",
      acao: "Abrir quadro societário e preencher dados do responsável legal",
      modulo: "socios",
    });
  }

  // Sócios sem CPF
  const sociosSemCpf = socsArr.filter(s => !s?.cpf_cnpj || String(s.cpf_cnpj).replace(/\D/g, "").length < 11);
  if (sociosSemCpf.length > 0) {
    recomendacoes.push({
      titulo: `Completar CPF de ${sociosSemCpf.length} sócio(s)`,
      prioridade: "alta",
      motivo: "CPF completo é obrigatório para geração de contrato e análise bancária.",
      acao: "Abrir quadro societário e informar CPF de cada sócio",
      modulo: "socios",
    });
  }

  // Sem sócios cadastrados
  if (socsArr.length === 0) {
    recomendacoes.push({
      titulo: "Cadastrar sócios / QSA",
      prioridade: "alta",
      motivo: "Sem quadro societário, não é possível gerar contrato nem proposta bancária.",
      acao: "Acessar aba Dados da Empresa e cadastrar sócios",
      modulo: "socios",
    });
  }

  // Cartão CNPJ ausente
  const temCartaoCnpj = docsArr.some(d => d?.tipo === "cartao_cnpj" && (d?.arquivo_path || d?.url || d?.file_path));
  if (!temCartaoCnpj) {
    recomendacoes.push({
      titulo: "Anexar Cartão CNPJ",
      prioridade: "alta",
      motivo: "Documento obrigatório para análise de crédito e proposta bancária.",
      acao: "Abrir Acervo Documental e fazer upload do Cartão CNPJ",
      modulo: "documentos",
    });
  }

  // Contrato social ausente
  const temContratoSocial = docsArr.some(d =>
    (d?.tipo === "contrato_social" || d?.tipo === "alteracao_contratual") &&
    (d?.arquivo_path || d?.url || d?.file_path)
  );
  if (!temContratoSocial) {
    recomendacoes.push({
      titulo: "Anexar Contrato Social ou Alteração Contratual",
      prioridade: "alta",
      motivo: "Necessário para proposta bancária e geração de contrato.",
      acao: "Abrir Acervo Documental e fazer upload do contrato social",
      modulo: "documentos",
    });
  }

  // Sem faturamento
  if (!empresa?.faturamento_anual || Number(empresa.faturamento_anual) <= 0) {
    recomendacoes.push({
      titulo: "Informar faturamento anual",
      prioridade: "media",
      motivo: "Faturamento é essencial para calcular capacidade de crédito.",
      acao: "Editar dados da empresa e informar faturamento anual estimado",
      modulo: "visao_geral",
    });
  }

  // Sem simulação
  if (safeArray(simulacoes).length === 0) {
    recomendacoes.push({
      titulo: "Criar simulação de crédito",
      prioridade: "media",
      motivo: "Simulação define o produto e valor adequado para o perfil da empresa.",
      acao: "Acessar aba Simulações e criar nova simulação",
      modulo: "simulacoes",
    });
  }

  // Sem CNAE
  if (!empresa?.cnae_principal) {
    recomendacoes.push({
      titulo: "Informar CNAE principal",
      prioridade: "media",
      motivo: "CNAE é necessário para análise de elegibilidade bancária.",
      acao: "Editar dados da empresa e informar CNAE principal",
      modulo: "visao_geral",
    });
  }

  // Situação cadastral irregular
  const situacao = String(empresa?.situacao_cadastral || "").toLowerCase();
  if (situacao && !situacao.includes("ativ") && situacao !== "regular" && situacao !== "não informado") {
    recomendacoes.push({
      titulo: "Regularizar situação cadastral",
      prioridade: "alta",
      motivo: `Situação cadastral "${empresa.situacao_cadastral}" impede análise e aprovação bancária.`,
      acao: "Verificar pendências junto à Receita Federal e regularizar CNPJ",
      modulo: "visao_geral",
    });
  }

  // Sem e-mail
  if (!empresa?.email) {
    recomendacoes.push({
      titulo: "Informar e-mail da empresa",
      prioridade: "baixa",
      motivo: "E-mail é necessário para envio de documentos, orçamentos e contratos.",
      acao: "Editar dados da empresa e informar e-mail de contato",
      modulo: "visao_geral",
    });
  }

  // Ordenar por prioridade
  const ordemPrioridade = { alta: 0, media: 1, baixa: 2 };
  return recomendacoes.sort((a, b) => ordemPrioridade[a.prioridade] - ordemPrioridade[b.prioridade]);
}

function gerarDiagnosticoGeral(params: {
  saude_cadastral: string;
  saude_documental: string;
  risco_credito: string;
  prontidao_contrato: string;
  prontidao_proposta: string;
  score: number;
}): string {
  const { saude_cadastral, saude_documental, risco_credito, prontidao_contrato, score } = params;

  if (score >= 80 && prontidao_contrato === "pronto") {
    return "Apto para iniciar análise — empresa com dados completos e documentação adequada.";
  }
  if (score >= 60) {
    return "Necessita complementação documental — base sólida, mas pendências impedem proposta bancária completa.";
  }
  if (saude_documental === "critico" || saude_cadastral === "critico") {
    return "Risco documental elevado — dados e documentos insuficientes para análise de crédito.";
  }
  if (risco_credito === "critico") {
    return "Dados insuficientes para proposta bancária — situação cadastral ou documental crítica.";
  }
  if (score >= 40) {
    return "Em desenvolvimento — empresa em processo de complementação de dados para análise.";
  }
  return "Cadastro inicial — necessário completar dados, sócios e documentos para avançar.";
}

function gerarCaminhoSugerido(params: {
  prontidao_contrato: string;
  prontidao_proposta: string;
  pendencias: Pendencia360[];
  simulacoes: any[];
  contratos: any[];
}): string {
  const { prontidao_contrato, prontidao_proposta, simulacoes, contratos } = params;

  if (prontidao_proposta === "pronto" && safeArray(simulacoes).length > 0) {
    return "Pronto para geração de proposta preliminar — revisar simulações existentes e gerar proposta bancária.";
  }
  if (prontidao_contrato === "pronto" && safeArray(contratos).length === 0) {
    return "Dados completos para contrato — gerar contrato de prestação de serviços e avançar para proposta.";
  }
  if (prontidao_contrato === "pendencias_menores") {
    return "Resolver pendências menores de dados — após completar, gerar contrato e iniciar proposta bancária.";
  }
  if (prontidao_contrato === "pendencias_criticas") {
    return "Resolver pendências críticas de dados e documentos antes de avançar para contrato ou proposta.";
  }
  return "Iniciar pelo preenchimento completo de dados cadastrais, sócios e documentos essenciais.";
}

function gerarProximasAcoes(recomendacoes: Recomendacao360[], prontidao_contrato: string, simulacoes: any[]): string[] {
  const acoes: string[] = [];

  const altas = recomendacoes.filter(r => r.prioridade === "alta").slice(0, 3);
  for (const r of altas) {
    acoes.push(r.acao);
  }

  if (prontidao_contrato === "pronto" && safeArray(simulacoes).length > 0) {
    acoes.push("Gerar proposta preliminar de crédito");
  }

  if (acoes.length === 0) {
    acoes.push("Revisar dados cadastrais e documentação");
    acoes.push("Verificar pendências de sócios");
  }

  return acoes.slice(0, 5);
}

// ─── Automation Engine (Destrava ↔ Nexus) ─────────────────────────────────────

function montarResumoAutomacao(params: {
  contratoAssessoriaAtivo: any | null;
  acompanhamentoAtivo: any | null;
  atualizacoesAcompanhamento: any[];
  eventosRotina: any[];
}): AutomacaoEngineResumo {
  const { contratoAssessoriaAtivo, acompanhamentoAtivo, atualizacoesAcompanhamento, eventosRotina } = params;

  const eventos = safeArray<any>(eventosRotina);
  const rotinaCnd = eventos.find((e) => e?.event_type === "RotinaCndDue");
  const rotinaCemprot = eventos.find((e) => e?.event_type === "RotinaCemprotDue");

  let acompanhamento_bancario: AutomacaoEngineAcompanhamentoResumo | null = null;
  if (acompanhamentoAtivo) {
    const atualizacoes = safeArray<any>(atualizacoesAcompanhamento);
    const concluidas = atualizacoes.filter((a) => String(a?.status || "") === "concluida").length;
    const total = atualizacoes.length;
    const ultimaAtualizacao = atualizacoes[0]?.updated_at ?? atualizacoes[0]?.created_at ?? null;

    let semanasSemAtualizacao = 0;
    if (ultimaAtualizacao) {
      const dias = Math.floor((Date.now() - new Date(ultimaAtualizacao).getTime()) / 86_400_000);
      semanasSemAtualizacao = Math.max(0, Math.floor(dias / 7));
    }

    acompanhamento_bancario = {
      em_andamento: String(acompanhamentoAtivo?.status || "") === "em_acompanhamento",
      banco_observado: acompanhamentoAtivo?.banco_observado ?? null,
      semanas_total: total,
      semanas_concluidas: concluidas,
      semanas_pendentes: Math.max(0, total - concluidas),
      ultima_atualizacao_em: ultimaAtualizacao,
      semanas_sem_atualizacao: semanasSemAtualizacao,
    };
  }

  return {
    contrato_assessoria_ativo: Boolean(contratoAssessoriaAtivo),
    contrato_vigencia_fim: contratoAssessoriaAtivo?.data_fim_vigencia ?? null,
    rotina_cnd_ultima_geracao: rotinaCnd?.created_at ?? null,
    rotina_cemprot_ultima_geracao: rotinaCemprot?.created_at ?? null,
    acompanhamento_bancario,
  };
}

/**
 * Recomendações em texto livre (diferente de Recomendacao360, que é
 * estruturada) -- espelham o formato pedido para o Automation Engine, ex.:
 * "A empresa está há 2 semanas sem atualização bancária."
 */
function gerarRecomendacoesAutomacao(resumo: AutomacaoEngineResumo): string[] {
  const mensagens: string[] = [];
  const ab = resumo.acompanhamento_bancario;

  if (ab?.em_andamento && ab.semanas_sem_atualizacao >= 2) {
    mensagens.push(`A empresa está há ${ab.semanas_sem_atualizacao} semanas sem atualização bancária.`);
    mensagens.push("Há risco de perda de evolução do rating interno.");
    mensagens.push("Sugere-se regularizar as movimentações bancárias o quanto antes.");
  } else if (ab?.em_andamento && ab.semanas_pendentes > 0) {
    mensagens.push(`Existem ${ab.semanas_pendentes} semana(s) de acompanhamento bancário pendente(s) de registro.`);
  }

  if (resumo.contrato_assessoria_ativo && resumo.contrato_vigencia_fim) {
    const fim = new Date(`${resumo.contrato_vigencia_fim}T12:00:00Z`);
    const diasRestantes = Math.floor((fim.getTime() - Date.now()) / 86_400_000);
    if (Number.isFinite(diasRestantes) && diasRestantes >= 0 && diasRestantes <= 30) {
      mensagens.push(`O contrato de assessoria vence em ${diasRestantes} dia(s) — avaliar renovação.`);
    }
  }

  if (resumo.contrato_assessoria_ativo && !resumo.rotina_cnd_ultima_geracao) {
    mensagens.push("Nenhuma rotina de CND foi gerada ainda para este contrato.");
  }

  return mensagens;
}

// ─── Função principal ─────────────────────────────────────────────────────────

export function calcularInteligencia360(params: {
  empresa: any;
  socios: any[];
  documentos: any[];
  simulacoes: any[];
  contratos: any[];
  historico: any[];
  followups: any[];
  // Automation Engine -- todos opcionais para não quebrar chamadores existentes.
  acompanhamentoAtivo?: any | null;
  atualizacoesAcompanhamento?: any[];
  eventosRotina?: any[];
}): Inteligencia360Result {
  const { empresa, socios, documentos, simulacoes, contratos, historico, followups } = params;
  const acompanhamentoAtivo = params.acompanhamentoAtivo ?? null;
  const atualizacoesAcompanhamento = safeArray<any>(params.atualizacoesAcompanhamento);
  const eventosRotina = safeArray<any>(params.eventosRotina);

  // Garantir arrays seguros
  const socsArr = safeArray<any>(socios);
  const docsArr = safeArray<any>(documentos);
  const simsArr = safeArray<any>(simulacoes);
  const contsArr = safeArray<any>(contratos);
  const histArr = safeArray<any>(historico);
  const followsArr = safeArray<any>(followups);

  // Cálculos principais
  const saude_cadastral = classificarSaudeCadastral(empresa);
  const saude_documental = classificarSaudeDocumental(docsArr);
  const risco_documental = classificarRiscoDocumental(empresa, docsArr, socsArr);
  const risco_credito = classificarRiscoCredito(empresa, socsArr);
  const prontidao_contrato = calcularProntidaoContrato(empresa, socsArr, docsArr);
  const prontidao_proposta_bancaria = calcularProntidaoProposta(empresa, docsArr, simsArr);

  const score_destrava = calcularScoreDestrava({
    empresa,
    socios: socsArr,
    documentos: docsArr,
    simulacoes: simsArr,
    contratos: contsArr,
  });

  // Documentos
  const documentos_com_arquivo = docsArr.filter(d => d?.arquivo_path || d?.url || d?.file_path).length;
  const documentos_sem_arquivo = docsArr.length - documentos_com_arquivo;
  const documentos_validados = docsArr.filter(d => d?.status === "validado").length;
  const documentos_pendentes_validacao = docsArr.filter(d => d?.status === "pendente_validacao").length;

  // Sócios
  const socios_com_cpf = socsArr.filter(s => s?.cpf_cnpj && String(s.cpf_cnpj).replace(/\D/g, "").length >= 11).length;
  const socios_sem_cpf = socsArr.length - socios_com_cpf;
  const socios_com_pendencias = socsArr.filter(s => !s?.cpf_cnpj || !s?.nome).length;

  // Pendências
  const { pendencias, pendencias_contrato, pendencias_credito, pendencias_faturamento, pendencias_cadastrais } =
    gerarPendencias(empresa, socsArr, docsArr);

  // Automation Engine
  const contratoAssessoriaAtivo = contsArr.find(
    (c) => String(c?.tipo_contrato || "") === "assessoria" && String(c?.status || "") === "assinado"
  ) ?? null;
  const automacao_engine = montarResumoAutomacao({
    contratoAssessoriaAtivo,
    acompanhamentoAtivo,
    atualizacoesAcompanhamento,
    eventosRotina,
  });
  const recomendacoes_automacao = gerarRecomendacoesAutomacao(automacao_engine);

  // Recomendações
  const recomendacoes = gerarRecomendacoes({
    empresa,
    socios: socsArr,
    documentos: docsArr,
    simulacoes: simsArr,
    contratos: contsArr,
    pendencias,
  });

  // Diagnóstico e caminho
  const diagnostico_geral = gerarDiagnosticoGeral({
    saude_cadastral,
    saude_documental,
    risco_credito,
    prontidao_contrato,
    prontidao_proposta: prontidao_proposta_bancaria,
    score: score_destrava,
  });

  const caminho_sugerido = gerarCaminhoSugerido({
    prontidao_contrato,
    prontidao_proposta: prontidao_proposta_bancaria,
    pendencias,
    simulacoes: simsArr,
    contratos: contsArr,
  });

  const proximas_acoes = gerarProximasAcoes(recomendacoes, prontidao_contrato, simsArr);

  // Proposta preliminar
  const ultimaSimulacao = simsArr[0] ?? null;
  const proposta_preliminar: PropostaPreliminar = {
    empresa: safeString(empresa?.razao_social || empresa?.nome_fantasia),
    cnpj: empresa?.cnpj ?? null,
    segmento: empresa?.segmento ?? null,
    cnae: empresa?.cnae_principal ?? null,
    capital_social: safeNumber(empresa?.capital_social),
    faturamento: safeNumber(empresa?.faturamento_anual),
    score_interno: safeNumber(empresa?.score_interno),
    documentos_disponiveis: documentos_com_arquivo,
    pendencias_count: pendencias.length,
    valor_sugerido: ultimaSimulacao?.valor_solicitado ? safeNumber(ultimaSimulacao.valor_solicitado) : null,
    observacao: "Proposta preliminar sujeita a análise e aprovação do banco. Não representa compromisso de crédito.",
    apto_para_proposta: prontidao_proposta_bancaria === "pronto",
  };

  // Dados da Receita
  const dados_receita = {
    sincronizado: !!empresa?.ultima_sincronizacao_receita,
    ultima_sincronizacao: empresa?.ultima_sincronizacao_receita ?? null,
    situacao: empresa?.situacao_cadastral ?? null,
    data_situacao: empresa?.data_situacao_cadastral ?? null,
    motivo_situacao: empresa?.motivo_situacao_cadastral ?? null,
    matriz_filial: empresa?.matriz_filial ?? null,
    natureza_juridica: empresa?.natureza_juridica ?? null,
  };

  return {
    empresa_id: String(empresa?.id ?? ""),
    razao_social: safeString(empresa?.razao_social || empresa?.nome_fantasia),
    cnpj: empresa?.cnpj ?? null,

    saude_cadastral,
    saude_documental,
    risco_documental,
    risco_credito,
    prontidao_contrato,
    prontidao_proposta_bancaria,

    score_destrava,
    score_serasa: safeNumber(empresa?.score_serasa),
    score_spc: safeNumber(empresa?.score_spc),
    score_interno: safeNumber(empresa?.score_interno),

    situacao_cadastral: safeString(empresa?.situacao_cadastral, "Não informado"),
    regime_tributario: empresa?.regime_tributario ?? null,
    porte: empresa?.porte ?? null,
    capital_social: safeNumber(empresa?.capital_social),
    data_abertura: empresa?.data_abertura ?? null,
    cnae_principal: empresa?.cnae_principal ?? null,
    segmento: empresa?.segmento ?? null,

    dados_receita,

    socios: socsArr,
    socios_com_cpf,
    socios_sem_cpf,
    socios_com_pendencias,

    documentos: docsArr,
    documentos_com_arquivo,
    documentos_sem_arquivo,
    documentos_validados,
    documentos_pendentes_validacao,

    pendencias,
    pendencias_contrato,
    pendencias_credito,
    pendencias_faturamento,
    pendencias_cadastrais,

    simulacoes: simsArr,
    contratos: contsArr,
    faturamento: safeNumber(empresa?.faturamento_anual),
    historico_count: histArr.length,
    followups_abertos: followsArr.filter((f: any) => !f?.concluido).length,

    proposta_preliminar,
    recomendacoes,
    proximas_acoes,
    diagnostico_geral,
    caminho_sugerido,

    gerado_em: new Date().toISOString(),
    fonte: "deterministica",

    automacao_engine,
    recomendacoes_automacao,
  };
}

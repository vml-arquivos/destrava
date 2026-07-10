/**
 * propostaBancariaService.ts
 *
 * Serviço de consolidação de dados para Proposta Bancária Inteligente.
 * Gera proposta preliminar de crédito consultiva sem dependência de IA externa.
 *
 * REGRA: ZERO REGRESSÃO — apenas leitura, sem alterar dados existentes.
 * A proposta é preliminar e consultiva. Nunca promete aprovação bancária.
 *
 * Linguagem obrigatória:
 *   - "apto para análise preliminar"
 *   - "necessita complementação documental"
 *   - "proposta sujeita à análise bancária"
 *   - "capacidade estimada com base nos dados disponíveis"
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface EmpresaProposta {
  id: string;
  razao_social: string;
  cnpj: string | null;
  cidade: string | null;
  estado: string | null;
  situacao_cadastral: string | null;
  cnae_principal: string | null;
  natureza_juridica: string | null;
  capital_social: number | null;
  faturamento_anual: number | null;
  limite_atual: number | null;
  regime_tributario: string | null;
  porte: string | null;
  data_abertura: string | null;
  segmento: string | null;
  score_interno: number | null;
  score_serasa: number | null;
  score_spc: number | null;
  responsavel_nome: string | null;
  responsavel_cpf: string | null;
  email: string | null;
  telefone: string | null;
}

export interface PerfilCredito {
  situacao: string;
  regime_tributario: string;
  porte: string;
  tempo_atividade: string | null;
  cnae: string;
  natureza_juridica: string;
  capital_social: string;
  faturamento: string;
  limite_atual: string;
  score_destrava: number;
  score_interno: string;
  score_serasa: string;
  score_spc: string;
  nivel_risco: "baixo" | "medio" | "alto" | "critico";
  classificacao: string;
}

export interface CapacidadeCredito {
  faturamento_base: number | null;
  capital_social_base: number | null;
  limite_estimado_min: number | null;
  limite_estimado_max: number | null;
  prazo_sugerido_min: number;
  prazo_sugerido_max: number;
  observacao: string;
  dados_suficientes: boolean;
}

export interface DocumentacaoProposta {
  total_documentos: number;
  documentos_com_arquivo: number;
  documentos_sem_arquivo: number;
  documentos_validados: number;
  documentos_pendentes: number;
  percentual_cobertura: number;
  status: "completo" | "parcial" | "insuficiente" | "critico";
  lista: Array<{
    tipo: string;
    tem_arquivo: boolean;
    status: string;
  }>;
}

export interface RiscoProposta {
  tipo: string;
  descricao: string;
  severidade: "critica" | "alta" | "media" | "baixa";
  mitigacao: string;
}

export interface PendenciaProposta {
  tipo: string;
  descricao: string;
  impacto: "bloqueia_proposta" | "reduz_limite" | "informativo";
  acao_requerida: string;
}

export interface PropostaPreliminar {
  valorSugerido: number | null;
  prazoSugerido: number | null;
  produtoSugerido: string | null;
  justificativa: string;
  observacoes: string[];
}

export interface PropostaBancariaResult {
  empresa: EmpresaProposta;
  resumoExecutivo: string;
  perfilCredito: PerfilCredito;
  capacidadeCredito: CapacidadeCredito;
  documentacao: DocumentacaoProposta;
  pendencias: PendenciaProposta[];
  riscos: RiscoProposta[];
  pontosFortes: string[];
  simulacoes: Array<{
    id: string;
    produto: string;
    valor_solicitado: number | null;
    prazo_meses: number | null;
    status: string;
  }>;
  orcamentos: Array<{
    id: string;
    descricao: string;
    valor_total: number | null;
    status: string;
  }>;
  contratos: Array<{
    id: string;
    numero: string;
    tipo: string;
    valor: number | null;
    status: string;
    data_assinatura: string | null;
  }>;
  propostaPreliminar: PropostaPreliminar;
  parecerTecnico: string;
  proximosPassos: string[];
  score_destrava: number;
  status_proposta: "apto_analise" | "necessita_complementacao" | "dados_insuficientes" | "inapto";
  gerado_em: string;
  fonte: "deterministica";
}

// ─── Entrada do serviço ───────────────────────────────────────────────────────

export interface PropostaBancariaInput {
  empresa: any;
  socios: any[];
  documentos: any[];
  simulacoes: any[];
  orcamentos: any[];
  contratos: any[];
  historico: any[];
  recomendacoes360?: any[];
}

// ─── Utilitários internos ─────────────────────────────────────────────────────

function safeArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function safeStr(v: unknown, fallback = "Não informado"): string {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v).trim() || fallback;
}

function safeNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtBRL(v: number | null): string {
  if (v === null) return "Não informado";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function calcularScoreDestrava(empresa: any, socios: any[], documentos: any[], simulacoes: any[]): number {
  let score = 0;

  // Dados cadastrais (30 pts)
  if (empresa?.cnpj) score += 10;
  if (empresa?.razao_social) score += 5;
  if (empresa?.situacao_cadastral?.toLowerCase().includes("ativa")) score += 10;
  if (empresa?.cnae_principal) score += 5;

  // Dados financeiros (25 pts)
  const fat = safeNum(empresa?.faturamento_anual);
  if (fat && fat > 0) score += 15;
  const cap = safeNum(empresa?.capital_social);
  if (cap && cap > 0) score += 10;

  // Documentação (25 pts)
  const docs = safeArr<any>(documentos);
  const docsComArquivo = docs.filter(d => d?.arquivo_path || d?.url || d?.file_path).length;
  if (docsComArquivo >= 5) score += 25;
  else if (docsComArquivo >= 3) score += 15;
  else if (docsComArquivo >= 1) score += 8;

  // Sócios (10 pts)
  const sociosArr = safeArr<any>(socios);
  const sociosComCpf = sociosArr.filter(s => {
    const cpf = String(s?.cpf_cnpj || "").replace(/\D/g, "");
    return cpf.length >= 11;
  }).length;
  if (sociosComCpf > 0) score += 10;

  // Simulações (10 pts)
  const simsArr = safeArr<any>(simulacoes);
  if (simsArr.length > 0) score += 10;

  return Math.min(100, score);
}

function calcularNivelRisco(empresa: any, socios: any[], documentos: any[]): "baixo" | "medio" | "alto" | "critico" {
  const docs = safeArr<any>(documentos);
  const sociosArr = safeArr<any>(socios);

  const ativa = safeStr(empresa?.situacao_cadastral).toLowerCase().includes("ativa");
  const temCnpj = !!empresa?.cnpj;
  const temFaturamento = safeNum(empresa?.faturamento_anual) !== null;
  const temDocumentos = docs.filter(d => d?.arquivo_path || d?.url || d?.file_path).length >= 3;
  const temSociosComCpf = sociosArr.some(s => String(s?.cpf_cnpj || "").replace(/\D/g, "").length >= 11);

  const pontosCriticos = [!temCnpj, !ativa].filter(Boolean).length;
  const pontosAltos = [!temFaturamento, !temDocumentos, !temSociosComCpf].filter(Boolean).length;

  if (pontosCriticos >= 1) return "critico";
  if (pontosAltos >= 2) return "alto";
  if (pontosAltos === 1) return "medio";
  return "baixo";
}

function calcularCapacidadeCredito(empresa: any, simulacoes: any[]): CapacidadeCredito {
  const fat = safeNum(empresa?.faturamento_anual);
  const cap = safeNum(empresa?.capital_social);
  const simsArr = safeArr<any>(simulacoes);

  // Valor da última simulação como referência
  const ultimaSim = simsArr.length > 0 ? simsArr[0] : null;
  const valorSimulado = ultimaSim ? safeNum(ultimaSim?.valor_solicitado) : null;

  if (!fat && !cap && !valorSimulado) {
    return {
      faturamento_base: null,
      capital_social_base: null,
      limite_estimado_min: null,
      limite_estimado_max: null,
      prazo_sugerido_min: 12,
      prazo_sugerido_max: 60,
      observacao: "Dados insuficientes para estimar capacidade de crédito. Necessário informar faturamento anual.",
      dados_suficientes: false,
    };
  }

  // Estimativa conservadora: 10% do faturamento ou 30% do capital social
  let limiteMin: number | null = null;
  let limiteMax: number | null = null;

  if (fat && fat > 0) {
    limiteMin = Math.round(fat * 0.10);
    limiteMax = Math.round(fat * 0.30);
  } else if (cap && cap > 0) {
    limiteMin = Math.round(cap * 0.20);
    limiteMax = Math.round(cap * 0.50);
  }

  // Se há simulação, usar como referência de teto
  if (valorSimulado && limiteMax && valorSimulado < limiteMax) {
    limiteMax = valorSimulado;
  }

  return {
    faturamento_base: fat,
    capital_social_base: cap,
    limite_estimado_min: limiteMin,
    limite_estimado_max: limiteMax,
    prazo_sugerido_min: 12,
    prazo_sugerido_max: 60,
    observacao: "Capacidade estimada com base nos dados disponíveis. Proposta sujeita à análise bancária.",
    dados_suficientes: true,
  };
}

function calcularDocumentacao(documentos: any[]): DocumentacaoProposta {
  const docs = safeArr<any>(documentos);
  const comArquivo = docs.filter(d => d?.arquivo_path || d?.url || d?.file_path).length;
  const semArquivo = docs.length - comArquivo;
  const validados = docs.filter(d => d?.status === "validado" || d?.status === "aprovado").length;
  const pendentes = docs.filter(d => !d?.status || d?.status === "ativo" || d?.status === "pendente").length;
  const pct = docs.length > 0 ? Math.round((comArquivo / docs.length) * 100) : 0;

  let status: DocumentacaoProposta["status"] = "critico";
  if (pct >= 80) status = "completo";
  else if (pct >= 50) status = "parcial";
  else if (pct >= 20) status = "insuficiente";

  return {
    total_documentos: docs.length,
    documentos_com_arquivo: comArquivo,
    documentos_sem_arquivo: semArquivo,
    documentos_validados: validados,
    documentos_pendentes: pendentes,
    percentual_cobertura: pct,
    status,
    lista: docs.map(d => ({
      tipo: safeStr(d?.tipo || d?.nome_arquivo, "Documento"),
      tem_arquivo: !!(d?.arquivo_path || d?.url || d?.file_path),
      status: safeStr(d?.status, "ativo"),
    })),
  };
}

function gerarPendencias(empresa: any, socios: any[], documentos: any[]): PendenciaProposta[] {
  const pendencias: PendenciaProposta[] = [];
  const docs = safeArr<any>(documentos);
  const sociosArr = safeArr<any>(socios);

  // CNPJ
  if (!empresa?.cnpj) {
    pendencias.push({
      tipo: "cadastral",
      descricao: "CNPJ não informado",
      impacto: "bloqueia_proposta",
      acao_requerida: "Informar CNPJ válido no cadastro da empresa",
    });
  }

  // Situação cadastral
  const situacao = safeStr(empresa?.situacao_cadastral).toLowerCase();
  if (situacao !== "ativa" && situacao !== "não informado" && situacao !== "") {
    if (!situacao.includes("ativa")) {
      pendencias.push({
        tipo: "cadastral",
        descricao: `Situação cadastral irregular: ${safeStr(empresa?.situacao_cadastral)}`,
        impacto: "bloqueia_proposta",
        acao_requerida: "Regularizar situação cadastral na Receita Federal",
      });
    }
  }

  // Faturamento
  if (!safeNum(empresa?.faturamento_anual)) {
    pendencias.push({
      tipo: "financeiro",
      descricao: "Faturamento anual não informado",
      impacto: "reduz_limite",
      acao_requerida: "Informar faturamento anual para cálculo de capacidade de crédito",
    });
  }

  // Capital social
  if (!safeNum(empresa?.capital_social)) {
    pendencias.push({
      tipo: "financeiro",
      descricao: "Capital social não sincronizado",
      impacto: "reduz_limite",
      acao_requerida: "Sincronizar dados da Receita Federal para obter capital social",
    });
  }

  // Sócios sem CPF
  const semCpf = sociosArr.filter(s => {
    const cpf = String(s?.cpf_cnpj || "").replace(/\D/g, "");
    return cpf.length < 11;
  });
  if (semCpf.length > 0) {
    pendencias.push({
      tipo: "documental",
      descricao: `${semCpf.length} sócio(s) sem CPF cadastrado`,
      impacto: "bloqueia_proposta",
      acao_requerida: "Cadastrar CPF de todos os sócios no módulo QSA",
    });
  }

  // Sem sócios
  if (sociosArr.length === 0) {
    pendencias.push({
      tipo: "documental",
      descricao: "Nenhum sócio cadastrado no QSA",
      impacto: "bloqueia_proposta",
      acao_requerida: "Cadastrar sócios/administradores no módulo QSA",
    });
  }

  // Documentos sem arquivo
  const semArquivo = docs.filter(d => !(d?.arquivo_path || d?.url || d?.file_path));
  if (semArquivo.length > 0) {
    pendencias.push({
      tipo: "documental",
      descricao: `${semArquivo.length} documento(s) sem arquivo físico`,
      impacto: "reduz_limite",
      acao_requerida: "Fazer upload dos documentos pendentes no Acervo Documental",
    });
  }

  // Sem documentos
  if (docs.length === 0) {
    pendencias.push({
      tipo: "documental",
      descricao: "Nenhum documento no acervo",
      impacto: "bloqueia_proposta",
      acao_requerida: "Enviar documentação básica: Cartão CNPJ, Contrato Social e extrato de faturamento",
    });
  }

  return pendencias;
}

function gerarRiscos(empresa: any, socios: any[], documentos: any[], nivelRisco: string): RiscoProposta[] {
  const riscos: RiscoProposta[] = [];
  const docs = safeArr<any>(documentos);
  const sociosArr = safeArr<any>(socios);

  // Risco de documentação insuficiente
  const comArquivo = docs.filter(d => d?.arquivo_path || d?.url || d?.file_path).length;
  if (comArquivo < 3) {
    riscos.push({
      tipo: "documental",
      descricao: "Documentação insuficiente para análise bancária completa",
      severidade: comArquivo === 0 ? "critica" : "alta",
      mitigacao: "Complementar acervo documental com pelo menos 3 documentos com arquivo físico",
    });
  }

  // Risco de sócios sem CPF
  const semCpf = sociosArr.filter(s => String(s?.cpf_cnpj || "").replace(/\D/g, "").length < 11);
  if (semCpf.length > 0) {
    riscos.push({
      tipo: "cadastral",
      descricao: `Sócios sem CPF impedem análise de crédito individual`,
      severidade: "alta",
      mitigacao: "Cadastrar CPF de todos os sócios antes de submeter proposta",
    });
  }

  // Risco de faturamento não informado
  if (!safeNum(empresa?.faturamento_anual)) {
    riscos.push({
      tipo: "financeiro",
      descricao: "Faturamento não informado — limita cálculo de capacidade de crédito",
      severidade: "media",
      mitigacao: "Informar faturamento anual comprovado para ampliar limite estimado",
    });
  }

  // Risco de situação cadastral
  const situacao = safeStr(empresa?.situacao_cadastral).toLowerCase();
  if (situacao && !situacao.includes("ativa") && situacao !== "não informado") {
    riscos.push({
      tipo: "regulatório",
      descricao: `Situação cadastral: ${safeStr(empresa?.situacao_cadastral)} — pode impedir análise`,
      severidade: "critica",
      mitigacao: "Regularizar situação cadastral na Receita Federal antes de submeter proposta",
    });
  }

  // Risco de empresa nova (< 1 ano)
  if (empresa?.data_abertura) {
    try {
      const abertura = new Date(empresa.data_abertura);
      const meses = (Date.now() - abertura.getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (meses < 12) {
        riscos.push({
          tipo: "operacional",
          descricao: `Empresa com menos de 12 meses de atividade (${Math.round(meses)} meses)`,
          severidade: "media",
          mitigacao: "Apresentar projeções financeiras e histórico de faturamento disponível",
        });
      }
    } catch { /* ignora */ }
  }

  return riscos;
}

function gerarPontosFortes(empresa: any, socios: any[], documentos: any[], simulacoes: any[], contratos: any[]): string[] {
  const pontos: string[] = [];
  const docs = safeArr<any>(documentos);
  const sociosArr = safeArr<any>(socios);
  const simsArr = safeArr<any>(simulacoes);
  const contsArr = safeArr<any>(contratos);

  const situacao = safeStr(empresa?.situacao_cadastral).toLowerCase();
  if (situacao.includes("ativa")) pontos.push("Empresa com situação cadastral ativa na Receita Federal");

  const fat = safeNum(empresa?.faturamento_anual);
  if (fat && fat > 0) pontos.push(`Faturamento anual informado: ${fmtBRL(fat)}`);

  const cap = safeNum(empresa?.capital_social);
  if (cap && cap > 50000) pontos.push(`Capital social relevante: ${fmtBRL(cap)}`);

  const comArquivo = docs.filter(d => d?.arquivo_path || d?.url || d?.file_path).length;
  if (comArquivo >= 3) pontos.push(`Acervo documental com ${comArquivo} documento(s) com arquivo físico`);

  const sociosComCpf = sociosArr.filter(s => String(s?.cpf_cnpj || "").replace(/\D/g, "").length >= 11);
  if (sociosComCpf.length > 0) pontos.push(`${sociosComCpf.length} sócio(s) com CPF cadastrado para análise individual`);

  if (simsArr.length > 0) pontos.push(`${simsArr.length} simulação(ões) de crédito realizadas — demonstra intenção de crédito`);

  if (contsArr.length > 0) pontos.push(`${contsArr.length} contrato(s) firmado(s) — histórico de relacionamento comercial`);

  if (empresa?.cnae_principal) pontos.push(`CNAE principal cadastrado: ${empresa.cnae_principal}`);

  if (empresa?.regime_tributario) pontos.push(`Regime tributário: ${empresa.regime_tributario}`);

  if (pontos.length === 0) pontos.push("Empresa cadastrada no sistema — dados básicos disponíveis para análise inicial");

  return pontos;
}

function gerarPropostaPreliminar(
  empresa: any,
  capacidade: CapacidadeCredito,
  pendencias: PendenciaProposta[],
  simulacoes: any[]
): PropostaPreliminar {
  const simsArr = safeArr<any>(simulacoes);
  const bloqueantes = pendencias.filter(p => p.impacto === "bloqueia_proposta");
  const observacoes: string[] = [];

  observacoes.push("Proposta sujeita à análise bancária e critérios da instituição financeira.");

  if (bloqueantes.length > 0) {
    observacoes.push(`${bloqueantes.length} pendência(s) crítica(s) devem ser resolvidas antes da submissão.`);
  }

  if (!capacidade.dados_suficientes) {
    observacoes.push("Dados insuficientes para estimativa de limite. Informe faturamento anual.");
  }

  // Produto sugerido baseado no CNAE e faturamento
  let produtoSugerido: string | null = null;
  const cnae = safeStr(empresa?.cnae_principal, "").toLowerCase();
  const fat = safeNum(empresa?.faturamento_anual);

  if (cnae.includes("comércio") || cnae.includes("varejo") || cnae.includes("atacado")) {
    produtoSugerido = "Capital de Giro";
  } else if (cnae.includes("construção") || cnae.includes("imobiliária")) {
    produtoSugerido = "Crédito para Construção / Reforma";
  } else if (cnae.includes("serviço") || cnae.includes("consultoria")) {
    produtoSugerido = "Antecipação de Recebíveis";
  } else if (fat && fat > 1000000) {
    produtoSugerido = "Capital de Giro / FINAME";
  } else {
    // Verificar simulações existentes
    const ultimaSim = simsArr[0];
    if (ultimaSim?.produto) {
      produtoSugerido = ultimaSim.produto;
    } else {
      produtoSugerido = "Capital de Giro";
    }
  }

  // Valor sugerido
  let valorSugerido: number | null = null;
  if (capacidade.limite_estimado_min && capacidade.limite_estimado_max) {
    // Usar média entre min e max como sugestão
    valorSugerido = Math.round((capacidade.limite_estimado_min + capacidade.limite_estimado_max) / 2);
  } else if (simsArr.length > 0) {
    valorSugerido = safeNum(simsArr[0]?.valor_solicitado);
  }

  // Prazo sugerido
  let prazoSugerido: number | null = null;
  if (simsArr.length > 0 && simsArr[0]?.prazo_meses) {
    prazoSugerido = safeNum(simsArr[0].prazo_meses);
  } else if (capacidade.dados_suficientes) {
    prazoSugerido = 36; // padrão conservador
  }

  const justificativa = bloqueantes.length > 0
    ? `Necessita complementação documental antes da análise. ${bloqueantes.length} pendência(s) crítica(s) identificada(s).`
    : capacidade.dados_suficientes
      ? `Empresa apta para análise preliminar. Capacidade estimada com base nos dados disponíveis.`
      : `Dados insuficientes para proposta completa. Necessário informar faturamento e complementar documentação.`;

  return {
    valorSugerido,
    prazoSugerido,
    produtoSugerido,
    justificativa,
    observacoes,
  };
}

function gerarParecerTecnico(
  empresa: any,
  scoreDestrava: number,
  nivelRisco: string,
  pendencias: PendenciaProposta[],
  capacidade: CapacidadeCredito,
  proposta: PropostaPreliminar
): string {
  const bloqueantes = pendencias.filter(p => p.impacto === "bloqueia_proposta");
  const razao = safeStr(empresa?.razao_social);
  const cnpj = safeStr(empresa?.cnpj, "CNPJ não informado");

  const status = bloqueantes.length > 0
    ? "necessita complementação documental"
    : scoreDestrava >= 60
      ? "apta para análise preliminar"
      : "necessita complementação para análise completa";

  let parecer = `A empresa ${razao} (${cnpj}) apresenta-se ${status}. `;

  parecer += `Score Destrava: ${scoreDestrava}/100. `;

  if (capacidade.dados_suficientes && capacidade.limite_estimado_max) {
    parecer += `Capacidade estimada com base nos dados disponíveis: até ${fmtBRL(capacidade.limite_estimado_max)}. `;
  } else {
    parecer += `Capacidade de crédito não estimada por insuficiência de dados financeiros. `;
  }

  if (bloqueantes.length > 0) {
    parecer += `Identificadas ${bloqueantes.length} pendência(s) que bloqueiam a proposta: `;
    parecer += bloqueantes.slice(0, 2).map(p => p.descricao).join("; ");
    if (bloqueantes.length > 2) parecer += ` e mais ${bloqueantes.length - 2} pendência(s)`;
    parecer += ". ";
  }

  parecer += `Esta proposta é preliminar e consultiva. Proposta sujeita à análise bancária e critérios da instituição financeira parceira. Não constitui garantia ou promessa de aprovação de crédito.`;

  return parecer;
}

function gerarProximosPassos(pendencias: PendenciaProposta[], proposta: PropostaPreliminar): string[] {
  const passos: string[] = [];
  const bloqueantes = pendencias.filter(p => p.impacto === "bloqueia_proposta");
  const redutores = pendencias.filter(p => p.impacto === "reduz_limite");

  if (bloqueantes.length > 0) {
    passos.push(`Resolver ${bloqueantes.length} pendência(s) crítica(s) que bloqueiam a proposta`);
  }

  if (redutores.length > 0) {
    passos.push(`Complementar ${redutores.length} item(ns) para ampliar o limite estimado`);
  }

  if (proposta.valorSugerido) {
    passos.push(`Validar valor sugerido de ${fmtBRL(proposta.valorSugerido)} com o gestor responsável`);
  }

  passos.push("Revisar documentação no Acervo Documental e garantir arquivos físicos atualizados");
  passos.push("Confirmar dados de faturamento e capital social com a contabilidade");
  passos.push("Submeter proposta ao banco/parceiro após resolução das pendências");
  passos.push("Acompanhar retorno da análise bancária no módulo de Contratos");

  return passos;
}

function gerarResumoExecutivo(
  empresa: any,
  scoreDestrava: number,
  pendencias: PendenciaProposta[],
  proposta: PropostaPreliminar
): string {
  const razao = safeStr(empresa?.razao_social);
  const bloqueantes = pendencias.filter(p => p.impacto === "bloqueia_proposta");

  if (bloqueantes.length > 0) {
    return `${razao} necessita complementação documental antes da análise de crédito. Score Destrava: ${scoreDestrava}/100. ${bloqueantes.length} pendência(s) crítica(s) identificada(s). Resolva as pendências para avançar com a proposta.`;
  }

  if (proposta.valorSugerido) {
    return `${razao} está apta para análise preliminar de crédito. Score Destrava: ${scoreDestrava}/100. Capacidade estimada com base nos dados disponíveis: ${fmtBRL(proposta.valorSugerido)}. Proposta sujeita à análise bancária.`;
  }

  return `${razao} está cadastrada no sistema. Score Destrava: ${scoreDestrava}/100. Dados insuficientes para estimativa completa. Complementar informações financeiras e documentação para avançar com a proposta.`;
}

// ─── Função principal exportada ───────────────────────────────────────────────

export function calcularPropostaBancaria(input: PropostaBancariaInput): PropostaBancariaResult {
  // Proteção total contra null/undefined
  const empresa = input?.empresa ?? {};
  const socios = safeArr<any>(input?.socios);
  const documentos = safeArr<any>(input?.documentos);
  const simulacoes = safeArr<any>(input?.simulacoes);
  const orcamentos = safeArr<any>(input?.orcamentos);
  const contratos = safeArr<any>(input?.contratos);
  const historico = safeArr<any>(input?.historico);
  const recomendacoes360 = safeArr<any>(input?.recomendacoes360);

  // Cálculos principais
  const scoreDestrava = calcularScoreDestrava(empresa, socios, documentos, simulacoes);
  const nivelRisco = calcularNivelRisco(empresa, socios, documentos);
  const capacidade = calcularCapacidadeCredito(empresa, simulacoes);
  const documentacao = calcularDocumentacao(documentos);
  const pendencias = gerarPendencias(empresa, socios, documentos);
  const riscos = gerarRiscos(empresa, socios, documentos, nivelRisco);
  const pontosFortes = gerarPontosFortes(empresa, socios, documentos, simulacoes, contratos);
  const proposta = gerarPropostaPreliminar(empresa, capacidade, pendencias, simulacoes);
  const parecer = gerarParecerTecnico(empresa, scoreDestrava, nivelRisco, pendencias, capacidade, proposta);
  const proximosPassos = gerarProximosPassos(pendencias, proposta);
  const resumo = gerarResumoExecutivo(empresa, scoreDestrava, pendencias, proposta);

  // Status da proposta
  const bloqueantes = pendencias.filter(p => p.impacto === "bloqueia_proposta");
  let statusProposta: PropostaBancariaResult["status_proposta"] = "apto_analise";
  if (bloqueantes.length >= 3) statusProposta = "inapto";
  else if (bloqueantes.length > 0) statusProposta = "necessita_complementacao";
  else if (!capacidade.dados_suficientes) statusProposta = "dados_insuficientes";

  // Perfil de crédito
  const perfilCredito: PerfilCredito = {
    situacao: safeStr(empresa?.situacao_cadastral),
    regime_tributario: safeStr(empresa?.regime_tributario),
    porte: empresa?.porte ? String(empresa.porte).toUpperCase() : "Não informado",
    tempo_atividade: empresa?.data_abertura ? (() => {
      try {
        const meses = Math.round((Date.now() - new Date(empresa.data_abertura).getTime()) / (1000 * 60 * 60 * 24 * 30));
        return meses >= 12 ? `${Math.floor(meses / 12)} ano(s) e ${meses % 12} mês(es)` : `${meses} mês(es)`;
      } catch { return null; }
    })() : null,
    cnae: safeStr(empresa?.cnae_principal),
    natureza_juridica: safeStr(empresa?.natureza_juridica),
    capital_social: fmtBRL(safeNum(empresa?.capital_social)),
    faturamento: fmtBRL(safeNum(empresa?.faturamento_anual)),
    limite_atual: fmtBRL(safeNum(empresa?.limite_atual)),
    score_destrava: scoreDestrava,
    score_interno: empresa?.score_interno != null ? String(empresa.score_interno) : "Não informado",
    score_serasa: empresa?.score_serasa != null ? String(empresa.score_serasa) : "Não informado",
    score_spc: empresa?.score_spc != null ? String(empresa.score_spc) : "Não informado",
    nivel_risco: nivelRisco,
    classificacao: nivelRisco === "baixo" ? "Perfil favorável para análise"
      : nivelRisco === "medio" ? "Perfil com pontos de atenção"
      : nivelRisco === "alto" ? "Perfil com riscos relevantes — necessita complementação"
      : "Perfil crítico — necessita regularização antes da análise",
  };

  // Empresa normalizada
  const empresaNorm: EmpresaProposta = {
    id: safeStr(empresa?.id, ""),
    razao_social: safeStr(empresa?.razao_social),
    cnpj: empresa?.cnpj ?? null,
    cidade: empresa?.cidade ?? null,
    estado: empresa?.estado ?? null,
    situacao_cadastral: empresa?.situacao_cadastral ?? null,
    cnae_principal: empresa?.cnae_principal ?? null,
    natureza_juridica: empresa?.natureza_juridica ?? null,
    capital_social: safeNum(empresa?.capital_social),
    faturamento_anual: safeNum(empresa?.faturamento_anual),
    limite_atual: safeNum(empresa?.limite_atual),
    regime_tributario: empresa?.regime_tributario ?? null,
    porte: empresa?.porte ?? null,
    data_abertura: empresa?.data_abertura ?? null,
    segmento: empresa?.segmento ?? null,
    score_interno: safeNum(empresa?.score_interno),
    score_serasa: safeNum(empresa?.score_serasa),
    score_spc: safeNum(empresa?.score_spc),
    responsavel_nome: empresa?.responsavel_nome ?? null,
    responsavel_cpf: empresa?.responsavel_cpf ?? null,
    email: empresa?.email ?? null,
    telefone: empresa?.telefone ?? null,
  };

  return {
    empresa: empresaNorm,
    resumoExecutivo: resumo,
    perfilCredito,
    capacidadeCredito: capacidade,
    documentacao,
    pendencias,
    riscos,
    pontosFortes,
    simulacoes: simulacoes.map(s => ({
      id: safeStr(s?.id, ""),
      produto: safeStr(s?.produto, "Produto não informado"),
      valor_solicitado: safeNum(s?.valor_solicitado),
      prazo_meses: safeNum(s?.prazo_meses),
      status: safeStr(s?.status, "pendente"),
    })),
    orcamentos: orcamentos.map(o => ({
      id: safeStr(o?.id, ""),
      descricao: safeStr(o?.descricao || o?.titulo, "Orçamento"),
      valor_total: safeNum(o?.valor_total),
      status: safeStr(o?.status, "pendente"),
    })),
    contratos: contratos.map(c => ({
      id: safeStr(c?.id, ""),
      numero: safeStr(c?.numero_contrato, `Contrato ${String(c?.id || "").slice(0, 8)}`),
      tipo: safeStr(c?.tipo_contrato, "Não informado"),
      valor: safeNum(c?.valor_contrato),
      status: safeStr(c?.status, "pendente"),
      data_assinatura: c?.data_assinatura ?? null,
    })),
    propostaPreliminar: proposta,
    parecerTecnico: parecer,
    proximosPassos,
    score_destrava: scoreDestrava,
    status_proposta: statusProposta,
    gerado_em: new Date().toISOString(),
    fonte: "deterministica",
  };
}

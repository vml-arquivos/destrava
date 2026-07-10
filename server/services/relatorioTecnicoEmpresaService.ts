/**
 * relatorioTecnicoEmpresaService.ts
 *
 * Serviço de consolidação para o Relatório Técnico Premium da Empresa.
 * Integra dados da Inteligência 360 e da Proposta Bancária Inteligente.
 *
 * REGRA: ZERO REGRESSÃO — apenas leitura, sem alterar dados existentes.
 * Campos ausentes retornam "Não informado". Nunca quebra com dados incompletos.
 */

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

function fmtDate(v: unknown): string {
  if (!v) return "Não informado";
  try { return new Date(String(v)).toLocaleDateString("pt-BR"); } catch { return String(v); }
}

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export interface IdentificacaoEmpresa {
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  situacao_cadastral: string;
  data_abertura: string;
  natureza_juridica: string;
  porte: string;
  regime_tributario: string;
  cnae_principal: string;
  cnae_descricao: string;
  segmento: string;
  capital_social: string;
  numero_funcionarios: string;
  site: string;
}

export interface ContatoEmpresa {
  responsavel_nome: string;
  responsavel_cpf: string;
  email: string;
  telefone: string;
  whatsapp: string;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
}

export interface SocioRelatorio {
  nome: string;
  cpf: string;
  percentual: string;
  qualificacao: string;
  representante_legal: boolean;
  tem_cpf: boolean;
}

export interface DocumentoRelatorio {
  tipo: string;
  nome_arquivo: string;
  tem_arquivo: boolean;
  status: string;
  data_upload: string;
  validado: boolean;
}

export interface AnaliseCredito {
  score_destrava: number;
  score_interno: string;
  score_serasa: string;
  score_spc: string;
  nivel_risco: string;
  classificacao: string;
  faturamento: string;
  capital_social: string;
  limite_atual: string;
  capacidade_estimada_min: string;
  capacidade_estimada_max: string;
  produto_sugerido: string;
  prazo_sugerido: string;
  valor_sugerido: string;
  parecer: string;
  status_proposta: string;
}

export interface AnaliseDocumental {
  total: number;
  com_arquivo: number;
  sem_arquivo: number;
  validados: number;
  pendentes: number;
  percentual_cobertura: number;
  status: string;
  documentos_ausentes: string[];
}

export interface AnaliseCadastral {
  situacao: string;
  cnpj_valido: boolean;
  tem_socios: boolean;
  socios_com_cpf: number;
  socios_sem_cpf: number;
  tem_responsavel: boolean;
  tem_contato: boolean;
  tem_endereco: boolean;
  status: "completo" | "basico" | "incompleto" | "critico";
  observacoes: string[];
}

export interface AnaliseFaturamento {
  faturamento_anual: string;
  capital_social: string;
  limite_atual: string;
  regime_tributario: string;
  numero_funcionarios: string;
  porte: string;
  tem_faturamento: boolean;
  tem_capital: boolean;
  observacoes: string[];
}

export interface PendenciaRelatorio {
  tipo: string;
  descricao: string;
  impacto: string;
  acao_requerida: string;
  prioridade: "critica" | "alta" | "media" | "baixa";
}

export interface PlanoAcao {
  numero: number;
  acao: string;
  modulo: string;
  prazo: string;
  responsavel: string;
}

export interface RecomendacaoRelatorio {
  titulo: string;
  descricao: string;
  prioridade: "alta" | "media" | "baixa";
  modulo: string;
}

export interface RelatorioTecnicoResult {
  // Metadados
  empresa_id: string;
  gerado_em: string;
  responsavel_analise: string;
  versao: string;
  fonte: "deterministica";

  // Seções do relatório
  identificacao: IdentificacaoEmpresa;
  contato: ContatoEmpresa;
  socios: SocioRelatorio[];
  documentos: DocumentoRelatorio[];
  analise_credito: AnaliseCredito;
  analise_documental: AnaliseDocumental;
  analise_cadastral: AnaliseCadastral;
  analise_faturamento: AnaliseFaturamento;
  pendencias: PendenciaRelatorio[];
  plano_acao: PlanoAcao[];
  recomendacoes: RecomendacaoRelatorio[];

  // Resumo executivo e observações legais
  resumo_executivo: string;
  observacoes_legais: string;

  // Dados de simulações e contratos para contexto
  simulacoes: Array<{
    produto: string;
    valor: string;
    prazo: string;
    status: string;
  }>;
  contratos: Array<{
    numero: string;
    tipo: string;
    valor: string;
    status: string;
    data_assinatura: string;
  }>;
}

// ─── Input do serviço ─────────────────────────────────────────────────────────

export interface RelatorioTecnicoInput {
  empresa: any;
  socios: any[];
  documentos: any[];
  simulacoes: any[];
  orcamentos: any[];
  contratos: any[];
  historico: any[];
  responsavel_nome?: string;
}

// ─── Funções auxiliares ───────────────────────────────────────────────────────

function calcularScoreDestrava(empresa: any, socios: any[], documentos: any[], simulacoes: any[]): number {
  let score = 0;
  if (empresa?.cnpj) score += 10;
  if (empresa?.razao_social) score += 5;
  if (safeStr(empresa?.situacao_cadastral).toLowerCase().includes("ativa")) score += 10;
  if (empresa?.cnae_principal) score += 5;
  const fat = safeNum(empresa?.faturamento_anual);
  if (fat && fat > 0) score += 15;
  const cap = safeNum(empresa?.capital_social);
  if (cap && cap > 0) score += 10;
  const docs = safeArr<any>(documentos);
  const comArquivo = docs.filter(d => d?.arquivo_path || d?.url || d?.file_path).length;
  if (comArquivo >= 5) score += 25;
  else if (comArquivo >= 3) score += 15;
  else if (comArquivo >= 1) score += 8;
  const sociosArr = safeArr<any>(socios);
  const comCpf = sociosArr.filter(s => String(s?.cpf_cnpj || "").replace(/\D/g, "").length >= 11).length;
  if (comCpf > 0) score += 10;
  if (safeArr<any>(simulacoes).length > 0) score += 10;
  return Math.min(100, score);
}

function calcularNivelRisco(empresa: any, socios: any[], documentos: any[]): string {
  const docs = safeArr<any>(documentos);
  const sociosArr = safeArr<any>(socios);
  const ativa = safeStr(empresa?.situacao_cadastral).toLowerCase().includes("ativa");
  const temCnpj = !!empresa?.cnpj;
  const temFat = safeNum(empresa?.faturamento_anual) !== null;
  const temDocs = docs.filter(d => d?.arquivo_path || d?.url || d?.file_path).length >= 3;
  const temSociosCpf = sociosArr.some(s => String(s?.cpf_cnpj || "").replace(/\D/g, "").length >= 11);
  const criticos = [!temCnpj, !ativa].filter(Boolean).length;
  const altos = [!temFat, !temDocs, !temSociosCpf].filter(Boolean).length;
  if (criticos >= 1) return "critico";
  if (altos >= 2) return "alto";
  if (altos === 1) return "medio";
  return "baixo";
}

function gerarAnaliseCadastral(empresa: any, socios: any[]): AnaliseCadastral {
  const sociosArr = safeArr<any>(socios);
  const comCpf = sociosArr.filter(s => String(s?.cpf_cnpj || "").replace(/\D/g, "").length >= 11).length;
  const semCpf = sociosArr.length - comCpf;
  const obs: string[] = [];
  const ativa = safeStr(empresa?.situacao_cadastral).toLowerCase().includes("ativa");
  if (!empresa?.cnpj) obs.push("CNPJ não informado — necessário para análise completa.");
  if (!ativa) obs.push(`Situação cadastral: ${safeStr(empresa?.situacao_cadastral)} — verificar regularidade na Receita Federal.`);
  if (sociosArr.length === 0) obs.push("Nenhum sócio cadastrado no QSA.");
  if (semCpf > 0) obs.push(`${semCpf} sócio(s) sem CPF cadastrado.`);
  if (!empresa?.email && !empresa?.telefone) obs.push("Dados de contato incompletos.");

  let status: AnaliseCadastral["status"] = "completo";
  if (!empresa?.cnpj || !ativa) status = "critico";
  else if (sociosArr.length === 0 || semCpf > 0) status = "incompleto";
  else if (!empresa?.email && !empresa?.telefone) status = "basico";

  return {
    situacao: safeStr(empresa?.situacao_cadastral),
    cnpj_valido: !!empresa?.cnpj,
    tem_socios: sociosArr.length > 0,
    socios_com_cpf: comCpf,
    socios_sem_cpf: semCpf,
    tem_responsavel: !!(empresa?.responsavel_nome || empresa?.responsavel_cpf),
    tem_contato: !!(empresa?.email || empresa?.telefone || empresa?.whatsapp),
    tem_endereco: !!(empresa?.cidade || empresa?.estado || empresa?.endereco),
    status,
    observacoes: obs,
  };
}

function gerarAnaliseDocumental(documentos: any[]): AnaliseDocumental {
  const docs = safeArr<any>(documentos);
  const comArquivo = docs.filter(d => d?.arquivo_path || d?.url || d?.file_path).length;
  const semArquivo = docs.length - comArquivo;
  const validados = docs.filter(d => d?.status === "validado" || d?.status === "aprovado").length;
  const pendentes = docs.length - validados;
  const pct = docs.length > 0 ? Math.round((comArquivo / docs.length) * 100) : 0;
  const ausentes = docs.filter(d => !(d?.arquivo_path || d?.url || d?.file_path)).map(d => safeStr(d?.tipo || d?.nome_arquivo, "Documento"));
  let status = "critico";
  if (pct >= 80) status = "completo";
  else if (pct >= 50) status = "parcial";
  else if (pct >= 20) status = "insuficiente";
  return { total: docs.length, com_arquivo: comArquivo, sem_arquivo: semArquivo, validados, pendentes, percentual_cobertura: pct, status, documentos_ausentes: ausentes };
}

function gerarAnaliseFaturamento(empresa: any): AnaliseFaturamento {
  const fat = safeNum(empresa?.faturamento_anual);
  const cap = safeNum(empresa?.capital_social);
  const obs: string[] = [];
  if (!fat) obs.push("Faturamento anual não informado — necessário para cálculo de capacidade de crédito.");
  if (!cap) obs.push("Capital social não sincronizado — recomenda-se sincronizar dados da Receita Federal.");
  return {
    faturamento_anual: fmtBRL(fat),
    capital_social: fmtBRL(cap),
    limite_atual: fmtBRL(safeNum(empresa?.limite_atual)),
    regime_tributario: safeStr(empresa?.regime_tributario),
    numero_funcionarios: empresa?.numero_funcionarios != null ? String(empresa.numero_funcionarios) : "Não informado",
    porte: empresa?.porte ? String(empresa.porte).toUpperCase() : "Não informado",
    tem_faturamento: fat !== null && fat > 0,
    tem_capital: cap !== null && cap > 0,
    observacoes: obs,
  };
}

function gerarPendencias(empresa: any, socios: any[], documentos: any[]): PendenciaRelatorio[] {
  const pendencias: PendenciaRelatorio[] = [];
  const docs = safeArr<any>(documentos);
  const sociosArr = safeArr<any>(socios);

  if (!empresa?.cnpj) {
    pendencias.push({ tipo: "cadastral", descricao: "CNPJ não informado", impacto: "Bloqueia análise completa", acao_requerida: "Informar CNPJ válido no cadastro", prioridade: "critica" });
  }
  const situacao = safeStr(empresa?.situacao_cadastral).toLowerCase();
  if (situacao && !situacao.includes("ativa") && situacao !== "não informado") {
    pendencias.push({ tipo: "cadastral", descricao: `Situação cadastral irregular: ${safeStr(empresa?.situacao_cadastral)}`, impacto: "Bloqueia proposta bancária", acao_requerida: "Regularizar na Receita Federal", prioridade: "critica" });
  }
  if (!safeNum(empresa?.faturamento_anual)) {
    pendencias.push({ tipo: "financeiro", descricao: "Faturamento anual não informado", impacto: "Reduz limite estimado de crédito", acao_requerida: "Informar faturamento anual comprovado", prioridade: "alta" });
  }
  if (!safeNum(empresa?.capital_social)) {
    pendencias.push({ tipo: "financeiro", descricao: "Capital social não sincronizado", impacto: "Reduz base de cálculo de crédito", acao_requerida: "Sincronizar dados da Receita Federal", prioridade: "media" });
  }
  if (sociosArr.length === 0) {
    pendencias.push({ tipo: "societário", descricao: "Nenhum sócio cadastrado no QSA", impacto: "Bloqueia análise societária", acao_requerida: "Cadastrar sócios no módulo QSA", prioridade: "critica" });
  } else {
    const semCpf = sociosArr.filter(s => String(s?.cpf_cnpj || "").replace(/\D/g, "").length < 11);
    if (semCpf.length > 0) {
      pendencias.push({ tipo: "societário", descricao: `${semCpf.length} sócio(s) sem CPF cadastrado`, impacto: "Impede análise de crédito individual", acao_requerida: "Cadastrar CPF de todos os sócios", prioridade: "alta" });
    }
  }
  if (docs.length === 0) {
    pendencias.push({ tipo: "documental", descricao: "Nenhum documento no acervo", impacto: "Bloqueia análise documental completa", acao_requerida: "Enviar documentação básica: Cartão CNPJ, Contrato Social e extrato", prioridade: "critica" });
  } else {
    const semArquivo = docs.filter(d => !(d?.arquivo_path || d?.url || d?.file_path));
    if (semArquivo.length > 0) {
      pendencias.push({ tipo: "documental", descricao: `${semArquivo.length} documento(s) sem arquivo físico`, impacto: "Reduz cobertura documental", acao_requerida: "Fazer upload dos documentos no Acervo Documental", prioridade: "alta" });
    }
  }
  if (!empresa?.email && !empresa?.telefone && !empresa?.whatsapp) {
    pendencias.push({ tipo: "cadastral", descricao: "Dados de contato não informados", impacto: "Dificulta comunicação com a empresa", acao_requerida: "Informar e-mail, telefone ou WhatsApp", prioridade: "baixa" });
  }
  return pendencias;
}

function gerarPlanoAcao(pendencias: PendenciaRelatorio[], empresa: any): PlanoAcao[] {
  const plano: PlanoAcao[] = [];
  let num = 1;

  const criticas = pendencias.filter(p => p.prioridade === "critica");
  const altas = pendencias.filter(p => p.prioridade === "alta");
  const medias = pendencias.filter(p => p.prioridade === "media");

  for (const p of criticas) {
    plano.push({ numero: num++, acao: p.acao_requerida, modulo: p.tipo === "documental" ? "Acervo Documental" : p.tipo === "societário" ? "QSA / Sócios" : "Cadastro da Empresa", prazo: "Imediato", responsavel: "Colaborador responsável" });
  }
  for (const p of altas) {
    plano.push({ numero: num++, acao: p.acao_requerida, modulo: p.tipo === "documental" ? "Acervo Documental" : p.tipo === "financeiro" ? "Dados Financeiros" : "Cadastro da Empresa", prazo: "Até 5 dias úteis", responsavel: "Colaborador responsável" });
  }
  for (const p of medias) {
    plano.push({ numero: num++, acao: p.acao_requerida, modulo: "Cadastro da Empresa", prazo: "Até 15 dias úteis", responsavel: "Colaborador responsável" });
  }

  plano.push({ numero: num++, acao: "Revisar e validar todos os documentos no Acervo Documental", modulo: "Acervo Documental", prazo: "Após resolução das pendências críticas", responsavel: "Colaborador responsável" });
  plano.push({ numero: num++, acao: "Submeter proposta bancária ao parceiro financeiro após regularização", modulo: "Proposta Bancária", prazo: "Após resolução de todas as pendências", responsavel: "Gestor de crédito" });

  return plano;
}

function gerarRecomendacoes(empresa: any, socios: any[], documentos: any[], simulacoes: any[]): RecomendacaoRelatorio[] {
  const recs: RecomendacaoRelatorio[] = [];
  const docs = safeArr<any>(documentos);
  const comArquivo = docs.filter(d => d?.arquivo_path || d?.url || d?.file_path).length;

  if (comArquivo < 3) {
    recs.push({ titulo: "Completar acervo documental", descricao: "Enviar pelo menos 3 documentos com arquivo físico para viabilizar análise bancária.", prioridade: "alta", modulo: "Acervo Documental" });
  }
  if (!safeNum(empresa?.faturamento_anual)) {
    recs.push({ titulo: "Informar faturamento anual", descricao: "O faturamento anual é essencial para calcular a capacidade de crédito da empresa.", prioridade: "alta", modulo: "Cadastro da Empresa" });
  }
  if (safeArr<any>(simulacoes).length === 0) {
    recs.push({ titulo: "Criar simulação de crédito", descricao: "Realizar ao menos uma simulação para definir o produto e valor desejado.", prioridade: "media", modulo: "Simulações" });
  }
  if (safeArr<any>(socios).length > 0) {
    const semCpf = safeArr<any>(socios).filter(s => String(s?.cpf_cnpj || "").replace(/\D/g, "").length < 11);
    if (semCpf.length > 0) {
      recs.push({ titulo: "Cadastrar CPF dos sócios", descricao: `${semCpf.length} sócio(s) sem CPF. Necessário para análise individual de crédito.`, prioridade: "alta", modulo: "QSA / Sócios" });
    }
  }
  const fat = safeNum(empresa?.faturamento_anual);
  if (fat && fat > 0) {
    recs.push({ titulo: "Gerar proposta bancária", descricao: "Com faturamento informado, é possível gerar uma proposta preliminar de crédito para análise.", prioridade: "media", modulo: "Proposta Bancária" });
  }
  if (recs.length === 0) {
    recs.push({ titulo: "Manter dados atualizados", descricao: "Empresa com boa cobertura de dados. Manter documentação e informações cadastrais atualizadas.", prioridade: "baixa", modulo: "Cadastro da Empresa" });
  }
  return recs;
}

function gerarResumoExecutivo(empresa: any, score: number, pendencias: PendenciaRelatorio[], analiseCredito: AnaliseCredito): string {
  const razao = safeStr(empresa?.razao_social);
  const cnpj = safeStr(empresa?.cnpj, "CNPJ não informado");
  const criticas = pendencias.filter(p => p.prioridade === "critica");
  const fat = safeNum(empresa?.faturamento_anual);

  let resumo = `A empresa ${razao} (${cnpj}) foi analisada pelo sistema Destrava Crédito com base nos dados disponíveis na plataforma. `;
  resumo += `Score Destrava: ${score}/100. `;
  resumo += `Nível de risco: ${analiseCredito.nivel_risco}. `;

  if (criticas.length > 0) {
    resumo += `Foram identificadas ${criticas.length} pendência(s) crítica(s) que requerem atenção imediata antes de qualquer análise bancária. `;
  } else {
    resumo += `Não foram identificadas pendências críticas bloqueantes. `;
  }

  if (fat && fat > 0) {
    resumo += `Faturamento anual informado: ${fmtBRL(fat)}. `;
    if (analiseCredito.valor_sugerido !== "Não informado") {
      resumo += `Capacidade estimada de crédito: ${analiseCredito.valor_sugerido}. `;
    }
  } else {
    resumo += `Faturamento anual não informado — necessário para estimativa de capacidade de crédito. `;
  }

  resumo += `Este relatório é de caráter técnico e consultivo, destinado a apoiar a análise interna da Destrava e o relacionamento com parceiros financeiros. Proposta sujeita à análise bancária e critérios da instituição financeira parceira.`;

  return resumo;
}

// ─── Função principal exportada ───────────────────────────────────────────────

export function gerarRelatorioTecnico(input: RelatorioTecnicoInput): RelatorioTecnicoResult {
  const empresa = input?.empresa ?? {};
  const socios = safeArr<any>(input?.socios);
  const documentos = safeArr<any>(input?.documentos);
  const simulacoes = safeArr<any>(input?.simulacoes);
  const orcamentos = safeArr<any>(input?.orcamentos);
  const contratos = safeArr<any>(input?.contratos);
  const historico = safeArr<any>(input?.historico);
  const responsavel = safeStr(input?.responsavel_nome, "Sistema Destrava Crédito");

  // Cálculos
  const score = calcularScoreDestrava(empresa, socios, documentos, simulacoes);
  const nivelRisco = calcularNivelRisco(empresa, socios, documentos);
  const analiseCadastral = gerarAnaliseCadastral(empresa, socios);
  const analiseDocumental = gerarAnaliseDocumental(documentos);
  const analiseFaturamento = gerarAnaliseFaturamento(empresa);
  const pendencias = gerarPendencias(empresa, socios, documentos);
  const planoAcao = gerarPlanoAcao(pendencias, empresa);
  const recomendacoes = gerarRecomendacoes(empresa, socios, documentos, simulacoes);

  // Capacidade de crédito
  const fat = safeNum(empresa?.faturamento_anual);
  const cap = safeNum(empresa?.capital_social);
  let limiteMin: number | null = null;
  let limiteMax: number | null = null;
  if (fat && fat > 0) { limiteMin = Math.round(fat * 0.10); limiteMax = Math.round(fat * 0.30); }
  else if (cap && cap > 0) { limiteMin = Math.round(cap * 0.20); limiteMax = Math.round(cap * 0.50); }

  // Produto sugerido
  const cnae = safeStr(empresa?.cnae_principal, "").toLowerCase();
  let produtoSugerido = "Capital de Giro";
  if (cnae.includes("construção") || cnae.includes("imobiliária")) produtoSugerido = "Crédito para Construção / Reforma";
  else if (cnae.includes("serviço") || cnae.includes("consultoria")) produtoSugerido = "Antecipação de Recebíveis";
  else if (simulacoes.length > 0 && simulacoes[0]?.produto) produtoSugerido = simulacoes[0].produto;

  const prazoSugerido = simulacoes.length > 0 && simulacoes[0]?.prazo_meses ? `${simulacoes[0].prazo_meses} meses` : "36 meses (padrão)";
  const valorSugerido = limiteMin && limiteMax ? fmtBRL(Math.round((limiteMin + limiteMax) / 2)) : simulacoes.length > 0 ? fmtBRL(safeNum(simulacoes[0]?.valor_solicitado)) : "Não informado";

  const bloqueantes = pendencias.filter(p => p.prioridade === "critica");
  let statusProposta = "Apto para análise preliminar";
  if (bloqueantes.length >= 3) statusProposta = "Inapto — regularização necessária";
  else if (bloqueantes.length > 0) statusProposta = "Necessita complementação documental";
  else if (!fat && !cap) statusProposta = "Dados insuficientes para estimativa";

  const analiseCredito: AnaliseCredito = {
    score_destrava: score,
    score_interno: empresa?.score_interno != null ? String(empresa.score_interno) : "Não informado",
    score_serasa: empresa?.score_serasa != null ? String(empresa.score_serasa) : "Não informado",
    score_spc: empresa?.score_spc != null ? String(empresa.score_spc) : "Não informado",
    nivel_risco: nivelRisco,
    classificacao: nivelRisco === "baixo" ? "Perfil favorável para análise" : nivelRisco === "medio" ? "Perfil com pontos de atenção" : nivelRisco === "alto" ? "Perfil com riscos relevantes" : "Perfil crítico — necessita regularização",
    faturamento: fmtBRL(fat),
    capital_social: fmtBRL(cap),
    limite_atual: fmtBRL(safeNum(empresa?.limite_atual)),
    capacidade_estimada_min: fmtBRL(limiteMin),
    capacidade_estimada_max: fmtBRL(limiteMax),
    produto_sugerido: produtoSugerido,
    prazo_sugerido: prazoSugerido,
    valor_sugerido: valorSugerido,
    parecer: `Empresa ${safeStr(empresa?.razao_social)} apresenta-se ${statusProposta.toLowerCase()}. Score Destrava: ${score}/100. Proposta sujeita à análise bancária e critérios da instituição financeira parceira.`,
    status_proposta: statusProposta,
  };

  const resumoExecutivo = gerarResumoExecutivo(empresa, score, pendencias, analiseCredito);

  // Sócios normalizados
  const sociosNorm: SocioRelatorio[] = socios.map(s => {
    const cpf = String(s?.cpf_cnpj || "").replace(/\D/g, "");
    return {
      nome: safeStr(s?.nome),
      cpf: safeStr(s?.cpf_cnpj),
      percentual: s?.percentual_capital != null ? `${s.percentual_capital}%` : "Não informado",
      qualificacao: safeStr(s?.qualificacao_socio),
      representante_legal: !!s?.representante_legal,
      tem_cpf: cpf.length >= 11,
    };
  });

  // Documentos normalizados
  const docsNorm: DocumentoRelatorio[] = documentos.map(d => ({
    tipo: safeStr(d?.tipo || d?.nome_arquivo, "Documento"),
    nome_arquivo: safeStr(d?.nome_arquivo),
    tem_arquivo: !!(d?.arquivo_path || d?.url || d?.file_path),
    status: safeStr(d?.status, "ativo"),
    data_upload: fmtDate(d?.created_at || d?.updated_at),
    validado: d?.status === "validado" || d?.status === "aprovado",
  }));

  // Identificação
  const identificacao: IdentificacaoEmpresa = {
    razao_social: safeStr(empresa?.razao_social),
    nome_fantasia: safeStr(empresa?.nome_fantasia),
    cnpj: safeStr(empresa?.cnpj),
    situacao_cadastral: safeStr(empresa?.situacao_cadastral),
    data_abertura: fmtDate(empresa?.data_abertura),
    natureza_juridica: safeStr(empresa?.natureza_juridica),
    porte: empresa?.porte ? String(empresa.porte).toUpperCase() : "Não informado",
    regime_tributario: safeStr(empresa?.regime_tributario),
    cnae_principal: safeStr(empresa?.cnae_principal),
    cnae_descricao: safeStr(empresa?.cnae_descricao || empresa?.cnae_principal),
    segmento: safeStr(empresa?.segmento),
    capital_social: fmtBRL(safeNum(empresa?.capital_social)),
    numero_funcionarios: empresa?.numero_funcionarios != null ? String(empresa.numero_funcionarios) : "Não informado",
    site: safeStr(empresa?.site),
  };

  // Contato
  const contato: ContatoEmpresa = {
    responsavel_nome: safeStr(empresa?.responsavel_nome),
    responsavel_cpf: safeStr(empresa?.responsavel_cpf),
    email: safeStr(empresa?.email),
    telefone: safeStr(empresa?.telefone),
    whatsapp: safeStr(empresa?.whatsapp),
    endereco: safeStr(empresa?.endereco),
    cidade: safeStr(empresa?.cidade),
    estado: safeStr(empresa?.estado),
    cep: safeStr(empresa?.cep),
  };

  return {
    empresa_id: safeStr(empresa?.id, ""),
    gerado_em: new Date().toISOString(),
    responsavel_analise: responsavel,
    versao: "1.0",
    fonte: "deterministica",
    identificacao,
    contato,
    socios: sociosNorm,
    documentos: docsNorm,
    analise_credito: analiseCredito,
    analise_documental: analiseDocumental,
    analise_cadastral: analiseCadastral,
    analise_faturamento: analiseFaturamento,
    pendencias,
    plano_acao: planoAcao,
    recomendacoes,
    resumo_executivo: resumoExecutivo,
    observacoes_legais: "Este relatório tem caráter técnico e consultivo. As análises e estimativas apresentadas são baseadas nos dados disponíveis na plataforma Destrava Crédito e não constituem garantia de aprovação de crédito, assessoria jurídica, contábil ou financeira formal. Proposta sujeita à análise bancária e critérios da instituição financeira parceira. Destrava Crédito não se responsabiliza por decisões tomadas com base exclusiva neste relatório.",
    simulacoes: simulacoes.slice(0, 5).map(s => ({
      produto: safeStr(s?.produto, "Produto não informado"),
      valor: fmtBRL(safeNum(s?.valor_solicitado)),
      prazo: s?.prazo_meses ? `${s.prazo_meses} meses` : "Não informado",
      status: safeStr(s?.status, "pendente"),
    })),
    contratos: contratos.slice(0, 5).map(c => ({
      numero: safeStr(c?.numero_contrato, `CT-${String(c?.id || "").slice(0, 8)}`),
      tipo: safeStr(c?.tipo_contrato),
      valor: fmtBRL(safeNum(c?.valor_contrato)),
      status: safeStr(c?.status),
      data_assinatura: fmtDate(c?.data_assinatura),
    })),
  };
}

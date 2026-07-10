/**
 * pendenciasEmpresaService.ts
 *
 * Motor central de pendências e plano de ação por empresa.
 * Identifica automaticamente o que impede ou dificulta:
 * contrato, análise de crédito, proposta bancária, faturamento,
 * documentação, análise societária e relacionamento comercial.
 *
 * REGRA: ZERO REGRESSÃO — apenas leitura, sem alterar dados.
 * Calculado em tempo real, sem persistência nesta sprint.
 */

// ─── Utilitários ──────────────────────────────────────────────────────────────

function safeArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function safeStr(v: unknown, fallback = ""): string {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v).trim() || fallback;
}

function safeNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export type CategoriaPendencia =
  | "cadastral"
  | "societaria"
  | "documental"
  | "credito"
  | "contrato"
  | "faturamento"
  | "comercial"
  | "operacional";

export type PrioridadePendencia = "alta" | "media" | "baixa";

export type ModuloPendencia =
  | "cadastro_empresa"
  | "socios_qsa"
  | "acervo_documental"
  | "simulacoes"
  | "contratos"
  | "orcamentos"
  | "followup"
  | "inteligencia_360"
  | "proposta_bancaria"
  | "relatorio_tecnico";

export interface Pendencia {
  id: string;
  categoria: CategoriaPendencia;
  prioridade: PrioridadePendencia;
  titulo: string;
  descricao: string;
  impacto: string;
  acaoRecomendada: string;
  modulo: ModuloPendencia;
  resolvida: boolean;
}

export interface GrupoPendencias {
  categoria: CategoriaPendencia;
  label: string;
  total: number;
  altas: number;
  medias: number;
  baixas: number;
  pendencias: Pendencia[];
}

export interface PlanoAcaoItem {
  numero: number;
  pendencia_id: string;
  titulo: string;
  acao: string;
  modulo: ModuloPendencia;
  prioridade: PrioridadePendencia;
  prazo: string;
}

export interface MotorPendenciasResult {
  empresa_id: string;
  calculado_em: string;
  total: number;
  altas: number;
  medias: number;
  baixas: number;
  resolvidas: number;
  score_completude: number;
  status_geral: "critico" | "atencao" | "bom" | "excelente";
  grupos: GrupoPendencias[];
  plano_acao: PlanoAcaoItem[];
  resumo: string;
}

export interface MotorPendenciasInput {
  empresa: any;
  socios: any[];
  documentos: any[];
  simulacoes: any[];
  orcamentos: any[];
  contratos: any[];
  historico: any[];
  followups: any[];
}

// ─── Rótulos das categorias ───────────────────────────────────────────────────

const CATEGORIA_LABELS: Record<CategoriaPendencia, string> = {
  cadastral:    "Cadastral",
  societaria:   "Societária",
  documental:   "Documental",
  credito:      "Crédito",
  contrato:     "Contrato",
  faturamento:  "Faturamento",
  comercial:    "Comercial",
  operacional:  "Operacional",
};

// ─── Gerador de ID determinístico ─────────────────────────────────────────────

function pid(categoria: string, slug: string): string {
  return `${categoria}-${slug}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

// ─── Regras de pendências ─────────────────────────────────────────────────────

function regrasCadastrais(empresa: any): Pendencia[] {
  const pends: Pendencia[] = [];

  if (!safeStr(empresa?.cnpj)) {
    pends.push({
      id: pid("cadastral", "cnpj-ausente"),
      categoria: "cadastral",
      prioridade: "alta",
      titulo: "CNPJ não informado",
      descricao: "O CNPJ da empresa não está cadastrado na plataforma.",
      impacto: "Bloqueia análise bancária, geração de contratos e relatórios oficiais.",
      acaoRecomendada: "Informar o CNPJ válido no cadastro da empresa.",
      modulo: "cadastro_empresa",
      resolvida: false,
    });
  }

  const situacao = safeStr(empresa?.situacao_cadastral).toLowerCase();
  if (situacao && !situacao.includes("ativa") && situacao !== "") {
    pends.push({
      id: pid("cadastral", "situacao-irregular"),
      categoria: "cadastral",
      prioridade: "alta",
      titulo: "Situação cadastral irregular",
      descricao: `Situação na Receita Federal: "${safeStr(empresa?.situacao_cadastral, "não informada")}". Empresa não está ativa.`,
      impacto: "Bloqueia proposta bancária e análise de crédito completa.",
      acaoRecomendada: "Regularizar a situação cadastral junto à Receita Federal.",
      modulo: "cadastro_empresa",
      resolvida: false,
    });
  }

  if (!safeStr(empresa?.email) && !safeStr(empresa?.telefone) && !safeStr(empresa?.whatsapp)) {
    pends.push({
      id: pid("cadastral", "contato-ausente"),
      categoria: "cadastral",
      prioridade: "media",
      titulo: "Dados de contato não informados",
      descricao: "Nenhum canal de contato (e-mail, telefone ou WhatsApp) está cadastrado.",
      impacto: "Dificulta comunicação e envio de documentos ao cliente.",
      acaoRecomendada: "Informar ao menos um canal de contato no cadastro da empresa.",
      modulo: "cadastro_empresa",
      resolvida: false,
    });
  } else if (!safeStr(empresa?.email)) {
    pends.push({
      id: pid("cadastral", "email-ausente"),
      categoria: "cadastral",
      prioridade: "baixa",
      titulo: "E-mail não informado",
      descricao: "O e-mail da empresa não está cadastrado.",
      impacto: "Impede envio de relatórios e propostas por e-mail.",
      acaoRecomendada: "Informar o e-mail da empresa no cadastro.",
      modulo: "cadastro_empresa",
      resolvida: false,
    });
  }

  if (!safeStr(empresa?.cidade) && !safeStr(empresa?.estado)) {
    pends.push({
      id: pid("cadastral", "endereco-ausente"),
      categoria: "cadastral",
      prioridade: "baixa",
      titulo: "Endereço não informado",
      descricao: "Cidade e estado da empresa não estão cadastrados.",
      impacto: "Pode impactar análise de risco regional e geração de contratos.",
      acaoRecomendada: "Completar o endereço da empresa no cadastro.",
      modulo: "cadastro_empresa",
      resolvida: false,
    });
  }

  if (!safeStr(empresa?.cnae_principal)) {
    pends.push({
      id: pid("cadastral", "cnae-ausente"),
      categoria: "cadastral",
      prioridade: "media",
      titulo: "CNAE principal não informado",
      descricao: "O código CNAE principal da empresa não está sincronizado.",
      impacto: "Impede análise de segmento e sugestão de produto de crédito adequado.",
      acaoRecomendada: "Sincronizar dados da Receita Federal para obter o CNAE.",
      modulo: "cadastro_empresa",
      resolvida: false,
    });
  }

  return pends;
}

function regrasSocietarias(socios: any[]): Pendencia[] {
  const pends: Pendencia[] = [];
  const arr = safeArr<any>(socios);

  if (arr.length === 0) {
    pends.push({
      id: pid("societaria", "sem-socios"),
      categoria: "societaria",
      prioridade: "alta",
      titulo: "Nenhum sócio cadastrado no QSA",
      descricao: "O quadro societário da empresa está vazio na plataforma.",
      impacto: "Bloqueia análise societária e individual de crédito dos sócios.",
      acaoRecomendada: "Cadastrar os sócios no módulo QSA da empresa.",
      modulo: "socios_qsa",
      resolvida: false,
    });
    return pends;
  }

  const semCpf = arr.filter(s => String(s?.cpf_cnpj || "").replace(/\D/g, "").length < 11);
  if (semCpf.length > 0) {
    pends.push({
      id: pid("societaria", "socios-sem-cpf"),
      categoria: "societaria",
      prioridade: "alta",
      titulo: `${semCpf.length} sócio(s) sem CPF cadastrado`,
      descricao: `Os seguintes sócios não possuem CPF: ${semCpf.map((s: any) => safeStr(s?.nome, "Sócio")).join(", ")}.`,
      impacto: "Impede análise individual de crédito e verificação de restrições.",
      acaoRecomendada: "Cadastrar o CPF de todos os sócios no módulo QSA.",
      modulo: "socios_qsa",
      resolvida: false,
    });
  }

  const semRepresentante = !arr.some(s => s?.representante_legal);
  if (semRepresentante) {
    pends.push({
      id: pid("societaria", "sem-representante-legal"),
      categoria: "societaria",
      prioridade: "media",
      titulo: "Representante legal não identificado",
      descricao: "Nenhum sócio está marcado como representante legal da empresa.",
      impacto: "Pode gerar dúvidas na assinatura de contratos e propostas.",
      acaoRecomendada: "Identificar o representante legal no módulo QSA.",
      modulo: "socios_qsa",
      resolvida: false,
    });
  }

  const semPercentual = arr.filter(s => safeNum(s?.percentual_capital) === null);
  if (semPercentual.length > 0) {
    pends.push({
      id: pid("societaria", "percentual-ausente"),
      categoria: "societaria",
      prioridade: "baixa",
      titulo: "Participação societária não informada",
      descricao: `${semPercentual.length} sócio(s) sem percentual de capital informado.`,
      impacto: "Dificulta análise de controle societário.",
      acaoRecomendada: "Informar o percentual de participação de cada sócio.",
      modulo: "socios_qsa",
      resolvida: false,
    });
  }

  return pends;
}

function regrasDocumentais(documentos: any[]): Pendencia[] {
  const pends: Pendencia[] = [];
  const docs = safeArr<any>(documentos);

  if (docs.length === 0) {
    pends.push({
      id: pid("documental", "acervo-vazio"),
      categoria: "documental",
      prioridade: "alta",
      titulo: "Acervo documental vazio",
      descricao: "Nenhum documento foi cadastrado no acervo da empresa.",
      impacto: "Bloqueia análise documental, proposta bancária e geração de relatório técnico.",
      acaoRecomendada: "Enviar os documentos básicos: Cartão CNPJ, Contrato Social e extrato bancário.",
      modulo: "acervo_documental",
      resolvida: false,
    });
    return pends;
  }

  const semArquivo = docs.filter(d => !(d?.arquivo_path || d?.url || d?.file_path));
  if (semArquivo.length > 0) {
    pends.push({
      id: pid("documental", "documentos-sem-arquivo"),
      categoria: "documental",
      prioridade: "alta",
      titulo: `${semArquivo.length} documento(s) sem arquivo físico`,
      descricao: `Documentos cadastrados mas sem arquivo enviado: ${semArquivo.slice(0, 3).map((d: any) => safeStr(d?.tipo || d?.nome_arquivo, "Documento")).join(", ")}${semArquivo.length > 3 ? ` e mais ${semArquivo.length - 3}` : ""}.`,
      impacto: "Reduz cobertura documental e pode bloquear análise bancária.",
      acaoRecomendada: "Fazer upload dos arquivos pendentes no Acervo Documental.",
      modulo: "acervo_documental",
      resolvida: false,
    });
  }

  const naoValidados = docs.filter(d => d?.status !== "validado" && d?.status !== "aprovado" && (d?.arquivo_path || d?.url || d?.file_path));
  if (naoValidados.length > 0) {
    pends.push({
      id: pid("documental", "documentos-nao-validados"),
      categoria: "documental",
      prioridade: "media",
      titulo: `${naoValidados.length} documento(s) aguardando validação`,
      descricao: "Documentos com arquivo enviado mas ainda não validados ou aprovados.",
      impacto: "Reduz confiabilidade da análise documental.",
      acaoRecomendada: "Revisar e validar os documentos no Acervo Documental.",
      modulo: "acervo_documental",
      resolvida: false,
    });
  }

  const pct = docs.length > 0 ? Math.round((docs.filter(d => d?.arquivo_path || d?.url || d?.file_path).length / docs.length) * 100) : 0;
  if (pct < 50 && docs.length > 0) {
    pends.push({
      id: pid("documental", "cobertura-baixa"),
      categoria: "documental",
      prioridade: "baixa",
      titulo: "Cobertura documental abaixo de 50%",
      descricao: `Apenas ${pct}% dos documentos cadastrados possuem arquivo físico.`,
      impacto: "Pode ser insuficiente para análise bancária completa.",
      acaoRecomendada: "Completar o envio de documentos para atingir ao menos 80% de cobertura.",
      modulo: "acervo_documental",
      resolvida: false,
    });
  }

  return pends;
}

function regrasCredito(empresa: any, simulacoes: any[]): Pendencia[] {
  const pends: Pendencia[] = [];
  const sims = safeArr<any>(simulacoes);

  if (!safeNum(empresa?.faturamento_anual)) {
    pends.push({
      id: pid("credito", "faturamento-ausente"),
      categoria: "credito",
      prioridade: "alta",
      titulo: "Faturamento anual não informado",
      descricao: "O faturamento anual da empresa não está cadastrado.",
      impacto: "Impede cálculo de capacidade de crédito e geração de proposta bancária.",
      acaoRecomendada: "Informar o faturamento anual comprovado no cadastro da empresa.",
      modulo: "cadastro_empresa",
      resolvida: false,
    });
  }

  if (!safeNum(empresa?.capital_social)) {
    pends.push({
      id: pid("credito", "capital-social-ausente"),
      categoria: "credito",
      prioridade: "media",
      titulo: "Capital social não sincronizado",
      descricao: "O capital social da empresa não está disponível na plataforma.",
      impacto: "Reduz a base de cálculo alternativa para estimativa de crédito.",
      acaoRecomendada: "Sincronizar dados da Receita Federal para obter o capital social.",
      modulo: "cadastro_empresa",
      resolvida: false,
    });
  }

  if (empresa?.score_interno == null && empresa?.score_serasa == null && empresa?.score_spc == null) {
    pends.push({
      id: pid("credito", "score-ausente"),
      categoria: "credito",
      prioridade: "media",
      titulo: "Score de crédito não informado",
      descricao: "Nenhum score de crédito (interno, Serasa ou SPC) está disponível.",
      impacto: "Dificulta análise de risco e estimativa de limite de crédito.",
      acaoRecomendada: "Realizar consulta de score e informar no cadastro da empresa.",
      modulo: "cadastro_empresa",
      resolvida: false,
    });
  }

  if (sims.length === 0) {
    pends.push({
      id: pid("credito", "sem-simulacao"),
      categoria: "credito",
      prioridade: "media",
      titulo: "Nenhuma simulação de crédito realizada",
      descricao: "A empresa não possui simulações de crédito cadastradas.",
      impacto: "Dificulta definição do produto, valor e prazo desejados.",
      acaoRecomendada: "Criar ao menos uma simulação de crédito no módulo de Simulações.",
      modulo: "simulacoes",
      resolvida: false,
    });
  }

  if (!safeNum(empresa?.limite_atual)) {
    pends.push({
      id: pid("credito", "limite-ausente"),
      categoria: "credito",
      prioridade: "baixa",
      titulo: "Limite de crédito atual não informado",
      descricao: "O limite de crédito atual da empresa não está registrado.",
      impacto: "Impede comparação entre limite atual e capacidade estimada.",
      acaoRecomendada: "Informar o limite de crédito atual no cadastro da empresa.",
      modulo: "cadastro_empresa",
      resolvida: false,
    });
  }

  return pends;
}

function regrasContrato(contratos: any[], empresa: any): Pendencia[] {
  const pends: Pendencia[] = [];
  const cts = safeArr<any>(contratos);

  if (cts.length === 0) {
    pends.push({
      id: pid("contrato", "sem-contratos"),
      categoria: "contrato",
      prioridade: "baixa",
      titulo: "Nenhum contrato gerado",
      descricao: "A empresa não possui contratos gerados na plataforma.",
      impacto: "Indica que a jornada de crédito ainda não foi concluída.",
      acaoRecomendada: "Após aprovação da proposta, gerar o contrato no módulo de Contratos.",
      modulo: "contratos",
      resolvida: false,
    });
    return pends;
  }

  const semAssinatura = cts.filter(c => !c?.data_assinatura && (c?.status === "ativo" || c?.status === "pendente"));
  if (semAssinatura.length > 0) {
    pends.push({
      id: pid("contrato", "contratos-sem-assinatura"),
      categoria: "contrato",
      prioridade: "alta",
      titulo: `${semAssinatura.length} contrato(s) sem data de assinatura`,
      descricao: "Contratos ativos ou pendentes sem data de assinatura registrada.",
      impacto: "Impede formalização do crédito e início da operação.",
      acaoRecomendada: "Registrar a data de assinatura dos contratos no módulo de Contratos.",
      modulo: "contratos",
      resolvida: false,
    });
  }

  const vencidos = cts.filter(c => {
    if (!c?.data_vencimento) return false;
    try { return new Date(c.data_vencimento) < new Date(); } catch { return false; }
  });
  if (vencidos.length > 0) {
    pends.push({
      id: pid("contrato", "contratos-vencidos"),
      categoria: "contrato",
      prioridade: "alta",
      titulo: `${vencidos.length} contrato(s) vencido(s)`,
      descricao: "Contratos com data de vencimento ultrapassada.",
      impacto: "Pode indicar inadimplência ou necessidade de renovação.",
      acaoRecomendada: "Revisar os contratos vencidos e atualizar o status no módulo de Contratos.",
      modulo: "contratos",
      resolvida: false,
    });
  }

  return pends;
}

function regrasFaturamento(empresa: any, orcamentos: any[]): Pendencia[] {
  const pends: Pendencia[] = [];
  const orcs = safeArr<any>(orcamentos);

  if (!safeNum(empresa?.faturamento_anual)) {
    pends.push({
      id: pid("faturamento", "faturamento-nao-comprovado"),
      categoria: "faturamento",
      prioridade: "alta",
      titulo: "Faturamento anual não comprovado",
      descricao: "O faturamento anual da empresa não está informado ou comprovado.",
      impacto: "Bloqueia análise de capacidade de crédito e proposta bancária.",
      acaoRecomendada: "Informar o faturamento anual e anexar comprovante (extrato ou DRE) no acervo.",
      modulo: "acervo_documental",
      resolvida: false,
    });
  }

  if (!safeStr(empresa?.regime_tributario)) {
    pends.push({
      id: pid("faturamento", "regime-tributario-ausente"),
      categoria: "faturamento",
      prioridade: "media",
      titulo: "Regime tributário não informado",
      descricao: "O regime tributário da empresa (Simples, Lucro Presumido, etc.) não está cadastrado.",
      impacto: "Dificulta análise fiscal e tributária para fins de crédito.",
      acaoRecomendada: "Informar o regime tributário no cadastro da empresa.",
      modulo: "cadastro_empresa",
      resolvida: false,
    });
  }

  if (orcs.length === 0) {
    pends.push({
      id: pid("faturamento", "sem-orcamentos"),
      categoria: "faturamento",
      prioridade: "baixa",
      titulo: "Nenhum orçamento gerado",
      descricao: "A empresa não possui orçamentos ou propostas comerciais geradas.",
      impacto: "Indica que o processo comercial ainda não foi iniciado formalmente.",
      acaoRecomendada: "Gerar um orçamento ou proposta comercial no módulo de Orçamentos.",
      modulo: "orcamentos",
      resolvida: false,
    });
  }

  return pends;
}

function regrasComerciais(empresa: any, followups: any[], historico: any[]): Pendencia[] {
  const pends: Pendencia[] = [];
  const fups = safeArr<any>(followups);
  const hist = safeArr<any>(historico);

  if (fups.length === 0 && hist.length === 0) {
    pends.push({
      id: pid("comercial", "sem-followup"),
      categoria: "comercial",
      prioridade: "media",
      titulo: "Nenhum follow-up registrado",
      descricao: "A empresa não possui registros de follow-up ou histórico de contato.",
      impacto: "Dificulta acompanhamento do relacionamento comercial.",
      acaoRecomendada: "Registrar o primeiro contato ou follow-up no módulo de Follow-up.",
      modulo: "followup",
      resolvida: false,
    });
  }

  if (!safeStr(empresa?.responsavel_nome) && !safeStr(empresa?.responsavel_cpf)) {
    pends.push({
      id: pid("comercial", "responsavel-ausente"),
      categoria: "comercial",
      prioridade: "media",
      titulo: "Responsável pela empresa não identificado",
      descricao: "Nenhum responsável ou interlocutor principal está cadastrado.",
      impacto: "Dificulta comunicação e assinatura de documentos.",
      acaoRecomendada: "Informar o nome e CPF do responsável no cadastro da empresa.",
      modulo: "cadastro_empresa",
      resolvida: false,
    });
  }

  return pends;
}

function regrasOperacionais(empresa: any, socios: any[], documentos: any[]): Pendencia[] {
  const pends: Pendencia[] = [];
  const docs = safeArr<any>(documentos);
  const arr = safeArr<any>(socios);

  if (!safeStr(empresa?.porte)) {
    pends.push({
      id: pid("operacional", "porte-ausente"),
      categoria: "operacional",
      prioridade: "baixa",
      titulo: "Porte da empresa não informado",
      descricao: "O porte da empresa (ME, EPP, Médio, Grande) não está cadastrado.",
      impacto: "Dificulta segmentação e análise de elegibilidade para produtos de crédito.",
      acaoRecomendada: "Informar o porte da empresa no cadastro.",
      modulo: "cadastro_empresa",
      resolvida: false,
    });
  }

  if (!safeStr(empresa?.natureza_juridica)) {
    pends.push({
      id: pid("operacional", "natureza-juridica-ausente"),
      categoria: "operacional",
      prioridade: "baixa",
      titulo: "Natureza jurídica não informada",
      descricao: "A natureza jurídica da empresa não está sincronizada.",
      impacto: "Pode impactar análise de elegibilidade para determinados produtos.",
      acaoRecomendada: "Sincronizar dados da Receita Federal para obter a natureza jurídica.",
      modulo: "cadastro_empresa",
      resolvida: false,
    });
  }

  const totalDocs = docs.length;
  const totalSocios = arr.length;
  if (totalDocs >= 3 && totalSocios >= 1 && safeNum(empresa?.faturamento_anual)) {
    // Empresa bem estruturada — sugerir próximo passo
    pends.push({
      id: pid("operacional", "gerar-relatorio-tecnico"),
      categoria: "operacional",
      prioridade: "baixa",
      titulo: "Gerar relatório técnico premium",
      descricao: "A empresa possui dados suficientes para gerar um relatório técnico completo.",
      impacto: "Melhora a apresentação para parceiros bancários e contadores.",
      acaoRecomendada: "Gerar o relatório técnico premium na aba Inteligência 360.",
      modulo: "relatorio_tecnico",
      resolvida: false,
    });
  }

  return pends;
}

// ─── Cálculo de score de completude ──────────────────────────────────────────

function calcularScoreCompletude(empresa: any, socios: any[], documentos: any[], simulacoes: any[], contratos: any[]): number {
  let pontos = 0;
  const max = 100;

  if (safeStr(empresa?.cnpj)) pontos += 10;
  if (safeStr(empresa?.razao_social)) pontos += 5;
  if (safeStr(empresa?.situacao_cadastral).toLowerCase().includes("ativa")) pontos += 10;
  if (safeNum(empresa?.faturamento_anual)) pontos += 15;
  if (safeNum(empresa?.capital_social)) pontos += 5;
  if (safeStr(empresa?.email) || safeStr(empresa?.telefone)) pontos += 5;
  if (safeStr(empresa?.cnae_principal)) pontos += 5;

  const sociosArr = safeArr<any>(socios);
  if (sociosArr.length > 0) pontos += 10;
  if (sociosArr.some(s => String(s?.cpf_cnpj || "").replace(/\D/g, "").length >= 11)) pontos += 10;

  const docs = safeArr<any>(documentos);
  const comArquivo = docs.filter(d => d?.arquivo_path || d?.url || d?.file_path).length;
  if (comArquivo >= 5) pontos += 15;
  else if (comArquivo >= 3) pontos += 10;
  else if (comArquivo >= 1) pontos += 5;

  if (safeArr<any>(simulacoes).length > 0) pontos += 5;
  if (safeArr<any>(contratos).length > 0) pontos += 5;

  return Math.min(max, pontos);
}

// ─── Geração do plano de ação ─────────────────────────────────────────────────

function gerarPlanoAcao(pendencias: Pendencia[]): PlanoAcaoItem[] {
  const ordenadas = [...pendencias]
    .filter(p => !p.resolvida)
    .sort((a, b) => {
      const ordem = { alta: 0, media: 1, baixa: 2 };
      return (ordem[a.prioridade] ?? 3) - (ordem[b.prioridade] ?? 3);
    });

  return ordenadas.map((p, i) => ({
    numero: i + 1,
    pendencia_id: p.id,
    titulo: p.titulo,
    acao: p.acaoRecomendada,
    modulo: p.modulo,
    prioridade: p.prioridade,
    prazo: p.prioridade === "alta" ? "Imediato" : p.prioridade === "media" ? "Até 5 dias úteis" : "Até 15 dias úteis",
  }));
}

// ─── Função principal exportada ───────────────────────────────────────────────

export function calcularPendencias(input: MotorPendenciasInput): MotorPendenciasResult {
  const empresa = input?.empresa ?? {};
  const socios = safeArr<any>(input?.socios);
  const documentos = safeArr<any>(input?.documentos);
  const simulacoes = safeArr<any>(input?.simulacoes);
  const orcamentos = safeArr<any>(input?.orcamentos);
  const contratos = safeArr<any>(input?.contratos);
  const historico = safeArr<any>(input?.historico);
  const followups = safeArr<any>(input?.followups);

  // Executar todas as regras
  const todasPendencias: Pendencia[] = [
    ...regrasCadastrais(empresa),
    ...regrasSocietarias(socios),
    ...regrasDocumentais(documentos),
    ...regrasCredito(empresa, simulacoes),
    ...regrasContrato(contratos, empresa),
    ...regrasFaturamento(empresa, orcamentos),
    ...regrasComerciais(empresa, followups, historico),
    ...regrasOperacionais(empresa, socios, documentos),
  ];

  // Contadores
  const altas = todasPendencias.filter(p => p.prioridade === "alta" && !p.resolvida).length;
  const medias = todasPendencias.filter(p => p.prioridade === "media" && !p.resolvida).length;
  const baixas = todasPendencias.filter(p => p.prioridade === "baixa" && !p.resolvida).length;
  const resolvidas = todasPendencias.filter(p => p.resolvida).length;
  const total = todasPendencias.length;

  // Score de completude
  const scoreCompletude = calcularScoreCompletude(empresa, socios, documentos, simulacoes, contratos);

  // Status geral
  let statusGeral: MotorPendenciasResult["status_geral"] = "excelente";
  if (altas >= 3) statusGeral = "critico";
  else if (altas >= 1) statusGeral = "atencao";
  else if (medias >= 3) statusGeral = "atencao";
  else if (medias >= 1 || baixas >= 1) statusGeral = "bom";

  // Agrupar por categoria
  const categorias: CategoriaPendencia[] = ["cadastral", "societaria", "documental", "credito", "contrato", "faturamento", "comercial", "operacional"];
  const grupos: GrupoPendencias[] = categorias
    .map(cat => {
      const pends = todasPendencias.filter(p => p.categoria === cat);
      return {
        categoria: cat,
        label: CATEGORIA_LABELS[cat],
        total: pends.length,
        altas: pends.filter(p => p.prioridade === "alta").length,
        medias: pends.filter(p => p.prioridade === "media").length,
        baixas: pends.filter(p => p.prioridade === "baixa").length,
        pendencias: pends,
      };
    })
    .filter(g => g.total > 0);

  // Plano de ação
  const planoAcao = gerarPlanoAcao(todasPendencias);

  // Resumo
  let resumo = "";
  if (altas === 0 && medias === 0 && baixas === 0) {
    resumo = "Cliente sem pendências críticas identificadas com os dados atuais.";
  } else if (altas >= 3) {
    resumo = `Empresa com ${altas} pendência(s) crítica(s) que bloqueiam análise bancária. Ação imediata necessária.`;
  } else if (altas >= 1) {
    resumo = `Empresa com ${altas} pendência(s) de alta prioridade. Resolução recomendada antes de avançar com a proposta.`;
  } else {
    resumo = `Empresa sem bloqueios críticos. ${medias} pendência(s) de média prioridade e ${baixas} de baixa prioridade identificadas.`;
  }

  return {
    empresa_id: safeStr(empresa?.id, ""),
    calculado_em: new Date().toISOString(),
    total,
    altas,
    medias,
    baixas,
    resolvidas,
    score_completude: scoreCompletude,
    status_geral: statusGeral,
    grupos,
    plano_acao: planoAcao,
    resumo,
  };
}

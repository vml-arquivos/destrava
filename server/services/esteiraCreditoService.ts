/**
 * esteiraCreditoService.ts
 *
 * Serviço de Esteira de Crédito e Assessoria.
 * Calcula a jornada operacional da empresa com base nos dados existentes,
 * sem alterar status reais automaticamente e sem migration destrutiva.
 *
 * Etapas da esteira (derivadas do funil existente + dados operacionais):
 *  1. Cadastro e Qualificação
 *  2. Coleta Documental
 *  3. Análise de Crédito
 *  4. Proposta Bancária
 *  5. Negociação e Aprovação
 *  6. Formalização Contratual
 *  7. Liberação e Desembolso
 *  8. Pós-Crédito e Carteira
 *
 * REGRA: ZERO REGRESSÃO — apenas leitura, sem alterar dados.
 */

import { isSituacaoAtiva } from "../utils/situacaoCadastral";

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

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export type StatusEtapa = "concluida" | "em_andamento" | "bloqueada" | "pendente" | "nao_iniciada";

export type ModuloEtapa =
  | "cadastro_empresa"
  | "socios_qsa"
  | "acervo_documental"
  | "simulacoes"
  | "inteligencia_360"
  | "proposta_bancaria"
  | "contratos"
  | "followup"
  | "relatorio_tecnico";

export interface BloqueioEsteira {
  id: string;
  titulo: string;
  descricao: string;
  critico: boolean;
  modulo: ModuloEtapa;
}

export interface AcaoEsteira {
  titulo: string;
  descricao: string;
  modulo: ModuloEtapa;
  prioridade: "imediata" | "proxima" | "futura";
}

export interface EtapaEsteira {
  numero: number;
  id: string;
  titulo: string;
  descricao: string;
  status: StatusEtapa;
  percentual_conclusao: number;
  bloqueios: BloqueioEsteira[];
  acoes_recomendadas: AcaoEsteira[];
  modulo_principal: ModuloEtapa;
  dados_resumo: Record<string, string | number | boolean>;
}

export interface HistoricoResumoItem {
  data: string;
  tipo: string;
  descricao: string;
  modulo: ModuloEtapa;
}

export interface EsteiraResult {
  empresa_id: string;
  calculado_em: string;
  etapa_atual_numero: number;
  etapa_atual_id: string;
  etapa_atual_titulo: string;
  progresso_geral: number;
  status_geral: "critico" | "atencao" | "em_andamento" | "avancado" | "concluido";
  total_bloqueios_criticos: number;
  total_acoes_pendentes: number;
  etapas: EtapaEsteira[];
  proximas_etapas: Array<{ numero: number; titulo: string; id: string }>;
  historico_resumido: HistoricoResumoItem[];
  resumo_executivo: string;
  fonte: "deterministica";
}

export interface EsteiraInput {
  empresa: any;
  socios: any[];
  documentos: any[];
  simulacoes: any[];
  orcamentos: any[];
  contratos: any[];
  historico: any[];
  followups: any[];
  acompanhamentos: any[];
}

// ─── Avaliação de cada etapa ──────────────────────────────────────────────────

function avaliarEtapa1Cadastro(empresa: any, socios: any[]): EtapaEsteira {
  const bloqueios: BloqueioEsteira[] = [];
  const acoes: AcaoEsteira[] = [];
  let pontos = 0;
  const maxPontos = 10;

  if (safeStr(empresa?.cnpj)) pontos += 2; else bloqueios.push({ id: "e1-cnpj", titulo: "CNPJ ausente", descricao: "O CNPJ da empresa não está cadastrado.", critico: true, modulo: "cadastro_empresa" });
  if (safeStr(empresa?.razao_social)) pontos += 1; else bloqueios.push({ id: "e1-razao", titulo: "Razão social ausente", descricao: "A razão social não está informada.", critico: true, modulo: "cadastro_empresa" });
  if (isSituacaoAtiva(empresa?.situacao_cadastral)) pontos += 2; else bloqueios.push({ id: "e1-situacao", titulo: "Situação cadastral não ativa", descricao: `Situação: "${safeStr(empresa?.situacao_cadastral, "não informada")}".`, critico: true, modulo: "cadastro_empresa" });
  if (safeStr(empresa?.cnae_principal)) pontos += 1; else acoes.push({ titulo: "Sincronizar CNAE", descricao: "Obter o CNAE principal da Receita Federal.", modulo: "cadastro_empresa", prioridade: "proxima" });
  if (safeStr(empresa?.email) || safeStr(empresa?.telefone)) pontos += 1; else acoes.push({ titulo: "Informar contato", descricao: "Cadastrar e-mail ou telefone da empresa.", modulo: "cadastro_empresa", prioridade: "proxima" });
  if (safeArr(socios).length > 0) pontos += 2; else bloqueios.push({ id: "e1-socios", titulo: "Sem sócios cadastrados", descricao: "O QSA está vazio.", critico: true, modulo: "socios_qsa" });
  if (safeArr(socios).some((s: any) => String(s?.cpf_cnpj || "").replace(/\D/g, "").length >= 11)) pontos += 1; else if (safeArr(socios).length > 0) acoes.push({ titulo: "Informar CPF dos sócios", descricao: "Cadastrar CPF de todos os sócios.", modulo: "socios_qsa", prioridade: "imediata" });

  const pct = Math.round((pontos / maxPontos) * 100);
  const status: StatusEtapa = bloqueios.some(b => b.critico) ? "bloqueada" : pct >= 80 ? "concluida" : pct >= 40 ? "em_andamento" : "pendente";

  return {
    numero: 1, id: "cadastro_qualificacao", titulo: "Cadastro e Qualificação", status,
    descricao: "Validação dos dados cadastrais, situação na Receita Federal e composição societária.",
    percentual_conclusao: pct, bloqueios, acoes_recomendadas: acoes,
    modulo_principal: "cadastro_empresa",
    dados_resumo: {
      cnpj: safeStr(empresa?.cnpj, "Não informado"),
      situacao: safeStr(empresa?.situacao_cadastral, "Não informada"),
      socios: safeArr(socios).length,
      porte: safeStr(empresa?.porte, "Não informado"),
    },
  };
}

function avaliarEtapa2Documentos(documentos: any[]): EtapaEsteira {
  const docs = safeArr<any>(documentos);
  const bloqueios: BloqueioEsteira[] = [];
  const acoes: AcaoEsteira[] = [];

  const comArquivo = docs.filter(d => d?.arquivo_path || d?.url || d?.file_path).length;
  const validados = docs.filter(d => d?.status === "validado" || d?.status === "aprovado").length;
  const semArquivo = docs.filter(d => !(d?.arquivo_path || d?.url || d?.file_path)).length;

  if (docs.length === 0) {
    bloqueios.push({ id: "e2-acervo-vazio", titulo: "Acervo documental vazio", descricao: "Nenhum documento foi enviado.", critico: true, modulo: "acervo_documental" });
  } else {
    if (semArquivo > 0) bloqueios.push({ id: "e2-sem-arquivo", titulo: `${semArquivo} doc(s) sem arquivo`, descricao: "Documentos cadastrados sem arquivo físico.", critico: true, modulo: "acervo_documental" });
    if (validados < comArquivo) acoes.push({ titulo: "Validar documentos", descricao: `${comArquivo - validados} documento(s) aguardando validação.`, modulo: "acervo_documental", prioridade: "proxima" });
  }

  if (docs.length < 3) acoes.push({ titulo: "Enviar documentos básicos", descricao: "Cartão CNPJ, Contrato Social e extrato bancário são essenciais.", modulo: "acervo_documental", prioridade: "imediata" });

  const pct = docs.length === 0 ? 0 : Math.min(100, Math.round(((comArquivo * 0.6) + (validados * 0.4)) / docs.length * 100));
  const status: StatusEtapa = bloqueios.some(b => b.critico) ? "bloqueada" : pct >= 80 ? "concluida" : pct >= 30 ? "em_andamento" : "pendente";

  return {
    numero: 2, id: "coleta_documental", titulo: "Coleta Documental", status,
    descricao: "Envio e validação dos documentos obrigatórios para análise de crédito.",
    percentual_conclusao: pct, bloqueios, acoes_recomendadas: acoes,
    modulo_principal: "acervo_documental",
    dados_resumo: { total_documentos: docs.length, com_arquivo: comArquivo, validados, sem_arquivo: semArquivo },
  };
}

function avaliarEtapa3AnaliseCredito(empresa: any, simulacoes: any[]): EtapaEsteira {
  const sims = safeArr<any>(simulacoes);
  const bloqueios: BloqueioEsteira[] = [];
  const acoes: AcaoEsteira[] = [];

  if (!safeNum(empresa?.faturamento_anual)) bloqueios.push({ id: "e3-faturamento", titulo: "Faturamento não informado", descricao: "Faturamento anual é obrigatório para análise.", critico: true, modulo: "cadastro_empresa" });
  if (sims.length === 0) acoes.push({ titulo: "Criar simulação de crédito", descricao: "Simule o produto, valor e prazo desejados.", modulo: "simulacoes", prioridade: "imediata" });
  if (!empresa?.score_interno && !empresa?.score_serasa) acoes.push({ titulo: "Consultar score de crédito", descricao: "Obter score Serasa ou interno para análise de risco.", modulo: "inteligencia_360", prioridade: "proxima" });

  const temFaturamento = !!safeNum(empresa?.faturamento_anual);
  const temSimulacao = sims.length > 0;
  const temScore = !!(empresa?.score_interno || empresa?.score_serasa);
  const pct = Math.round(((temFaturamento ? 40 : 0) + (temSimulacao ? 40 : 0) + (temScore ? 20 : 0)));
  const status: StatusEtapa = bloqueios.some(b => b.critico) ? "bloqueada" : pct >= 80 ? "concluida" : pct >= 40 ? "em_andamento" : "pendente";

  const fat = safeNum(empresa?.faturamento_anual);
  return {
    numero: 3, id: "analise_credito", titulo: "Análise de Crédito", status,
    descricao: "Avaliação da capacidade de crédito com base em faturamento, score e histórico.",
    percentual_conclusao: pct, bloqueios, acoes_recomendadas: acoes,
    modulo_principal: "inteligencia_360",
    dados_resumo: {
      faturamento: fat ? formatarMoeda(fat) : "Não informado",
      simulacoes: sims.length,
      score_interno: safeNum(empresa?.score_interno) ?? "Não informado",
      score_serasa: safeNum(empresa?.score_serasa) ?? "Não informado",
    },
  };
}

function avaliarEtapa4Proposta(empresa: any, simulacoes: any[], documentos: any[]): EtapaEsteira {
  const sims = safeArr<any>(simulacoes);
  const docs = safeArr<any>(documentos);
  const bloqueios: BloqueioEsteira[] = [];
  const acoes: AcaoEsteira[] = [];

  const temFaturamento = !!safeNum(empresa?.faturamento_anual);
  const temDocs = docs.filter(d => d?.arquivo_path || d?.url || d?.file_path).length >= 3;
  const temSim = sims.length > 0;

  if (!temFaturamento) bloqueios.push({ id: "e4-faturamento", titulo: "Faturamento ausente", descricao: "Necessário para gerar proposta bancária.", critico: true, modulo: "cadastro_empresa" });
  if (!temDocs) bloqueios.push({ id: "e4-docs", titulo: "Documentação insuficiente", descricao: "Mínimo de 3 documentos com arquivo para proposta.", critico: false, modulo: "acervo_documental" });
  if (!temSim) acoes.push({ titulo: "Criar simulação", descricao: "Defina produto, valor e prazo antes de gerar a proposta.", modulo: "simulacoes", prioridade: "imediata" });
  if (temFaturamento && temSim) acoes.push({ titulo: "Gerar proposta bancária", descricao: "Acesse a Inteligência 360 para gerar a proposta.", modulo: "proposta_bancaria", prioridade: "proxima" });

  const pct = Math.round(((temFaturamento ? 40 : 0) + (temDocs ? 30 : 0) + (temSim ? 30 : 0)));
  const status: StatusEtapa = bloqueios.some(b => b.critico) ? "bloqueada" : pct >= 80 ? "concluida" : pct >= 40 ? "em_andamento" : "pendente";

  return {
    numero: 4, id: "proposta_bancaria", titulo: "Proposta Bancária", status,
    descricao: "Elaboração e envio da proposta de crédito ao parceiro bancário.",
    percentual_conclusao: pct, bloqueios, acoes_recomendadas: acoes,
    modulo_principal: "proposta_bancaria",
    dados_resumo: {
      simulacoes: sims.length,
      docs_com_arquivo: docs.filter(d => d?.arquivo_path || d?.url || d?.file_path).length,
      faturamento_ok: temFaturamento,
    },
  };
}

function avaliarEtapa5Negociacao(acompanhamentos: any[], followups: any[]): EtapaEsteira {
  const acomps = safeArr<any>(acompanhamentos);
  const fups = safeArr<any>(followups);
  const acoes: AcaoEsteira[] = [];

  if (fups.length === 0 && acomps.length === 0) acoes.push({ titulo: "Registrar follow-up", descricao: "Documente o andamento da negociação com o banco.", modulo: "followup", prioridade: "proxima" });
  if (acomps.length === 0) acoes.push({ titulo: "Criar acompanhamento bancário", descricao: "Registre o banco, produto e status da negociação.", modulo: "followup", prioridade: "imediata" });

  const temAcomp = acomps.length > 0;
  const temFup = fups.length > 0;
  const pct = Math.round(((temAcomp ? 60 : 0) + (temFup ? 40 : 0)));
  const status: StatusEtapa = pct >= 60 ? "em_andamento" : pct > 0 ? "pendente" : "nao_iniciada";

  return {
    numero: 5, id: "negociacao_aprovacao", titulo: "Negociação e Aprovação", status,
    descricao: "Acompanhamento da análise bancária, negociação de condições e aprovação do crédito.",
    percentual_conclusao: Math.min(100, pct), bloqueios: [], acoes_recomendadas: acoes,
    modulo_principal: "followup",
    dados_resumo: { acompanhamentos_bancarios: acomps.length, followups: fups.length },
  };
}

function avaliarEtapa6Contrato(contratos: any[]): EtapaEsteira {
  const cts = safeArr<any>(contratos);
  const bloqueios: BloqueioEsteira[] = [];
  const acoes: AcaoEsteira[] = [];

  const ativos = cts.filter(c => c?.status === "ativo" || c?.status === "assinado");
  const pendentes = cts.filter(c => c?.status === "pendente" || !c?.data_assinatura);
  const vencidos = cts.filter(c => {
    if (!c?.data_vencimento) return false;
    try { return new Date(c.data_vencimento) < new Date(); } catch { return false; }
  });

  if (cts.length === 0) acoes.push({ titulo: "Gerar contrato", descricao: "Após aprovação, formalize o crédito com o contrato.", modulo: "contratos", prioridade: "futura" });
  if (pendentes.length > 0) bloqueios.push({ id: "e6-pendente", titulo: `${pendentes.length} contrato(s) sem assinatura`, descricao: "Contratos pendentes de assinatura.", critico: false, modulo: "contratos" });
  if (vencidos.length > 0) bloqueios.push({ id: "e6-vencido", titulo: `${vencidos.length} contrato(s) vencido(s)`, descricao: "Contratos com vencimento ultrapassado.", critico: true, modulo: "contratos" });
  if (ativos.length > 0) acoes.push({ titulo: "Acompanhar execução", descricao: "Monitore o cumprimento dos contratos ativos.", modulo: "contratos", prioridade: "proxima" });

  const pct = cts.length === 0 ? 0 : Math.min(100, Math.round((ativos.length / cts.length) * 100));
  const status: StatusEtapa = vencidos.length > 0 ? "bloqueada" : ativos.length > 0 ? "em_andamento" : cts.length > 0 ? "pendente" : "nao_iniciada";

  return {
    numero: 6, id: "formalizacao_contratual", titulo: "Formalização Contratual", status,
    descricao: "Geração, assinatura e formalização dos contratos de crédito.",
    percentual_conclusao: pct, bloqueios, acoes_recomendadas: acoes,
    modulo_principal: "contratos",
    dados_resumo: { total_contratos: cts.length, ativos: ativos.length, pendentes: pendentes.length, vencidos: vencidos.length },
  };
}

function avaliarEtapa7Liberacao(contratos: any[], acompanhamentos: any[]): EtapaEsteira {
  const cts = safeArr<any>(contratos);
  const acomps = safeArr<any>(acompanhamentos);
  const acoes: AcaoEsteira[] = [];

  const contratosAtivos = cts.filter(c => c?.status === "ativo" || c?.status === "assinado");
  const liberados = acomps.filter((a: any) => safeStr(a?.status).toLowerCase().includes("liberado") || safeStr(a?.status).toLowerCase().includes("desembolso"));

  if (contratosAtivos.length > 0 && liberados.length === 0) acoes.push({ titulo: "Confirmar liberação de crédito", descricao: "Registre a liberação e desembolso no acompanhamento bancário.", modulo: "followup", prioridade: "proxima" });

  const pct = liberados.length > 0 ? 100 : contratosAtivos.length > 0 ? 50 : 0;
  const status: StatusEtapa = liberados.length > 0 ? "concluida" : contratosAtivos.length > 0 ? "em_andamento" : "nao_iniciada";

  return {
    numero: 7, id: "liberacao_desembolso", titulo: "Liberação e Desembolso", status,
    descricao: "Confirmação da liberação do crédito e registro do desembolso.",
    percentual_conclusao: pct, bloqueios: [], acoes_recomendadas: acoes,
    modulo_principal: "followup",
    dados_resumo: { contratos_ativos: contratosAtivos.length, registros_liberacao: liberados.length },
  };
}

function avaliarEtapa8PosCredito(empresa: any, contratos: any[], followups: any[]): EtapaEsteira {
  const cts = safeArr<any>(contratos);
  const fups = safeArr<any>(followups);
  const acoes: AcaoEsteira[] = [];

  const emCarteira = safeStr(empresa?.etapa_funil).includes("carteira") || safeStr(empresa?.status).includes("carteira");
  const contratosAtivos = cts.filter(c => c?.status === "ativo" || c?.status === "assinado").length;

  if (contratosAtivos > 0 && fups.length === 0) acoes.push({ titulo: "Iniciar pós-venda", descricao: "Registre o acompanhamento pós-crédito no follow-up.", modulo: "followup", prioridade: "proxima" });
  if (contratosAtivos > 0) acoes.push({ titulo: "Gerar relatório técnico", descricao: "Documente a operação com o relatório técnico premium.", modulo: "relatorio_tecnico", prioridade: "futura" });

  const pct = emCarteira ? 100 : contratosAtivos > 0 ? 60 : 0;
  const status: StatusEtapa = emCarteira ? "concluida" : contratosAtivos > 0 ? "em_andamento" : "nao_iniciada";

  return {
    numero: 8, id: "pos_credito_carteira", titulo: "Pós-Crédito e Carteira", status,
    descricao: "Acompanhamento pós-crédito, renovação e gestão da carteira de clientes.",
    percentual_conclusao: pct, bloqueios: [], acoes_recomendadas: acoes,
    modulo_principal: "relatorio_tecnico",
    dados_resumo: { em_carteira: emCarteira, contratos_ativos: contratosAtivos, followups: fups.length },
  };
}

// ─── Determinação da etapa atual ──────────────────────────────────────────────

function determinarEtapaAtual(etapas: EtapaEsteira[]): number {
  // A etapa atual é a primeira que não está concluída e não está nao_iniciada
  for (const e of etapas) {
    if (e.status === "bloqueada" || e.status === "em_andamento" || e.status === "pendente") return e.numero;
  }
  // Se todas estão concluídas
  if (etapas.every(e => e.status === "concluida")) return etapas.length;
  // Se tudo não iniciado, começa na 1
  return 1;
}

// ─── Histórico resumido ───────────────────────────────────────────────────────

function gerarHistoricoResumido(historico: any[], followups: any[], contratos: any[], simulacoes: any[]): HistoricoResumoItem[] {
  const items: HistoricoResumoItem[] = [];

  safeArr<any>(historico).slice(0, 3).forEach(h => {
    items.push({
      data: safeStr(h?.created_at || h?.data, ""),
      tipo: safeStr(h?.tipo, "Histórico"),
      descricao: safeStr(h?.descricao, "Registro de histórico"),
      modulo: "cadastro_empresa",
    });
  });

  safeArr<any>(followups).slice(0, 2).forEach(f => {
    items.push({
      data: safeStr(f?.created_at || f?.data, ""),
      tipo: safeStr(f?.tipo, "Follow-up"),
      descricao: safeStr(f?.descricao, "Registro de follow-up"),
      modulo: "followup",
    });
  });

  safeArr<any>(contratos).slice(0, 2).forEach(c => {
    items.push({
      data: safeStr(c?.data_assinatura || c?.created_at, ""),
      tipo: "Contrato",
      descricao: `${safeStr(c?.tipo_contrato, "Contrato")} — ${safeStr(c?.numero_contrato, "s/n")}`,
      modulo: "contratos",
    });
  });

  safeArr<any>(simulacoes).slice(0, 2).forEach(s => {
    items.push({
      data: safeStr(s?.criado_em || s?.created_at, ""),
      tipo: "Simulação",
      descricao: `${safeStr(s?.produto, "Produto")} — ${s?.valor_solicitado ? formatarMoeda(Number(s.valor_solicitado)) : "Valor não informado"}`,
      modulo: "simulacoes",
    });
  });

  return items
    .filter(i => i.data)
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    .slice(0, 8);
}

// ─── Função principal exportada ───────────────────────────────────────────────

export function calcularEsteiraCredito(input: EsteiraInput): EsteiraResult {
  const empresa = input?.empresa ?? {};
  const socios = safeArr<any>(input?.socios);
  const documentos = safeArr<any>(input?.documentos);
  const simulacoes = safeArr<any>(input?.simulacoes);
  const orcamentos = safeArr<any>(input?.orcamentos);
  const contratos = safeArr<any>(input?.contratos);
  const historico = safeArr<any>(input?.historico);
  const followups = safeArr<any>(input?.followups);
  const acompanhamentos = safeArr<any>(input?.acompanhamentos);

  // Avaliar cada etapa
  const etapas: EtapaEsteira[] = [
    avaliarEtapa1Cadastro(empresa, socios),
    avaliarEtapa2Documentos(documentos),
    avaliarEtapa3AnaliseCredito(empresa, simulacoes),
    avaliarEtapa4Proposta(empresa, simulacoes, documentos),
    avaliarEtapa5Negociacao(acompanhamentos, followups),
    avaliarEtapa6Contrato(contratos),
    avaliarEtapa7Liberacao(contratos, acompanhamentos),
    avaliarEtapa8PosCredito(empresa, contratos, followups),
  ];

  // Etapa atual
  const etapaAtualNum = determinarEtapaAtual(etapas);
  const etapaAtual = etapas[etapaAtualNum - 1];

  // Progresso geral (média ponderada)
  const pesos = [15, 15, 20, 15, 10, 10, 10, 5];
  const progressoGeral = Math.round(
    etapas.reduce((acc, e, i) => acc + (e.percentual_conclusao * (pesos[i] ?? 10)) / 100, 0)
  );

  // Total de bloqueios críticos e ações pendentes
  const totalBloqueiosCriticos = etapas.reduce((acc, e) => acc + e.bloqueios.filter(b => b.critico).length, 0);
  const totalAcoesPendentes = etapas.reduce((acc, e) => acc + e.acoes_recomendadas.length, 0);

  // Status geral
  let statusGeral: EsteiraResult["status_geral"] = "em_andamento";
  if (totalBloqueiosCriticos >= 3) statusGeral = "critico";
  else if (totalBloqueiosCriticos >= 1) statusGeral = "atencao";
  else if (progressoGeral >= 80) statusGeral = "avancado";
  else if (progressoGeral >= 100 || etapas.every(e => e.status === "concluida" || e.status === "nao_iniciada")) statusGeral = "concluido";

  // Próximas etapas (até 3 após a atual)
  const proximasEtapas = etapas
    .filter(e => e.numero > etapaAtualNum && e.status !== "concluida")
    .slice(0, 3)
    .map(e => ({ numero: e.numero, titulo: e.titulo, id: e.id }));

  // Histórico resumido
  const historicoResumido = gerarHistoricoResumido(historico, followups, contratos, simulacoes);

  // Resumo executivo
  let resumoExecutivo = "";
  if (totalBloqueiosCriticos >= 3) {
    resumoExecutivo = `Esteira com ${totalBloqueiosCriticos} bloqueios críticos. Ação imediata necessária para avançar na jornada de crédito.`;
  } else if (totalBloqueiosCriticos >= 1) {
    resumoExecutivo = `Empresa na etapa "${etapaAtual?.titulo}". ${totalBloqueiosCriticos} bloqueio(s) crítico(s) identificado(s). Resolva-os para avançar.`;
  } else if (progressoGeral >= 80) {
    resumoExecutivo = `Empresa em estágio avançado da jornada de crédito (${progressoGeral}% concluído). Etapa atual: "${etapaAtual?.titulo}".`;
  } else {
    resumoExecutivo = `Empresa na etapa "${etapaAtual?.titulo}" (${progressoGeral}% da jornada concluída). ${totalAcoesPendentes} ação(ões) recomendada(s).`;
  }

  return {
    empresa_id: safeStr(empresa?.id, ""),
    calculado_em: new Date().toISOString(),
    etapa_atual_numero: etapaAtualNum,
    etapa_atual_id: etapaAtual?.id ?? "cadastro_qualificacao",
    etapa_atual_titulo: etapaAtual?.titulo ?? "Cadastro e Qualificação",
    progresso_geral: progressoGeral,
    status_geral: statusGeral,
    total_bloqueios_criticos: totalBloqueiosCriticos,
    total_acoes_pendentes: totalAcoesPendentes,
    etapas,
    proximas_etapas: proximasEtapas,
    historico_resumido: historicoResumido,
    resumo_executivo: resumoExecutivo,
    fonte: "deterministica",
  };
}

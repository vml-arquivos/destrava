import fs from 'fs/promises';
import path from 'path';
import pkg from 'pg';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  diffDays,
  normalizeText,
  normalizarBasico,
  normalizarNomeEmpresarial,
  onlyDigits,
  parseDate,
} from '../utils/helpers';
import { detectarRegimeTributarioDeclarado, extrairDocumentoLocal, type TipoDocumentoLocal } from './extracaoDocumentalLocal';
import { resolveDocumentPath } from './documentStorage';
import {
  validarComprovanteEnderecoExtraido,
  validarFaturamentoExtraido,
} from './regrasDocumentaisCredito';
import { canonicalizeDocumentType, documentAnalysisConfig, documentLabel, getDocumentCatalogEntry } from '../../shared/documentTypes';
import { classificarResultadoPersistido, type ClassificacaoDocumentalResult } from './classificadorDocumentalCentral';
import { registrarPeriodoRegime } from './regimeTributarioTemporalService';
import { registrarFaturamentoCompetencia } from './faturamentoRolling12MesesService';
import { detectarRequisitosCobertosPeloTexto, detectarStatusCertidaoDebitos, registrarCoberturaEvidencia } from './coberturaEvidenciaBureauService';
import { descricaoPerfilParaPrompt, obterPerfilAnaliseDocumental } from './documentAnalysisProfiles';
import { externalAiFallbackDocumentalEnabled } from './documentExternalAiPolicy';

const { Pool } = pkg;

// CORREÇÃO (2026-08-31, bug real reportado em produção -- caso ZR CONSTRUCOES,
// CNPJ 49.366.887/0001-25: PGDAS-D anexado no slot de ECF, com o Enquadramento
// Tributário da própria empresa já lido como "Não Optante" pelo Simples, ou
// seja, um regime diferente do que o PGDAS antigo comprova): os únicos tipos
// cujo `documento_compativel` da extração LOCAL vem de um classificador
// determinístico (`detectarTipoComprovanteRegime`/`TipoComprovanteRegime`, em
// extracaoDocumentalLocal.ts) -- não de uma heurística aproximada nem de uma
// segunda opinião da IA. Mantido em sincronia com `TipoComprovanteRegime`
// (hoje: ecf, pgdas_d, dctf_mit, darf, ecd, livro_caixa). Usado por
// `extrairHibrido` para decidir quando um "false" da leitura local pode ser
// usado diretamente, sem esperar confirmação da IA (ver comentário no local
// de uso).
const TIPOS_COMPROVANTE_REGIME_DETERMINISTICO = new Set<TipoDocumentoLocal>(['ecf', 'pgdas_d', 'dctf_mit', 'darf', 'ecd', 'livro_caixa']);

const TIPOS_SOCIETARIOS_COM_LEITOR_LOCAL = new Set([
  'contrato_social', 'alteracao_contratual', 'requerimento_empresario',
  'estatuto', 'ata', 'nire',
]);

/** Seleciona um parser local compatível; nunca reutiliza contrato como parser genérico. */
export function tipoLeitorLocalDocumentoCatalogado(tipoDocumento: string): TipoDocumentoLocal {
  const tipoCanonico = canonicalizeDocumentType(tipoDocumento);
  if (tipoCanonico === 'cartao_cnpj') return 'cartao_cnpj';
  if (tipoDocumento === 'qsa') return 'qsa';
  if (tipoDocumento === 'atos_junta_comercial') return 'atos_junta_comercial';
  if (['simples_nacional', 'enquadramento_tributario_cnpj', 'comprovante_regime_outro'].includes(tipoDocumento)) return 'simples_nacional';
  if (tipoCanonico === 'comprovante_residencia') return 'comprovante_residencia';
  if (tipoCanonico === 'faturamento_12_meses') return 'faturamento_12_meses';
  if (tipoCanonico === 'extrato_bancario') return 'extrato_bancario';
  if (['ecf', 'recibo_ecf'].includes(tipoDocumento)) return 'ecf';
  if (['pgdas', 'pgdas_d', 'recibo_pgdas'].includes(tipoDocumento)) return 'pgdas_d';
  if (['dctf', 'dctfweb', 'mit'].includes(tipoDocumento)) return 'dctf_mit';
  if (tipoDocumento === 'darf') return 'darf';
  if (['ecd', 'recibo_ecd'].includes(tipoDocumento)) return 'ecd';
  if (tipoDocumento === 'livro_caixa') return 'livro_caixa';
  if (tipoCanonico === 'efd_contribuicoes') return 'efd_contribuicoes';
  if (tipoCanonico === 'efd_icms_ipi') return 'efd_icms_ipi';
  if (TIPOS_SOCIETARIOS_COM_LEITOR_LOCAL.has(tipoCanonico)) return 'contrato_social_alteracao';
  return 'documento_generico';
}

export type SeveridadeDocumental = 'baixa' | 'media' | 'alta' | 'critica';
export type TipoAnaliseDocumental =
  | 'qsa'
  | 'simples_nacional'
  | 'atos_junta_comercial'
  | 'contrato_junta'
  | 'faturamento_12_meses'
  | 'comprovante_residencia'
  | 'documento_generico';

export interface AlertaDocumental {
  codigo: string;
  mensagem: string;
  severidade: SeveridadeDocumental;
  campo?: string;
  valor_documento?: unknown;
  valor_receita?: unknown;
  recomendacao?: string;
  solicitar_qsa_atualizado?: boolean;
}

export interface AnaliseDocumentalResult {
  tipo_analise: TipoAnaliseDocumental;
  empresa_id: string;
  arquivo_id: string;
  status: 'concluido' | 'revisao_humana';
  dados_extraidos: Record<string, any>;
  alertas: AlertaDocumental[];
  divergencias: AlertaDocumental[];
  nivel_confianca: number | null;
  modelo_ia: string | null;
  analisado_em: string;
  revisao_humana_necessaria: boolean;
}

export interface LancamentoExtratoExtraido {
  data: string;
  tipo: 'entrada' | 'saida';
  descricao: string;
  valor: number;
  evidencia: string | null;
}

export interface AnaliseDocumentalGenericaResult extends AnaliseDocumentalResult {
  tipo_analise: 'documento_generico';
  tipo_documento: string;
  tipo_documento_canonico: string;
  evidencias: Array<{ campo: string; valor: unknown; pagina?: number | null; trecho?: string | null; confianca?: number | null }>;
  campos_inferidos: Record<string, unknown>;
  competencia?: { inicio?: string | null; fim?: string | null } | null;
  validade?: { inicio?: string | null; fim?: string | null } | null;
}

export interface AnaliseExtratoBancarioResult {
  arquivo_id: string;
  empresa_id: string;
  documento_compativel: boolean;
  banco: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  lancamentos: LancamentoExtratoExtraido[];
  // Quantos lançamentos o documento realmente tinha, ANTES do filtro pela
  // semana selecionada. Sem este campo, um extrato lido com sucesso mas cuja
  // semana bancária selecionada não cobre nenhuma das datas do documento
  // ficava indistinguível de um extrato que a leitura simplesmente não
  // conseguiu ler -- os dois casos zeravam `lancamentos` e geravam a mesma
  // mensagem genérica. Ver uso em `normalizarExtratoBancario` e na rota
  // POST /api/acompanhamentos-bancarios/:id/extratos/analisar.
  total_lancamentos_no_documento: number;
  total_entradas: number;
  total_saidas: number;
  confianca: number | null;
  fonte_extracao: string | null;
  modelo_ia: string | null;
  revisao_humana_necessaria: boolean;
  observacoes: string[];
}

interface Queryable {
  query: (text: string, values?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

interface DocumentoArquivoRow {
  id: string;
  empresa_id?: string | null;
  entidade_id?: string | null;
  entidade_tipo?: string | null;
  nome_original?: string | null;
  nome_arquivo?: string | null;
  hash_arquivo?: string | null;
  caminho_arquivo?: string | null;
  url_arquivo?: string | null;
  mime_type?: string | null;
  tipo_documento?: string | null;
  socio_id?: string | null;
}

type ExtratorInjetado = (arquivoPath: string, prompt: string, mimeType: string) => Promise<any>;

const defaultPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim().replace(/R\$/gi, '').replace(/\s/g, '');
  if (!raw) return null;
  let normalized = raw;
  if (raw.includes(',')) normalized = raw.replace(/\./g, '').replace(',', '.');
  else if ((raw.match(/\./g) || []).length > 1) normalized = raw.replace(/\./g, '');
  normalized = normalized.replace(/[^0-9.-]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizarConfianca(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number > 1 && number <= 100) return Math.max(0, Math.min(1, number / 100));
  return Math.max(0, Math.min(1, number));
}

function normalizarBooleano(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  const text = normalizeText(value);
  if (!text) return null;
  if (['sim', 'true', 'optante', 'ativo', 'ativa'].includes(text)) return true;
  if (['nao', 'false', 'nao optante', 'inativo', 'inativa', 'excluido', 'excluida'].includes(text)) return false;
  return null;
}

function normalizarSituacaoSimples(value: unknown): 'optante' | 'nao_optante' | 'excluido' | 'desconhecido' {
  const text = normalizarBasico(value);
  if (!text) return 'desconhecido';
  if (text.includes('exclu')) return 'excluido';
  if (text.includes('nao optante') || text.includes('não optante')) return 'nao_optante';
  if (text.includes('optante')) return 'optante';
  return 'desconhecido';
}

function capitalDivergente(documento: unknown, receita: unknown) {
  const doc = asNumber(documento);
  const rec = asNumber(receita);
  if (doc === null || rec === null) return { divergente: false, significativo: false, documento: doc, receita: rec, diferenca_percentual: null as number | null };
  const diferenca = Math.abs(doc - rec);
  const base = Math.max(Math.abs(rec), 1);
  const percentual = diferenca / base;
  return {
    divergente: diferenca > 0.01,
    significativo: diferenca > 1 && percentual >= 0.1,
    documento: doc,
    receita: rec,
    diferenca_percentual: percentual,
  };
}

function uniqueAlerts(alertas: AlertaDocumental[]): AlertaDocumental[] {
  const seen = new Set<string>();
  return alertas.filter((alerta) => {
    const key = `${alerta.codigo}|${alerta.mensagem}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function criarResultado(
  tipo: TipoAnaliseDocumental,
  empresaId: string,
  arquivoId: string,
  dados: Record<string, any>,
  alertas: AlertaDocumental[],
  modelo: string | null,
): AnaliseDocumentalResult {
  const alertasUnicos = uniqueAlerts(alertas);
  const revisao = alertasUnicos.some((alerta) => alerta.severidade === 'critica' || alerta.severidade === 'alta');
  return {
    tipo_analise: tipo,
    empresa_id: empresaId,
    arquivo_id: arquivoId,
    status: revisao ? 'revisao_humana' : 'concluido',
    dados_extraidos: dados,
    alertas: alertasUnicos,
    divergencias: alertasUnicos,
    nivel_confianca: normalizarConfianca(dados?.confianca),
    modelo_ia: modelo,
    analisado_em: new Date().toISOString(),
    revisao_humana_necessaria: revisao,
  };
}

export interface AnaliseSocietariaAuditavel {
  status_documento: 'atual' | 'historico' | 'indeterminado';
  ato_praticado: string | null;
  diagnostico_objetivo: string;
  linha_tempo_societaria: Array<{
    data: string | null;
    numero_arquivamento: string | null;
    tipo_ato: string | null;
    fonte: 'atos_junta' | 'contrato';
    e_ato_mais_recente: boolean;
    corresponde_ao_contrato: boolean;
  }>;
  ato_mais_recente: {
    data: string | null;
    numero_arquivamento: string | null;
    tipo_ato: string | null;
  } | null;
  quadro_anterior: Array<Record<string, any>>;
  quadro_final_documento: Array<Record<string, any>>;
  estado_atual: {
    fonte: 'qsa' | 'contrato' | 'indeterminado';
    data_referencia: string | null;
    socios: Array<Record<string, any>>;
    descricao: string;
  };
  confronto_qsa: {
    status: 'confirmado' | 'historico' | 'divergente' | 'inconclusivo';
    nomes_documento: string[];
    nomes_qsa: string[];
    nomes_nao_localizados_no_qsa: string[];
    nomes_nao_localizados_no_documento: string[];
    descricao: string;
  };
  qsa_adicional_necessario: boolean;
  qsa_adicional_motivo: string | null;
  evidencias: Array<{
    tipo: 'transferencia' | 'quadro_final' | 'registro' | 'qsa' | 'ato';
    texto: string;
    data: string | null;
    pagina: number | null;
    origem: string;
  }>;
  revisao_obrigatoria: boolean;
  motivos_revisao: string[];
  confianca: number | null;
}

function nomesSocietariosEquivalentes(a: unknown, b: unknown): boolean {
  const nomeA = normalizarBasico(a);
  const nomeB = normalizarBasico(b);
  return !!nomeA && !!nomeB && (nomeA === nomeB || nomeA.includes(nomeB) || nomeB.includes(nomeA));
}

function normalizarSociosParaAgente(socios: any): Array<Record<string, any>> {
  if (!Array.isArray(socios)) return [];
  return socios.map((socio: any) => ({
    nome: socio?.nome || socio?.nome_socio || socio?.razao_social || null,
    quotas: asNumber(socio?.quotas),
    percentual: asNumber(socio?.percentual),
    administrador: administradorSocietario(socio),
    qualificacao: socio?.qualificacao ? String(socio.qualificacao).trim() : null,
  })).filter((socio: any) => String(socio.nome || '').trim());
}

function formatarQuotasAgente(value: unknown): string {
  const quotas = asNumber(value);
  return quotas === null ? 'quantidade não identificada' : `${quotas.toLocaleString('pt-BR')} quotas`;
}

export function executarAgenteAnaliseSocietaria(
  contrato: any,
  atos: any,
  empresa?: any,
  sociosQsa: any[] = [],
): AnaliseSocietariaAuditavel {
  const dataContrato = parseDate(contrato?.data_registro);
  const numeroContrato = onlyDigits(contrato?.numero_arquivamento);
  const historico = (Array.isArray(atos?.historico_arquivamentos) ? atos.historico_arquivamentos : [])
    .map((item: any) => ({
      data: parseDate(item?.data),
      numero_arquivamento: item?.numero ? String(item.numero).trim() : null,
      tipo_ato: item?.tipo_ato ? String(item.tipo_ato).trim() : null,
      fonte: 'atos_junta' as const,
    }))
    .filter((item: any) => item.data || item.numero_arquivamento || item.tipo_ato);
  const dataAtoPrincipal = parseDate(atos?.data_registro);
  if (dataAtoPrincipal || atos?.numero_arquivamento) {
    historico.push({
      data: dataAtoPrincipal,
      numero_arquivamento: atos?.numero_arquivamento ? String(atos.numero_arquivamento).trim() : null,
      tipo_ato: atos?.tipo_ato ? String(atos.tipo_ato).trim() : null,
      fonte: 'atos_junta' as const,
    });
  }

  const eventosJunta = historico
    .filter((evento: any, index: number, array: any[]) => array.findIndex((outro: any) => (
      (evento.data && outro.data === evento.data) &&
      (onlyDigits(evento.numero_arquivamento) || onlyDigits(outro.numero_arquivamento)) &&
      onlyDigits(evento.numero_arquivamento) === onlyDigits(outro.numero_arquivamento)
    )) === index)
    .sort((a: any, b: any) => String(a.data || '').localeCompare(String(b.data || '')));
  const atoMaisRecente = eventosJunta.filter((evento: any) => evento.data).at(-1) || eventosJunta.at(-1) || null;
  const numeroAtoMaisRecente = onlyDigits(atoMaisRecente?.numero_arquivamento);
  const mesmaDataDoAtoMaisRecente = !!dataContrato && !!atoMaisRecente?.data && dataContrato === atoMaisRecente.data;
  const numerosConfiaveisParaComparacao = !!numeroContrato && !!numeroAtoMaisRecente;
  const correspondeAoMaisRecente = !!atoMaisRecente && (
    numerosConfiaveisParaComparacao
      ? numeroContrato === numeroAtoMaisRecente && (!dataContrato || !atoMaisRecente.data || mesmaDataDoAtoMaisRecente)
      : mesmaDataDoAtoMaisRecente
  );
  const documentoHistorico = !!dataContrato && !!atoMaisRecente?.data && dataContrato < atoMaisRecente.data && !correspondeAoMaisRecente;

  const quadroFinalExplicito = Array.isArray(contrato?.quadro_societario_final) && contrato.quadro_societario_final.length > 0;
  const quadroFinal = normalizarSociosParaAgente(quadroFinalExplicito ? contrato.quadro_societario_final : []);
  const sociosContrato = normalizarSociosParaAgente(contrato?.socios);
  const quadroAnterior = normalizarSociosParaAgente(
    (Array.isArray(contrato?.alteracoes_societarias) ? contrato.alteracoes_societarias : [])
      .map((alteracao: any) => alteracao?.cedente || alteracao?.socio_retirante)
      .filter(Boolean),
  );
  const nomesDocumento = quadroFinal.map((socio) => String(socio.nome));
  const nomesQsa = normalizarSociosParaAgente(sociosQsa).map((socio) => String(socio.nome));
  const nomesNaoLocalizadosNoQsa = nomesDocumento.filter((nome) => !nomesQsa.some((qsa) => nomesSocietariosEquivalentes(nome, qsa)));
  const nomesNaoLocalizadosNoDocumento = nomesQsa.filter((nome) => !nomesDocumento.some((documento) => nomesSocietariosEquivalentes(nome, documento)));
  // O QSA adicional só é necessário quando o último ato vigente declara
  // múltiplos sócios e pelo menos um deles não aparece no QSA. Contratos
  // históricos servem para a continuidade temporal, não para abrir nova
  // solicitação de QSA.
  const qsaAdicionalNecessario = correspondeAoMaisRecente
    && nomesQsa.length > 0
    && quadroFinal.length > 1
    && nomesNaoLocalizadosNoQsa.length > 0;

  let confrontoStatus: AnaliseSocietariaAuditavel['confronto_qsa']['status'] = 'inconclusivo';
  let statusDocumento: AnaliseSocietariaAuditavel['status_documento'] = 'indeterminado';
  if (documentoHistorico) {
    statusDocumento = 'historico';
    confrontoStatus = 'historico';
  } else if (correspondeAoMaisRecente) {
    statusDocumento = 'atual';
    if (quadroFinalExplicito && nomesQsa.length > 0) {
      confrontoStatus = nomesNaoLocalizadosNoQsa.length === 0 && nomesNaoLocalizadosNoDocumento.length === 0 ? 'confirmado' : 'divergente';
    }
  } else if (!atoMaisRecente && dataContrato) {
    statusDocumento = 'atual';
    if (quadroFinalExplicito && nomesQsa.length > 0) {
      confrontoStatus = nomesNaoLocalizadosNoQsa.length === 0 && nomesNaoLocalizadosNoDocumento.length === 0 ? 'confirmado' : 'divergente';
    }
  }

  // Quando o documento corresponde ao ato mais recente, seu quadro final é a
  // fonte primária do estado atual. O QSA é usado para confirmar essa leitura;
  // nunca substitui o quadro final por si só. Para documentos históricos, o
  // QSA vigente continua sendo o estado atual de referência.
  const estadoAtualSocios = statusDocumento === 'atual' && quadroFinal.length > 0
    ? quadroFinal
    : nomesQsa.length > 0 ? normalizarSociosParaAgente(sociosQsa) : [];
  const estadoAtualFonte: AnaliseSocietariaAuditavel['estado_atual']['fonte'] = statusDocumento === 'atual' && quadroFinal.length > 0
    ? 'contrato'
    : nomesQsa.length > 0 ? 'qsa' : 'indeterminado';
  const estadoAtualDescricao = estadoAtualFonte === 'contrato'
    ? 'O quadro final da última alteração/contrato vigente é a fonte primária do estado atual; o QSA foi usado para conferência.'
    : estadoAtualFonte === 'qsa'
      ? 'Este documento é histórico ou não possui quadro final vigente; o QSA permanece como referência do estado atual.'
      : 'Não foi possível determinar o estado atual sem QSA ou quadro final expressamente identificado.';

  const alteracoes = Array.isArray(contrato?.alteracoes_societarias) ? contrato.alteracoes_societarias : [];
  const descricaoAlteracoes = alteracoes.map((alteracao: any) => {
    const cedente = alteracao?.cedente?.nome || alteracao?.socio_retirante?.nome || null;
    const cessionario = alteracao?.cessionario?.nome || alteracao?.socio_admitido?.nome || null;
    if (cedente && cessionario) return `retirada de ${cedente} e transferência de ${formatarQuotasAgente(alteracao?.quotas_transferidas)} para ${cessionario}`;
    if (cedente) return `retirada de ${cedente}, sem cessionário expressamente identificado`;
    if (cessionario) return `entrada de ${cessionario}, sem cedente expressamente identificado`;
    return 'alteração societária sem partes identificadas de forma suficiente';
  });
  const diagnosticoPartes = [
    contrato?.tipo_ato ? `Tipo de ato: ${contrato.tipo_ato}.` : null,
    dataContrato ? `Data de registro identificada: ${dataContrato}.` : 'Data de registro não identificada com segurança.',
    contrato?.numero_arquivamento ? `Número de arquivamento: ${contrato.numero_arquivamento}.` : 'Número de arquivamento não identificado com segurança.',
    descricaoAlteracoes.length ? `O ato praticou: ${descricaoAlteracoes.join('; ')}.` : 'Não foi identificada alteração societária expressa no documento.',
    quadroFinal.length ? `Quadro final declarado: ${quadroFinal.map((socio) => `${socio.nome}${socio.quotas !== null ? ` com ${formatarQuotasAgente(socio.quotas)}` : ''}${socio.percentual !== null ? ` (${socio.percentual}%)` : ''}`).join('; ')}.` : 'O quadro societário final não foi identificado expressamente.',
    confrontoStatus === 'confirmado' ? 'O quadro final do ato mais recente confere com o QSA vigente.' : null,
    confrontoStatus === 'historico' ? 'Este documento é histórico e não foi usado para invalidar o QSA vigente.' : null,
    confrontoStatus === 'divergente' ? 'O quadro final do ato mais recente não confere integralmente com o QSA vigente.' : null,
  ].filter(Boolean) as string[];

  const linhaTempo: AnaliseSocietariaAuditavel['linha_tempo_societaria'] = eventosJunta.map((evento: any) => ({
    data: evento.data,
    numero_arquivamento: evento.numero_arquivamento,
    tipo_ato: evento.tipo_ato,
    fonte: 'atos_junta' as const,
    e_ato_mais_recente: evento === atoMaisRecente,
    corresponde_ao_contrato: (!!numeroContrato && !!onlyDigits(evento.numero_arquivamento) && numeroContrato === onlyDigits(evento.numero_arquivamento)) || (!!dataContrato && !!evento.data && dataContrato === evento.data),
  }));
  if (dataContrato && !linhaTempo.some((evento) => evento.corresponde_ao_contrato)) {
    linhaTempo.push({
      data: dataContrato,
      numero_arquivamento: contrato?.numero_arquivamento || null,
      tipo_ato: contrato?.tipo_ato || null,
      fonte: 'contrato',
      e_ato_mais_recente: !atoMaisRecente?.data || dataContrato >= atoMaisRecente.data,
      corresponde_ao_contrato: true,
    });
  }
  linhaTempo.sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')));

  const evidencias = [
    ...alteracoes.filter((alteracao: any) => alteracao?.evidencia).map((alteracao: any) => ({
      tipo: 'transferencia' as const,
      texto: String(alteracao.evidencia).trim(),
      data: dataContrato,
      pagina: Number.isFinite(Number(alteracao?.pagina)) ? Number(alteracao.pagina) : null,
      origem: 'Contrato/Alteração',
    })),
    ...(contrato?.evidencia_quadro_societario ? [{ tipo: 'quadro_final' as const, texto: String(contrato.evidencia_quadro_societario).trim(), data: dataContrato, pagina: null, origem: 'Contrato/Alteração' }] : []),
    ...(atos?.evidencia_ato_mais_recente ? [{ tipo: 'ato' as const, texto: String(atos.evidencia_ato_mais_recente).trim(), data: atoMaisRecente?.data || null, pagina: null, origem: 'Atos da Junta Comercial' }] : []),
  ].filter((evidencia) => evidencia.texto);

  const motivosRevisao: string[] = [];
  const conflitosInternos = [
    ...(Array.isArray(contrato?.conflitos_internos) ? contrato.conflitos_internos : []),
    ...(Array.isArray(atos?.conflitos_internos) ? atos.conflitos_internos : []),
  ].map((item: any) => String(item || '').trim()).filter(Boolean);
  if (!dataContrato) motivosRevisao.push('Data de registro do contrato/alteração não identificada com segurança.');
  if (!atoMaisRecente?.data && !dataContrato) motivosRevisao.push('Não foi possível estabelecer o ato mais recente da cadeia societária.');
  if (statusDocumento === 'atual' && !quadroFinalExplicito) motivosRevisao.push('O documento mais recente não apresentou quadro societário final expresso.');
  if (statusDocumento === 'atual' && nomesQsa.length === 0) motivosRevisao.push('Não há QSA vigente disponível para o confronto do estado atual.');
  if (confrontoStatus === 'divergente') motivosRevisao.push('O quadro final do ato mais recente diverge do QSA vigente.');
  if (
    !alteracoes.length
    && !quadroFinalExplicito
    && statusDocumento !== 'historico'
    && /alterac|consolid/i.test(normalizeText(contrato?.tipo_ato || ''))
  ) {
    motivosRevisao.push('O documento foi classificado como alteração/consolidação, mas não houve alteração societária expressamente extraída.');
  }
  if (statusDocumento === 'indeterminado' && dataContrato) {
    motivosRevisao.push('Não foi possível confirmar se este documento corresponde ao ato mais recente da Junta Comercial; conferir manualmente antes de considerar outro documento como o vigente.');
  }
  for (const conflito of conflitosInternos) motivosRevisao.push(`Conflito interno informado na leitura: ${conflito}`);

  return {
    status_documento: statusDocumento,
    ato_praticado: descricaoAlteracoes.length ? descricaoAlteracoes.join('; ') : null,
    diagnostico_objetivo: diagnosticoPartes.join(' '),
    linha_tempo_societaria: linhaTempo,
    ato_mais_recente: atoMaisRecente ? {
      data: atoMaisRecente.data,
      numero_arquivamento: atoMaisRecente.numero_arquivamento,
      tipo_ato: atoMaisRecente.tipo_ato,
    } : null,
    quadro_anterior: quadroAnterior,
    quadro_final_documento: quadroFinal,
    estado_atual: {
      fonte: estadoAtualFonte,
      data_referencia: atoMaisRecente?.data || dataContrato || null,
      socios: estadoAtualSocios,
      descricao: estadoAtualDescricao,
    },
    confronto_qsa: {
      status: confrontoStatus,
      nomes_documento: nomesDocumento,
      nomes_qsa: nomesQsa,
      nomes_nao_localizados_no_qsa: nomesNaoLocalizadosNoQsa,
      nomes_nao_localizados_no_documento: nomesNaoLocalizadosNoDocumento,
      descricao: confrontoStatus === 'confirmado'
        ? 'O quadro societário final do ato mais recente confere com o QSA vigente.'
        : confrontoStatus === 'historico'
          ? 'Documento histórico; a comparação com o QSA vigente foi deliberadamente não aplicada ao quadro antigo.'
          : confrontoStatus === 'divergente'
            ? 'Há diferença entre o quadro final do ato mais recente e o QSA vigente.'
            : 'O confronto não pode ser concluído com segurança com as evidências disponíveis.',
    },
    evidencias,
    qsa_adicional_necessario: qsaAdicionalNecessario,
    qsa_adicional_motivo: qsaAdicionalNecessario
      ? 'A última alteração vigente declara mais de um sócio e pelo menos uma pessoa do quadro final não foi localizada no QSA.'
      : null,
    revisao_obrigatoria: motivosRevisao.length > 0,
    motivos_revisao: motivosRevisao,
    confianca: normalizarConfianca(contrato?.confianca) === null || normalizarConfianca(atos?.confianca) === null
      ? normalizarConfianca(contrato?.confianca) ?? normalizarConfianca(atos?.confianca)
      : Math.min(normalizarConfianca(contrato?.confianca) as number, normalizarConfianca(atos?.confianca) as number),
  };
}

function qualificacaoSocietariaNormalizada(value: unknown): string {
  const texto = normalizarBasico(value);
  if (!texto) return '';
  if (/administrador|administradora|diretor|diretora|presidente|titular/.test(texto)) {
    return texto.includes('socio') || texto.includes('socia') ? 'socio_administrador' : 'administrador';
  }
  if (/socio|socia|quotista/.test(texto)) return 'socio';
  return texto;
}

function administradorSocietario(socio: any): boolean | null {
  const flags = [socio?.administrador, socio?.socio_administrador, socio?.representante_legal]
    .map(normalizarBooleano)
    .filter((value) => value !== null) as boolean[];
  if (flags.length) return flags.some(Boolean);
  const qualificacao = qualificacaoSocietariaNormalizada(
    socio?.qualificacao || socio?.qualificacao_socio || socio?.cargo || socio?.funcao,
  );
  if (!qualificacao) return null;
  return qualificacao.includes('administrador');
}

function socioNormalizado(socio: any): { nome: string; qualificacao: string; administrador: boolean | null; original: any } {
  return {
    nome: normalizarBasico(socio?.nome || socio?.nome_socio || socio?.razao_social),
    qualificacao: qualificacaoSocietariaNormalizada(socio?.qualificacao || socio?.qualificacao_socio || socio?.cargo || socio?.funcao),
    administrador: administradorSocietario(socio),
    original: socio,
  };
}

function encontrarArraysQsa(value: unknown, profundidade = 0): any[] {
  if (profundidade > 4 || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'object') return [];
  const objeto = value as Record<string, unknown>;
  const chavesPrioritarias = ['qsa', 'socios', 'socios_receita', 'quadro_societario', 'quadroSocietario', 'administradores'];
  for (const chave of chavesPrioritarias) {
    if (Array.isArray(objeto[chave])) return objeto[chave] as any[];
  }
  for (const nested of Object.values(objeto)) {
    const encontrado = encontrarArraysQsa(nested, profundidade + 1);
    if (encontrado.length) return encontrado;
  }
  return [];
}

function consolidarSociosSincronizados(empresa: any, sociosBanco: any[]): any[] {
  const fontesReceita = [
    empresa?.socios_receita,
    empresa?.dados_extra_receita,
    empresa?.dados_fontes_cnpj,
    empresa?.dados_receita,
  ];
  const sociosReceita = fontesReceita.flatMap((fonte) => encontrarArraysQsa(fonte));
  const todos = [...(Array.isArray(sociosBanco) ? sociosBanco : []), ...sociosReceita];
  const porNome = new Map<string, any>();

  for (const socio of todos) {
    const nome = String(socio?.nome || socio?.nome_socio || socio?.nomeSocio || socio?.socio || socio?.razao_social || '').trim();
    const chave = normalizarBasico(nome);
    if (!chave || chave === 'nao identificado') continue;
    const qualificacao = socio?.qualificacao || socio?.qualificacao_socio || socio?.qualificacaoSocio || socio?.cargo || socio?.descricao_qualificacao || null;
    const atual = porNome.get(chave) || {};
    porNome.set(chave, {
      nome: atual.nome || nome,
      qualificacao: atual.qualificacao || qualificacao,
      cargo: atual.cargo || socio?.cargo || qualificacao,
      administrador: atual.administrador ?? socio?.administrador ?? (/administrador|administradora|titular/i.test(String(qualificacao || '')) ? true : null),
      representante_legal: atual.representante_legal ?? socio?.representante_legal ?? null,
      fonte_dados: atual.fonte_dados || socio?.fonte_dados || (sociosBanco.includes(socio) ? 'socios_empresa' : 'receita_json'),
    });
  }
  return Array.from(porNome.values());
}

export function validarQsaExtraida(empresa: any, sociosReceita: any[], dados: any): AlertaDocumental[] {
  const alertas: AlertaDocumental[] = [];
  if (dados?.documento_compativel === false) {
    alertas.push({ codigo: 'qsa_documento_incompativel', mensagem: 'O arquivo não foi reconhecido como QSA ou quadro societário compatível.', severidade: 'alta', recomendacao: 'Reclassificar o arquivo ou anexar o QSA correto.' });
  }

  const cnpjDocumento = onlyDigits(dados?.cnpj);
  const cnpjReceita = onlyDigits(empresa?.cnpj);
  if (!cnpjDocumento) {
    alertas.push({ codigo: 'qsa_cnpj_nao_extraido', campo: 'cnpj', mensagem: 'Não foi possível confirmar o CNPJ no QSA.', severidade: 'alta', recomendacao: 'Anexar QSA legível que identifique o CNPJ da empresa.' });
  } else if (cnpjReceita && cnpjDocumento !== cnpjReceita) {
    alertas.push({
      codigo: 'qsa_cnpj_divergente', campo: 'cnpj',
      mensagem: 'O CNPJ extraído do QSA não corresponde ao CNPJ sincronizado da empresa.',
      severidade: 'critica', valor_documento: dados?.cnpj, valor_receita: empresa?.cnpj,
      recomendacao: 'Interromper o uso do documento e anexar o QSA correto.',
    });
  }

  const sociosDocumento = (Array.isArray(dados?.socios) ? dados.socios : [])
    .map(socioNormalizado)
    .filter((socio: ReturnType<typeof socioNormalizado>) => socio.nome && socio.nome !== 'nao identificado');
  const sociosBase = (Array.isArray(sociosReceita) ? sociosReceita : [])
    .map(socioNormalizado)
    .filter((socio: ReturnType<typeof socioNormalizado>) => socio.nome && socio.nome !== 'nao identificado');

  // REGRA FECHADA DA ETAPA 1:
  // o QSA confirma somente o vínculo com o CNPJ, os integrantes e quem exerce
  // a administração. Razão social e capital podem ser extraídos para auditoria,
  // mas são validados pelo Cartão CNPJ/ato societário e não bloqueiam o QSA.
  // CPF, RG, endereço, estado civil,
  // cônjuge, profissão, contato e qualquer outro dado pessoal não participam desta
  // validação e jamais podem bloquear o avanço.
  //
  // CORREÇÃO (31/08/2026, pedido explícito do usuário -- QSA de empresa
  // Empresário Individual marcado como "Revisão necessária: Não foi possível
  // identificar os nomes dos sócios", quando na verdade o documento respondeu
  // corretamente "A NATUREZA JURÍDICA NÃO PERMITE O PREENCHIMENTO DO QSA"):
  // naturezas jurídicas como Empresário (Individual) não têm sócios no
  // sentido societário -- o titular é o próprio CNPJ, não um "sócio" a ser
  // listado. Zero sócios extraídos, nesse caso, é a leitura completa e
  // correta do documento oficial, não uma falha de extração. `qsa_nao_aplicavel`
  // vem do próprio conteúdo do documento (ver parseQsa/promptQsa), nunca de
  // uma suposição sobre o tipo de empresa feita fora do texto lido.
  const natureza = normalizarBasico(empresa?.natureza_juridica);
  const empresaIndividual = empresa?.opcao_mei === true
    || (!/eireli|responsabilidade limitada/.test(natureza)
      && /microempreendedor individual|empresario\s*\(?individual\)?/.test(natureza));
  const qsaNaoAplicavelConfirmado = empresaIndividual && sociosDocumento.length === 0;

  if (dados?.qsa_nao_aplicavel === true && !empresaIndividual) {
    alertas.push({
      codigo: 'qsa_nao_aplicavel_divergente_natureza',
      campo: 'socios',
      mensagem: 'O documento informa QSA não aplicável, mas a natureza jurídica cadastrada exige quadro de integrantes.',
      severidade: 'critica',
      recomendacao: 'Conferir a natureza jurídica no Cartão CNPJ e anexar o QSA correspondente.',
    });
  } else if (qsaNaoAplicavelConfirmado) {
    alertas.push({
      codigo: 'qsa_nao_aplicavel_natureza_juridica',
      campo: 'socios',
      mensagem: 'A natureza jurídica desta empresa não permite o preenchimento do QSA (sem sócios no sentido societário) -- resposta oficial da consulta à Receita Federal. Nenhum sócio é exigido neste QSA.',
      severidade: 'baixa',
    });
  } else if (empresaIndividual && sociosDocumento.length > 0) {
    alertas.push({
      codigo: 'qsa_integrantes_indevidos_empresa_individual',
      campo: 'socios',
      mensagem: 'O QSA trouxe integrantes para uma empresa individual; o documento ou a natureza jurídica precisa ser conferido.',
      severidade: 'alta',
      recomendacao: 'Conferir o Cartão CNPJ e o QSA antes de validar o titular.',
    });
  } else if (!sociosDocumento.length) {
    alertas.push({
      codigo: 'qsa_socios_nao_extraidos',
      campo: 'socios',
      mensagem: 'Não foi possível identificar os nomes dos sócios no QSA.',
      severidade: 'alta',
      recomendacao: 'Reprocessar o QSA ou anexar uma versão legível que permita conferir os nomes e o Sócio-Administrador.',
    });
  } else {
    for (const socioDoc of sociosDocumento) {
      const socioBase = sociosBase.find((item) => item.nome === socioDoc.nome);
      if (sociosBase.length > 0 && !socioBase) {
        alertas.push({
          codigo: 'qsa_socio_documento_nao_encontrado_receita', campo: 'socios',
          mensagem: `O sócio "${socioDoc.original?.nome || 'não identificado'}" consta no QSA, mas não foi localizado no quadro societário sincronizado.`,
          severidade: 'alta', valor_documento: { nome: socioDoc.original?.nome },
          recomendacao: 'Verificar se houve alteração societária e atualizar os dados oficiais antes de concluir a Etapa 1.',
        });
        continue;
      }
      // Sem uma base societária sincronizada, o próprio QSA é a evidência
      // primária dos integrantes. A comparação individual só existe quando
      // há uma contraparte oficial carregada; a administração continua sendo
      // exigida e validada diretamente no documento logo abaixo.
      if (!socioBase) continue;

      // A qualificação genérica não é requisito isolado. Ela só é usada para
      // identificar a condição de administrador, que é o único vínculo funcional
      // exigido nesta etapa.
      if (socioBase.administrador === true && socioDoc.administrador === null) {
        alertas.push({
          codigo: 'qsa_administrador_nao_identificado',
          campo: 'administrador',
          mensagem: `Não foi possível confirmar no QSA que "${socioDoc.original?.nome || 'o sócio'}" é Sócio-Administrador.`,
          severidade: 'alta',
          recomendacao: 'Reprocessar o QSA e confirmar quem possui poderes de administração.',
        });
      } else if (socioDoc.administrador !== null && socioBase.administrador !== null && socioDoc.administrador !== socioBase.administrador) {
        alertas.push({
          codigo: 'qsa_administrador_divergente', campo: 'administrador',
          mensagem: `A condição de Sócio-Administrador de "${socioDoc.original?.nome}" diverge entre o QSA e o cadastro sincronizado.`,
          severidade: 'alta', valor_documento: socioDoc.administrador, valor_receita: socioBase.administrador,
          recomendacao: 'Conferir quem possui poderes de administração antes de avançar.',
        });
      }
    }

    // Só faz a comparação individual de ausências quando o documento realmente
    // forneceu uma lista de sócios. Se a extração falhou por completo, gerar uma
    // divergência por cada nome da Receita é falso positivo e foi a regressão vista
    // no relatório (ex.: "consta no cadastro, mas não aparece no QSA analisado").
    for (const socioBase of sociosBase) {
      if (!sociosDocumento.some((socioDoc: ReturnType<typeof socioNormalizado>) => socioDoc.nome === socioBase.nome)) {
        alertas.push({
          codigo: 'qsa_socio_receita_ausente_documento', campo: 'socios',
          mensagem: `O sócio "${socioBase.original?.nome || 'não identificado'}" consta no cadastro sincronizado, mas não aparece no QSA analisado.`,
          severidade: 'alta', valor_receita: { nome: socioBase.original?.nome },
          recomendacao: 'Solicitar QSA atualizado antes de concluir a Etapa 1.',
        });
      }
    }

    if (!sociosDocumento.some((socio: ReturnType<typeof socioNormalizado>) => socio.administrador === true)) {
      alertas.push({
        codigo: 'qsa_administrador_nao_identificado',
        campo: 'administrador',
        mensagem: 'Não foi possível confirmar quem administra a empresa no QSA.',
        severidade: 'alta',
        recomendacao: 'Anexar QSA legível que identifique o administrador, diretor, presidente ou titular aplicável.',
      });
    }
  }

  // Confiança baixa só é impeditiva quando falta algum campo institucional
  // obrigatório. Se CNPJ, razão social, capital, sócios e administrador foram
  // extraídos e convergem, o valor estatístico de confiança não cria uma trava
  // artificial por si só.
  const confiancaExtracao = normalizarConfianca(dados?.confianca);
  const documentoTemAdministrador = sociosDocumento.some((socio: ReturnType<typeof socioNormalizado>) => socio.administrador === true);
  // Quando a natureza jurídica não permite QSA, a ausência de sócios/administrador
  // no documento não conta como campo institucional faltando -- não há sócio a
  // exigir (ver a checagem de `qsa_nao_aplicavel` acima).
  const faltouCampoInstitucional = !cnpjDocumento
    || (!qsaNaoAplicavelConfirmado && (!sociosDocumento.length || !documentoTemAdministrador));
  if ((dados?.extracao_parcial === true || (confiancaExtracao !== null && confiancaExtracao < 0.6)) && faltouCampoInstitucional) {
    alertas.push({
      codigo: 'qsa_extracao_inconclusiva',
      mensagem: 'A leitura automática do QSA ficou inconclusiva para um ou mais campos institucionais obrigatórios.',
      severidade: 'alta',
      recomendacao: 'Reprocessar o documento ou anexar uma versão legível. Dados pessoais dos sócios não são exigidos nesta etapa.',
    });
  }

  return uniqueAlerts(alertas);
}

export function validarSimplesExtraido(empresa: any, dados: any): AlertaDocumental[] {
  const alertas: AlertaDocumental[] = [];
  if (dados?.documento_compativel === false) {
    alertas.push({ codigo: 'simples_documento_incompativel', mensagem: 'O arquivo não foi reconhecido como comprovante do Simples Nacional.', severidade: 'alta', recomendacao: 'Reclassificar o arquivo ou anexar o comprovante correto.' });
  }
  const confiancaExtracao = normalizarConfianca(dados?.confianca);
  if (dados?.extracao_parcial === true || (confiancaExtracao !== null && confiancaExtracao < 0.6)) {
    alertas.push({ codigo: 'simples_extracao_inconclusiva', mensagem: 'A leitura automática do enquadramento tributário ficou abaixo do nível mínimo de confiança.', severidade: 'alta', recomendacao: 'Executar novamente o leitor interno; se o arquivo continuar ilegível, encaminhar para revisão humana.' });
  }
  const cnpjDocumento = onlyDigits(dados?.cnpj);
  const cnpjReceita = onlyDigits(empresa?.cnpj);
  if (cnpjDocumento && cnpjReceita && cnpjDocumento !== cnpjReceita) {
    alertas.push({ codigo: 'simples_cnpj_divergente', campo: 'cnpj', mensagem: 'O comprovante do Simples Nacional pertence a outro CNPJ.', severidade: 'critica', valor_documento: dados?.cnpj, valor_receita: empresa?.cnpj, recomendacao: 'Solicitar o comprovante correto do CNPJ analisado.' });
  }

  if (normalizarBooleano(dados?.agendamento_exclusao) === true) {
    alertas.push({ codigo: 'simples_exclusao_agendada', campo: 'agendamento_exclusao', mensagem: 'O documento informa agendamento de exclusão do Simples Nacional.', severidade: 'critica', valor_documento: true, recomendacao: 'Verificar imediatamente a causa, a data efetiva e os impactos tributários e de crédito.' });
  }

  const situacaoDocumento = normalizarSituacaoSimples(dados?.situacao_simples);
  const optanteReceita = normalizarBooleano(
    empresa?.opcao_pelo_simples ??
    empresa?.opcao_simples ??
    empresa?.dados_extra_receita?.payload_normalizado?.opcao_pelo_simples ??
    empresa?.dados_extra_receita?.dados_consolidados?.opcao_pelo_simples ??
    empresa?.dados_receita?.opcao_pelo_simples,
  );

  if ((situacaoDocumento === 'excluido' || situacaoDocumento === 'nao_optante') && optanteReceita === true) {
    alertas.push({ codigo: 'simples_situacao_divergente_receita', campo: 'situacao_simples', mensagem: 'O comprovante indica empresa não optante/excluída, enquanto o cadastro da Receita registra opção pelo Simples.', severidade: 'alta', valor_documento: dados?.situacao_simples, valor_receita: true, recomendacao: 'Consultar a situação atual no Portal do Simples Nacional e atualizar o cadastro.' });
  } else if (situacaoDocumento === 'optante' && optanteReceita === false) {
    alertas.push({ codigo: 'simples_situacao_inversa_receita', campo: 'situacao_simples', mensagem: 'O comprovante indica opção pelo Simples, mas o cadastro disponível não confirma essa condição.', severidade: 'media', valor_documento: dados?.situacao_simples, valor_receita: false, recomendacao: 'Atualizar a consulta cadastral e confirmar a vigência da opção.' });
  }

  if (!cnpjDocumento) alertas.push({ codigo: 'simples_cnpj_nao_extraido', campo: 'cnpj', mensagem: 'Não foi possível confirmar o CNPJ no comprovante do Simples Nacional.', severidade: 'media', recomendacao: 'Realizar conferência humana do documento.' });
  return uniqueAlerts(alertas);
}

export function validarAtosJuntaExtraidos(empresa: any, dados: any): AlertaDocumental[] {
  const alertas: AlertaDocumental[] = [];
  if (dados?.documento_compativel === false) {
    alertas.push({ codigo: 'junta_documento_incompativel', mensagem: 'O arquivo não foi reconhecido como ato da Junta Comercial.', severidade: 'alta', recomendacao: 'Reclassificar o arquivo ou anexar o ato registrado correto.' });
  }
  const confiancaExtracao = normalizarConfianca(dados?.confianca);
  if (dados?.extracao_parcial === true || (confiancaExtracao !== null && confiancaExtracao < 0.6)) {
    alertas.push({ codigo: 'junta_extracao_inconclusiva', mensagem: 'A leitura automática dos Atos da Junta ficou abaixo do nível mínimo de confiança.', severidade: 'alta', recomendacao: 'Executar novamente o leitor interno; se o arquivo continuar ilegível, encaminhar para revisão humana.' });
  }
  const cnpjDocumento = onlyDigits(dados?.cnpj);
  const cnpjReceita = onlyDigits(empresa?.cnpj);
  if (cnpjDocumento && cnpjReceita && cnpjDocumento !== cnpjReceita) {
    alertas.push({ codigo: 'junta_cnpj_divergente', campo: 'cnpj', mensagem: 'O ato da Junta Comercial pertence a outro CNPJ.', severidade: 'critica', valor_documento: dados?.cnpj, valor_receita: empresa?.cnpj, recomendacao: 'Descartar o documento para esta análise e solicitar o ato correto.' });
  }

  const nomeDocumento = normalizarNomeEmpresarial(dados?.razao_social);
  const nomeReceita = normalizarNomeEmpresarial(empresa?.razao_social);
  if (nomeDocumento && nomeReceita && nomeDocumento !== nomeReceita) {
    alertas.push({ codigo: 'junta_razao_social_divergente', campo: 'razao_social', mensagem: 'A razão social do ato da Junta diverge da razão social cadastrada.', severidade: 'alta', valor_documento: dados?.razao_social, valor_receita: empresa?.razao_social, recomendacao: 'Confirmar eventual alteração de nome empresarial e atualizar a Receita/cadastro.' });
  }

  const capital = capitalDivergente(dados?.capital_social_atual, empresa?.capital_social);
  if (capital.significativo) {
    alertas.push({ codigo: 'junta_capital_social_significativamente_divergente', campo: 'capital_social_atual', mensagem: 'O capital social atual do ato diverge significativamente do valor cadastrado na Receita Federal.', severidade: 'media', valor_documento: capital.documento, valor_receita: capital.receita, recomendacao: 'Validar o arquivamento do ato e sincronizar o capital social atualizado.' });
  }

  const dataRegistro = parseDate(dados?.data_registro);
  const dias = diffDays(dataRegistro);
  const sociosAlterados = Array.isArray(dados?.socios_alterados) ? dados.socios_alterados.filter(Boolean) : [];
  const houveAlteracaoCapital = capital.divergente;
  if (dias !== null && dias >= 0 && dias <= 30 && (sociosAlterados.length > 0 || houveAlteracaoCapital)) {
    alertas.push({ codigo: 'junta_alteracao_recente_relevante', campo: 'data_registro', mensagem: 'Foi identificado ato societário recente, com alteração de sócios ou de capital social.', severidade: 'alta', valor_documento: dataRegistro, recomendacao: 'Solicitar documentos cadastrais atualizados e validar os efeitos da alteração antes da decisão de crédito.' });
  }

  // O CNPJ não é obrigatório nos Atos da Junta: algumas Juntas, como a do DF,
  // não o exibem. A identidade societária desta etapa será validada por NIRE e data.
  if (!onlyDigits(dados?.nire)) alertas.push({ codigo: 'junta_nire_nao_extraido', campo: 'nire', mensagem: 'Não foi possível identificar o NIRE nos Atos da Junta Comercial.', severidade: 'alta', recomendacao: 'Anexar certidão/lista de atos que permita identificar o NIRE ou o registro de constituição.' });
  if (!parseDate(dados?.data_registro) && !(Array.isArray(dados?.historico_arquivamentos) && dados.historico_arquivamentos.length)) alertas.push({ codigo: 'junta_data_ato_nao_extraida', campo: 'data_registro', mensagem: 'Não foi possível identificar as datas dos atos registrados na Junta Comercial.', severidade: 'alta', recomendacao: 'Anexar certidão/lista de arquivamentos legível.' });

  // Histórico completo de arquivamentos (ex: certidão "Lista de Arquivamentos"):
  // documenta quantas alterações já houve e quando foi a mais recente -- info
  // relevante para a jornada da empresa mesmo quando não é um ato isolado.
  const historico = Array.isArray(dados?.historico_arquivamentos) ? dados.historico_arquivamentos.filter(Boolean) : [];
  if (historico.length) {
    const alteracoes = historico.filter((i: any) => /alterac/i.test(normalizeText(i?.tipo_ato || '')));
    const maisRecente = historico[historico.length - 1];
    const diasUltimoAto = diffDays(parseDate(maisRecente?.data));
    alertas.push({
      codigo: 'junta_historico_arquivamentos',
      campo: 'historico_arquivamentos',
      mensagem: `Histórico da Junta Comercial: ${historico.length} arquivamento(s) registrado(s), sendo ${alteracoes.length} alteração(ões). Ato mais recente: ${maisRecente?.tipo_ato || 'não identificado'} em ${maisRecente?.data || 'data não informada'}.`,
      severidade: diasUltimoAto !== null && diasUltimoAto >= 0 && diasUltimoAto <= 30 ? 'media' : 'baixa',
      valor_documento: historico,
      recomendacao: diasUltimoAto !== null && diasUltimoAto <= 30 ? 'Alteração registrada há menos de 30 dias -- confirmar se já refletida no cadastro e nos documentos societários.' : undefined,
    });
  }

  return uniqueAlerts(alertas);
}


export function validarContratoComAtosJunta(contrato: any, atos: any, empresa?: any, sociosQsa: any[] = []): AlertaDocumental[] {
  const alertas: AlertaDocumental[] = [];
  if (contrato?.documento_compativel === false) {
    alertas.push({ codigo: 'contrato_societario_incompativel', mensagem: 'O arquivo não foi reconhecido como Contrato Social, Alteração Contratual ou Consolidação.', severidade: 'alta', recomendacao: 'Anexar o contrato ou a alteração contratual registrada correspondente.' });
  }
  if (atos?.documento_compativel === false) {
    alertas.push({ codigo: 'atos_junta_incompativel', mensagem: 'O arquivo não foi reconhecido como certidão ou lista de atos da Junta Comercial.', severidade: 'alta', recomendacao: 'Anexar a certidão/lista de arquivamentos correta.' });
  }

  const nireContrato = onlyDigits(contrato?.nire);
  const nireJunta = onlyDigits(atos?.nire);
  if (!nireContrato) {
    alertas.push({ codigo: 'contrato_nire_nao_identificado', campo: 'nire', mensagem: 'Não foi possível identificar o NIRE no contrato/alteração social.', severidade: 'alta', recomendacao: 'Conferir a página de registro/certificação do documento societário.' });
  }
  if (!nireJunta) {
    alertas.push({ codigo: 'junta_nire_nao_identificado', campo: 'nire', mensagem: 'Não foi possível identificar o NIRE na certidão/lista de atos da Junta Comercial.', severidade: 'alta', recomendacao: 'Anexar certidão que apresente o NIRE ou o registro de constituição.' });
  }
  if (nireContrato && nireJunta && nireContrato !== nireJunta) {
    alertas.push({
      codigo: 'contrato_junta_nire_divergente',
      campo: 'nire',
      mensagem: 'O NIRE do contrato/alteração não corresponde ao NIRE identificado nos Atos da Junta Comercial.',
      severidade: 'critica',
      valor_documento: contrato?.nire,
      valor_receita: atos?.nire,
      recomendacao: 'Interromper a validação e anexar os documentos societários da mesma empresa.',
    });
  }

  const dataContrato = parseDate(contrato?.data_registro);
  const historico = Array.isArray(atos?.historico_arquivamentos) ? atos.historico_arquivamentos : [];
  const datasJunta = new Set(historico.map((item: any) => parseDate(item?.data)).filter(Boolean));
  const dataJuntaPrincipal = parseDate(atos?.data_registro);
  if (dataJuntaPrincipal) datasJunta.add(dataJuntaPrincipal);

  if (!dataContrato) {
    alertas.push({ codigo: 'contrato_data_registro_nao_identificada', campo: 'data_registro', mensagem: 'Não foi possível identificar a data de registro da alteração/contrato social.', severidade: 'alta', recomendacao: 'Conferir a certificação de registro na última página do documento.' });
  } else if (!datasJunta.has(dataContrato)) {
    alertas.push({
      codigo: 'contrato_junta_data_divergente',
      campo: 'data_registro',
      mensagem: 'A data de registro do contrato/alteração não foi localizada no histórico dos Atos da Junta Comercial.',
      severidade: 'alta',
      valor_documento: dataContrato,
      valor_receita: Array.from(datasJunta),
      recomendacao: 'Confirmar se a certidão da Junta está atualizada e corresponde ao último contrato/alteração anexado.',
    });
  }

  // CNPJ é apenas confirmação adicional. A ausência no documento da Junta não
  // gera pendência porque algumas Juntas, como a do Distrito Federal, omitem o
  // CNPJ na lista de atos. Divergência só existe quando ambos os documentos o exibem.
  const cnpjContrato = onlyDigits(contrato?.cnpj);
  const cnpjJunta = onlyDigits(atos?.cnpj);
  if (cnpjContrato && cnpjJunta && cnpjContrato !== cnpjJunta) {
    alertas.push({ codigo: 'contrato_junta_cnpj_divergente', campo: 'cnpj', mensagem: 'Os documentos societários apresentam CNPJs diferentes.', severidade: 'critica', valor_documento: contrato?.cnpj, valor_receita: atos?.cnpj, recomendacao: 'Anexar documentos pertencentes à mesma empresa.' });
  }

  const cnpjEmpresa = onlyDigits(empresa?.cnpj);
  if (cnpjContrato && cnpjEmpresa && cnpjContrato !== cnpjEmpresa) {
    alertas.push({ codigo: 'contrato_cnpj_empresa_divergente', campo: 'cnpj', mensagem: 'O CNPJ do contrato/alteração não corresponde à empresa analisada.', severidade: 'critica', valor_documento: contrato?.cnpj, valor_receita: empresa?.cnpj, recomendacao: 'Anexar o documento societário pertencente ao CNPJ da empresa.' });
  }

  const numeroContrato = onlyDigits(contrato?.numero_arquivamento);
  const numerosJunta = new Set(historico.map((item: any) => onlyDigits(item?.numero)).filter(Boolean));
  if (numeroContrato && numerosJunta.size > 0 && !numerosJunta.has(numeroContrato)) {
    alertas.push({ codigo: 'contrato_numero_ato_nao_localizado', campo: 'numero_arquivamento', mensagem: 'O número do ato/arquivamento do contrato não foi localizado nos Atos da Junta Comercial.', severidade: 'alta', valor_documento: contrato?.numero_arquivamento, valor_receita: Array.from(numerosJunta), recomendacao: 'Conferir se o contrato/alteração corresponde a um ato listado na certidão da Junta.' });
  }

  const sociosContrato = Array.isArray(contrato?.socios) ? contrato.socios : [];
  const quadroFinal = Array.isArray(contrato?.quadro_societario_final) && contrato.quadro_societario_final.length
    ? contrato.quadro_societario_final
    : sociosContrato;
  const nomesQsa = (Array.isArray(sociosQsa) ? sociosQsa : []).map((socio) => normalizarBasico(socio?.nome)).filter(Boolean);
  const nomesQuadroFinal = quadroFinal.map((socio: any) => normalizarBasico(socio?.nome || socio)).filter(Boolean);
  const datasJuntaOrdenadas = Array.from(datasJunta).sort();
  const ultimaDataJunta = datasJuntaOrdenadas.at(-1) || null;
  const contratoHistorico = !!dataContrato && !!ultimaDataJunta && dataContrato < ultimaDataJunta;
  if (!contratoHistorico && nomesQuadroFinal.length && nomesQsa.length) {
    const divergentes = nomesQuadroFinal.filter((nome: string) => !nomesQsa.some((qsa: string) => qsa === nome || qsa.includes(nome) || nome.includes(qsa)));
    const ausentesNoDocumento = nomesQsa.filter((qsa: string) => !nomesQuadroFinal.some((nome: string) => qsa === nome || qsa.includes(nome) || nome.includes(qsa)));
    if (divergentes.length || ausentesNoDocumento.length) {
      alertas.push({
        codigo: 'contrato_socios_divergentes_qsa',
        campo: 'socios',
        mensagem: `O quadro societário final do documento não confere integralmente com o QSA vigente. Não localizado no QSA: ${divergentes.join(', ') || 'nenhum'}. Não localizado no documento: ${ausentesNoDocumento.join(', ') || 'nenhum'}.`,
        severidade: 'alta',
        valor_documento: divergentes,
        valor_receita: ausentesNoDocumento,
        recomendacao: 'Conferir o ato societário mais recente, o QSA vigente e a data de efetivação antes de concluir a análise.',
        solicitar_qsa_atualizado: nomesQuadroFinal.length > 1 && divergentes.length > 0,
      });
    }
  }

  return uniqueAlerts(alertas);
}

function montarDiagnosticoContratoFactual(dados: any): string | null {
  const alteracoes = Array.isArray(dados?.alteracoes_societarias) ? dados.alteracoes_societarias : [];
  const quadroFinal = Array.isArray(dados?.quadro_societario_final) ? dados.quadro_societario_final : [];
  const frases = alteracoes.map((alteracao: any) => {
    const cedente = alteracao?.cedente?.nome || alteracao?.socio_retirante?.nome || null;
    const cessionario = alteracao?.cessionario?.nome || alteracao?.socio_admitido?.nome || null;
    const quotas = asNumber(alteracao?.quotas_transferidas ?? alteracao?.cedente?.quotas);
    if (cedente && cessionario) {
      return `O documento registra a retirada de ${cedente} e a cessão/transferência de ${quotas !== null ? `${quotas.toLocaleString('pt-BR')} quotas` : 'suas quotas'} para ${cessionario}.`;
    }
    if (cedente) return `O documento registra a retirada de ${cedente}, mas não foi identificado cessionário de forma expressa.`;
    if (cessionario) return `O documento registra a entrada de ${cessionario}, mas não foi identificado cedente de forma expressa.`;
    return null;
  }).filter(Boolean);
  if (quadroFinal.length) {
    const resumoFinal = quadroFinal.map((socio: any) => {
      const nome = socio?.nome || 'sócio não identificado';
      const quotas = asNumber(socio?.quotas);
      const percentual = asNumber(socio?.percentual);
      return `${nome}${quotas !== null ? ` com ${quotas.toLocaleString('pt-BR')} quotas` : ''}${percentual !== null ? ` (${percentual.toLocaleString('pt-BR')}%)` : ''}`;
    }).join('; ');
    frases.push(`O quadro societário final do documento é: ${resumoFinal}.`);
  }
  return frases.length ? frases.join(' ') : null;
}

function normalizarDadosContratoSocial(dados: any): Record<string, any> {
  const contrato = {
    ...dados,
    cnpj: dados?.cnpj ? String(dados.cnpj).trim() : null,
    razao_social: dados?.razao_social ? String(dados.razao_social).trim() : null,
    nire: dados?.nire ? String(dados.nire).trim() : null,
    tipo_ato: dados?.tipo_ato ? String(dados.tipo_ato).trim() : null,
    data_registro: parseDate(dados?.data_registro),
    data_efeitos_registro: parseDate(dados?.data_efeitos_registro),
    data_documento: parseDate(dados?.data_documento),
    numero_arquivamento: dados?.numero_arquivamento ? String(dados.numero_arquivamento).trim() : null,
    socios: Array.isArray(dados?.socios) ? dados.socios.map((socio: any) => ({
      nome: socio?.nome ? String(socio.nome).trim() : null,
      quotas: asNumber(socio?.quotas),
      percentual: asNumber(socio?.percentual),
      qualificacao: socio?.qualificacao ? String(socio.qualificacao).trim() : null,
      administrador: administradorSocietario(socio),
    })).filter((socio: any) => socio.nome) : [],
    alteracoes_societarias: Array.isArray(dados?.alteracoes_societarias) ? dados.alteracoes_societarias.map((alteracao: any) => ({
      ...alteracao,
      cedente: alteracao?.cedente ? { ...alteracao.cedente, nome: alteracao.cedente.nome ? String(alteracao.cedente.nome).trim() : null } : null,
      cessionario: alteracao?.cessionario ? { ...alteracao.cessionario, nome: alteracao.cessionario.nome ? String(alteracao.cessionario.nome).trim() : null } : null,
      quotas_transferidas: asNumber(alteracao?.quotas_transferidas),
      percentual_transferido: asNumber(alteracao?.percentual_transferido),
      clausula: alteracao?.clausula ? String(alteracao.clausula).trim() : null,
      pagina: Number.isFinite(Number(alteracao?.pagina)) && Number(alteracao.pagina) > 0 ? Number(alteracao.pagina) : null,
      evidencia: alteracao?.evidencia ? String(alteracao.evidencia).trim() : null,
    })) : [],
    quadro_societario_final: Array.isArray(dados?.quadro_societario_final) ? dados.quadro_societario_final.map((socio: any) => ({
      nome: socio?.nome ? String(socio.nome).trim() : null,
      quotas: asNumber(socio?.quotas),
      percentual: asNumber(socio?.percentual),
      administrador: administradorSocietario(socio),
    })).filter((socio: any) => socio.nome) : [],
    evidencia_quadro_societario: dados?.evidencia_quadro_societario ? String(dados.evidencia_quadro_societario).trim() : null,
    marcadores_documentais: Array.isArray(dados?.marcadores_documentais) ? dados.marcadores_documentais.map((item: any) => ({
      tipo: item?.tipo ? String(item.tipo).trim() : null,
      pagina: Number.isFinite(Number(item?.pagina)) && Number(item.pagina) > 0 ? Number(item.pagina) : null,
      texto: item?.texto ? String(item.texto).trim() : null,
    })).filter((item: any) => item.texto) : [],
    conflitos_internos: Array.isArray(dados?.conflitos_internos) ? dados.conflitos_internos.map((item: any) => String(item || '').trim()).filter(Boolean) : [],
    capital_social_anterior: asNumber(dados?.capital_social_anterior),
    capital_social_atual: asNumber(dados?.capital_social_atual),
    confianca: normalizarConfianca(dados?.confianca),
  };
  return { ...contrato, diagnostico_factual: dados?.diagnostico_factual || montarDiagnosticoContratoFactual(contrato) };
}

function inferirSociosQsaPorTextoSincronizado(texto: unknown, sociosBase: any[]): Array<{ nome: string; qualificacao: string | null; administrador: boolean | null }> {
  const textoDocumento = normalizarBasico(texto);
  if (!textoDocumento || !Array.isArray(sociosBase) || !sociosBase.length) return [];

  const encontrados: Array<{ nome: string; qualificacao: string | null; administrador: boolean | null }> = [];
  for (const socio of sociosBase) {
    const nomeOriginal = String(socio?.nome || socio?.nome_socio || socio?.razao_social || '').trim();
    const nome = normalizarBasico(nomeOriginal);
    if (!nome || nome === 'nao identificado') continue;
    const pos = textoDocumento.indexOf(nome);
    if (pos < 0) continue;

    // Não inventa o vínculo de administrador a partir da base sincronizada. O nome
    // só é confirmado se aparece literalmente no documento; a administração exige
    // evidência textual próxima ao nome no próprio QSA.
    const inicio = pos + nome.length;
    const fim = Math.min(textoDocumento.length, inicio + 280);
    const contexto = textoDocumento.slice(inicio, fim);
    const administrador = /(?:\b49\b\s*)?socio administrador|administrador|administradora|titular/.test(contexto)
      ? true
      : /\bsocio\b|\bsocia\b|quotista/.test(contexto)
        ? false
        : null;
    encontrados.push({
      nome: nomeOriginal,
      qualificacao: administrador === true ? 'Sócio-Administrador' : administrador === false ? 'Sócio' : null,
      administrador,
    });
  }
  return encontrados;
}

function normalizarDadosQsa(dados: any): Record<string, any> {
  const socios = Array.isArray(dados?.socios) ? dados.socios
    .map((socio: any) => ({
      nome: socio?.nome ? String(socio.nome).trim() : null,
      qualificacao: socio?.qualificacao ? String(socio.qualificacao).trim() : null,
      administrador: administradorSocietario(socio),
    }))
    .filter((socio: any) => socio.nome && normalizarBasico(socio.nome) !== 'nao identificado') : [];
  return {
    documento_compativel: dados?.documento_compativel !== false,
    cnpj: dados?.cnpj ? String(dados.cnpj).trim() : null,
    razao_social: dados?.razao_social ? String(dados.razao_social).trim() : null,
    capital_social: asNumber(dados?.capital_social),
    socios,
    qsa_nao_aplicavel: dados?.qsa_nao_aplicavel === true,
    confianca: normalizarConfianca(dados?.confianca),
    fonte_extracao: dados?.fonte_extracao || null,
    mecanismo_extracao: dados?.mecanismo_extracao || null,
    // Quando a natureza jurídica não permite QSA, a ausência de sócios é a
    // resposta correta e completa -- não é uma extração parcial/falha.
    extracao_parcial: dados?.qsa_nao_aplicavel === true ? false : dados?.extracao_parcial === true,
  };
}

export function normalizarDadosSimples(dados: any): Record<string, any> {
  return {
    ...dados,
    cnpj: dados?.cnpj ? String(dados.cnpj).trim() : null,
    situacao_simples: dados?.situacao_simples ? String(dados.situacao_simples).trim() : null,
    regime_tributario: dados?.regime_tributario
      ? String(dados.regime_tributario).trim()
      : normalizarBooleano(dados?.opcao_mei) === true
        ? 'MEI / SIMEI'
        : normalizarSituacaoSimples(dados?.situacao_simples) === 'optante'
          ? 'Simples Nacional'
          : null,
    opcao_mei: normalizarBooleano(dados?.opcao_mei),
    data_opcao_simples: parseDate(dados?.data_opcao_simples),
    data_exclusao_simples: parseDate(dados?.data_exclusao_simples),
    agendamento_exclusao: normalizarBooleano(dados?.agendamento_exclusao),
    motivo_exclusao: dados?.motivo_exclusao ? String(dados.motivo_exclusao).trim() : null,
    confianca: normalizarConfianca(dados?.confianca),
  };
}

function normalizarDadosAtos(dados: any): Record<string, any> {
  const sociosAlterados = Array.isArray(dados?.socios_alterados) ? dados.socios_alterados.map((socio: any) => ({
    nome: socio?.nome ? String(socio.nome).trim() : null,
    tipo_alteracao: ['entrada', 'saida', 'percentual'].includes(String(socio?.tipo_alteracao || '').toLowerCase())
      ? String(socio.tipo_alteracao).toLowerCase()
      : null,
    data_alteracao: parseDate(socio?.data_alteracao),
  })) : [];
  const historicoArquivamentos = Array.isArray(dados?.historico_arquivamentos)
    ? dados.historico_arquivamentos
        .map((item: any) => ({
          numero: item?.numero ? String(item.numero).trim() : null,
          data: parseDate(item?.data),
          tipo_ato: item?.tipo_ato ? String(item.tipo_ato).trim() : null,
        }))
        .filter((item: any) => item.data)
        .sort((a: any, b: any) => String(a.data).localeCompare(String(b.data)))
    : [];
  return {
    ...dados,
    cnpj: dados?.cnpj ? String(dados.cnpj).trim() : null,
    razao_social: dados?.razao_social ? String(dados.razao_social).trim() : null,
    nire: dados?.nire ? String(dados.nire).trim() : null,
    tipo_ato: dados?.tipo_ato ? String(dados.tipo_ato).trim() : null,
    data_registro: parseDate(dados?.data_registro),
    capital_social_atual: asNumber(dados?.capital_social_atual),
    socios_alterados: sociosAlterados,
    historico_arquivamentos: historicoArquivamentos,
    total_alteracoes_historico: historicoArquivamentos.filter((i: any) => /alterac/i.test(normalizeText(i.tipo_ato || ''))).length,
    evidencia_ato_mais_recente: dados?.evidencia_ato_mais_recente ? String(dados.evidencia_ato_mais_recente).trim() : null,
    conflitos_internos: Array.isArray(dados?.conflitos_internos) ? dados.conflitos_internos.map((item: any) => String(item || '').trim()).filter(Boolean) : [],
    confianca: normalizarConfianca(dados?.confianca),
  };
}

function extrairJson(text: string): any | null {
  if (!text) return null;
  const trimmed = text.trim().replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(trimmed); } catch { /* tenta localizar objeto abaixo */ }
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;
  try { return JSON.parse(objectMatch[0]); } catch { return null; }
}

function mimePorExtensao(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.csv') return 'text/csv';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return null;
}

async function arquivoExiste(filePath: string): Promise<boolean> {
  try { return (await fs.stat(filePath)).isFile(); } catch { return false; }
}

function estaDentroDaRaiz(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function resolverCaminhoSeguro(caminhoArquivo: string): Promise<string> {
  const raw = String(caminhoArquivo || '').trim();
  if (!raw) throw new Error('Arquivo documental sem caminho de armazenamento.');

  const cwd = path.resolve(process.cwd());
  const dataDir = path.resolve(process.env.DATA_DIR || '/data');
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(dataDir, 'uploads'));
  const cwdUploads = path.resolve(cwd, 'uploads');
  // Não autoriza leitura arbitrária do código/aplicação: somente áreas de uploads e dados.
  const roots = [dataDir, uploadDir, cwdUploads];
  const candidates = new Set<string>();

  if (path.isAbsolute(raw)) candidates.add(path.resolve(raw));
  candidates.add(path.resolve(cwd, raw));
  candidates.add(path.resolve(dataDir, raw));
  candidates.add(path.resolve(uploadDir, raw));
  if (raw.startsWith('/app/')) candidates.add(path.resolve(cwd, raw.slice('/app/'.length)));
  if (raw.includes('/uploads/')) candidates.add(path.resolve(dataDir, raw.slice(raw.indexOf('/uploads/') + 1)));

  const rootsReais = await Promise.all(roots.map(async (root) => {
    try { return await fs.realpath(root); } catch { return root; }
  }));

  for (const candidate of candidates) {
    if (!roots.some((root) => estaDentroDaRaiz(candidate, root))) continue;
    if (!(await arquivoExiste(candidate))) continue;
    const caminhoReal = await fs.realpath(candidate);
    if (rootsReais.some((root) => estaDentroDaRaiz(caminhoReal, root))) return caminhoReal;
  }
  throw new Error('Arquivo documental não encontrado ou fora das áreas autorizadas.');
}

function promptQsa(): string {
  return `Você analisa exclusivamente a identidade societária inicial de uma empresa brasileira.
Retorne apenas JSON válido, sem markdown, com este formato:
{
  "documento_compativel": true,
  "cnpj": "00.000.000/0000-00" | null,
  "razao_social": string | null,
  "capital_social": number | null,
  "socios": [{ "nome": string, "qualificacao": string | null, "administrador": boolean | null }],
  "qsa_nao_aplicavel": boolean,
  "confianca": number
}
A decisão da Etapa 1 usa SOMENTE: vínculo do CNPJ, nomes dos integrantes e identificação de quem é Administrador/Titular. Razão social e capital social podem ser extraídos como evidência interna, mas não são requisitos do QSA e não geram divergência nesta etapa. O campo "qualificacao" é apenas evidência interna para inferir "administrador" e não deve criar requisito ou divergência independente. Não extraia nem devolva CPF, RG, endereço, nacionalidade, estado civil, cônjuge, profissão, telefone, e-mail ou qualquer outro dado pessoal. Não extraia data de registro neste QSA; essa validação pertence à etapa societária seguinte. Não invente dados. Use null quando não houver evidência.
REGRA IMPORTANTE: se o documento contiver literalmente a frase "A NATUREZA JURÍDICA NÃO PERMITE O PREENCHIMENTO DO QSA" (ou equivalente), isto é a resposta OFICIAL e COMPLETA da Receita Federal para naturezas jurídicas sem sócios no sentido societário (ex.: Empresário Individual) -- não é uma falha de leitura. Nesse caso, devolva "socios": [] e "qsa_nao_aplicavel": true; NÃO tente adivinhar ou inventar um sócio. Caso contrário, "qsa_nao_aplicavel": false.`;
}

export function promptSimples(): string {
  return `Você é um auditor tributário brasileiro. Extraia os dados do comprovante de enquadramento tributário anexado (consulta do Simples Nacional, relatório de situação fiscal, ECF, DCTF, DARF ou equivalente).
Responda SOMENTE JSON válido, sem markdown e sem comentários:
{
  "documento_compativel": true,
  "cnpj": "00.000.000/0000-00 ou null",
  "situacao_simples": "Optante|Não Optante|Excluído|null",
  "regime_tributario": "Simples Nacional|MEI / SIMEI|Lucro Presumido|Lucro Real|Lucro Arbitrado|Imune ou isenta|null",
  "data_opcao_simples": "YYYY-MM-DD ou null",
  "data_exclusao_simples": "YYYY-MM-DD ou null",
  "agendamento_exclusao": false,
  "motivo_exclusao": "texto ou null",
  "confianca": 0.0
}
Não invente dados. Diferencie exclusão já efetivada de agendamento de exclusão. Use null quando a informação não estiver visível. Confianca deve estar entre 0 e 1.

REGRA CRÍTICA sobre "regime_tributario": este campo define qual documentação será exigida da empresa, então um regime errado é mais grave do que um regime em branco.
- "Não Optante" NÃO é um regime tributário. Uma empresa fora do Simples pode ser Lucro Presumido, Lucro Real ou Arbitrado, e cada um exige documentos diferentes.
- Só preencha "regime_tributario" com o regime que estiver AFIRMADO no documento (ex: "FORMA DE TRIBUTAÇÃO: LUCRO PRESUMIDO", "Regime de apuração: Lucro Real").
- Se o documento apenas informar que a empresa não é optante do Simples, sem dizer qual é o regime, devolva "regime_tributario": null.
- Se o documento NEGAR um regime ("não optou pelo lucro presumido"), não use esse regime.
- Se o documento citar mais de um regime como opções de uma lista, devolva null.
- Se a empresa for optante do Simples, use "Simples Nacional"; se for optante do SIMEI/MEI, use "MEI / SIMEI".

REGRA ESPECÍFICA PARA DARF: se o documento for um DARF, o regime é indicado pelo "código de receita" no campo próprio do documento (não confundir com outros números do documento, como CNPJ ou valor). Use exclusivamente esta tabela:
- Código 2089 → "regime_tributario": "Lucro Presumido"
- Código 5993 → "regime_tributario": "Lucro Real" (estimativa mensal)
- Código 3373 → "regime_tributario": "Lucro Real" (apuração trimestral)
- Código 5625 → "regime_tributario": "Lucro Arbitrado"
- Código 8998, qualquer outro código de receita não listado acima, ou se o campo "código de receita" não estiver legível/visível → "regime_tributario": null (não adivinhe pelo valor do tributo ou pelo nome do tributo; o código 8998 NÃO está confirmado na tabela oficial de códigos de receita da RFB para IRPJ e deve ser tratado como não mapeado, exigindo revisão humana, nunca como Lucro Real presumido automaticamente).`;
}

function promptAtosJunta(): string {
  return `Você é um auditor de atos societários registrados em Junta Comercial brasileira. Extraia os dados do ato ou da certidão/lista de arquivamentos anexada.
Responda SOMENTE JSON válido, sem markdown e sem comentários:
{
  "documento_compativel": true,
  "cnpj": "00.000.000/0000-00 ou null",
  "razao_social": "texto ou null",
  "nire": "texto ou null",
  "tipo_ato": "Contrato Social|Alteração Contratual|Consolidação|Certidão de Arquivamentos|Outro|null",
  "data_registro": "YYYY-MM-DD ou null (data do ato mais recente)",
  "capital_social_atual": 0.00,
  "socios_alterados": [{"nome":"texto","tipo_alteracao":"entrada|saida|percentual","data_alteracao":"YYYY-MM-DD ou null"}],
  "historico_arquivamentos": [{"numero":"texto ou null","data":"YYYY-MM-DD","tipo_ato":"texto (ex: ALTERAÇÃO, CONTRATO, ENQUADRAMENTO DE MICROEMPRESA)"}],
  "evidencia_ato_mais_recente": "transcrição curta e literal do registro/ato mais recente ou null",
  "conflitos_internos": ["conflito textual identificado ou []"],
  "confianca": 0.0
}
Leia o documento inteiro. Se o documento for uma lista/certidão de arquivamentos (ex: "Lista de Arquivamentos" da Junta Comercial), preencha "historico_arquivamentos" com TODOS os itens listados, do mais antigo ao mais recente -- é esse histórico completo que interessa, não só o último. Identifique qual é o ato mais recente pela data e pelo número do registro, sem assumir que a última linha seja a mais recente. Se for um único ato/alteração, preencha também "data_registro" e "socios_alterados" para esse ato específico. Extraia apenas informações expressas no documento. Não deduza alterações que não estejam descritas. Preserve literalmente a evidência do ato mais recente. Registre em "conflitos_internos" qualquer data, número, nome ou quadro que não possa ser resolvido pelo próprio documento. Capital social deve ser numérico. Use null quando não estiver visível. Confianca deve estar entre 0 e 1.`;
}


function promptContratoSocial(): string {
  return `Você é um auditor de registro societário brasileiro. Leia o documento inteiro e extraia somente fatos expressamente escritos em Contrato Social, Alteração Contratual ou Consolidação. O objetivo é explicar objetivamente o que o ato fez, não apenas listar nomes.

Responda SOMENTE JSON válido:
{
  "documento_compativel": true,
  "cnpj": "00.000.000/0000-00 ou null",
  "razao_social": "texto ou null",
  "nire": "texto ou null",
  "tipo_ato": "Contrato Social|Alteração Contratual|Consolidação|null",
  "data_registro": "YYYY-MM-DD ou null",
  "data_efeitos_registro": "YYYY-MM-DD ou null",
  "data_documento": "YYYY-MM-DD ou null",
  "numero_arquivamento": "texto ou null",
  "socios": [{"nome":"texto","qualificacao":"texto ou null","administrador":true}],
  "alteracoes_societarias": [{
    "tipo_alteracao":"retirada|entrada|cessao_quotas|transferencia_quotas|alteracao_administracao|outro",
    "cedente":{"nome":"texto ou null","quotas":0},
    "cessionario":{"nome":"texto ou null","quotas":0},
    "quotas_transferidas":0,
    "percentual_transferido":0,
    "clausula":"texto ou null",
    "pagina":0,
    "evidencia":"transcrição curta e literal do trecho que comprova o fato ou null"
  }],
  "quadro_societario_final":[{"nome":"texto","quotas":0,"percentual":0,"administrador":true}],
  "evidencia_quadro_societario":"transcrição curta e literal da cláusula/tabela que comprova o quadro final ou null",
  "marcadores_documentais":[{"tipo":"registro|transferencia|quadro_final|administracao","pagina":0,"texto":"transcrição curta e literal"}],
  "conflitos_internos":["conflito textual identificado ou []"],
  "capital_social_anterior":0,
  "capital_social_atual":0,
  "confianca":0.0
}

Regras obrigatórias: leia o documento inteiro antes de concluir; use null quando o dado não estiver visível; não invente nomes, quotas, percentuais, cláusulas, datas ou páginas. Extraia todos os fatos de retirada, entrada, cessão ou transferência de quotas e identifique cedente e cessionário apenas quando o texto os vincular expressamente. Em uma consolidação, reconstrua a sequência: quadro anterior, ato praticado e quadro societário final. Diferencie sócios históricos do quadro final; o QSA deve ser comparado somente com o quadro final do ato mais recente, nunca com um sócio que se retirou em documento anterior. Copie uma evidência curta e literal para cada alteração e para o quadro final. Use em data_registro a data da certificação/registro da Junta (ex.: CERTIFICO O REGISTRO EM), não a mera data de assinatura. Se houver duas datas, números, nomes ou quadros incompatíveis, liste o conflito em "conflitos_internos" e não escolha um valor por inferência. Se não houver alteração societária expressa, retorne lista vazia. Atenção especial a atos de TRANSFORMAÇÃO (ex.: transformação de registro de Empresário Individual em Sociedade Empresária Limitada, ou de EIRELI em LTDA): mesmo quando não há entrada, saída, cessão ou transferência de quotas entre sócios, esses atos quase sempre declaram — muitas vezes dentro do próprio Contrato Social transcrito no corpo do mesmo documento, em cláusulas como "Cláusula Terceira" ou "Cláusula Quinta" — quem são os sócios finais, suas quotas e percentuais. Extraia esse quadro normalmente em "quadro_societario_final" e sua evidência em "evidencia_quadro_societario", mesmo que não haja uma seção isolada intitulada "quadro societário" e mesmo que seja um único sócio detentor de 100% das quotas: um único sócio com 100% é um quadro societário final válido e deve ser extraído, não omitido. Nesses casos de transformação sem alteração de sócios, é normal e esperado que "alteracoes_societarias" fique vazio — isso não é uma falha de leitura nem deve impedir a extração do quadro final.`;
}

function promptFaturamento12Meses(): string {
  return `Você é auditor documental de crédito empresarial. Extraia uma relação de faturamento sem inventar dados. Responda SOMENTE JSON válido:
{
  "documento_compativel": true,
  "cnpj": "00.000.000/0000-00 ou null",
  "meses_referencia": ["YYYY-MM"],
  "data_assinatura": "YYYY-MM-DD ou null",
  "assinatura_socio_administrador": {"presente":true,"nome":"texto ou null","tipo":"manual|eletronica|null"},
  "assinatura_contador": {"presente":true,"nome":"texto ou null","tipo":"manual|eletronica|null","crc":"texto ou null"},
  "confianca": 0.0
}
Liste todos os meses expressos. Não considere mês ainda aberto como fechado. Identifique separadamente as duas assinaturas e a modalidade de cada uma.`;
}

function promptComprovanteResidencia(): string {
  return `Você é auditor documental. Extraia um comprovante de endereço sem inventar dados. Responda SOMENTE JSON válido:
{
  "documento_compativel": true,
  "nome_titular": "texto ou null",
  "mes_referencia": "YYYY-MM ou null",
  "data_emissao": "YYYY-MM-DD ou null",
  "data_vencimento": "YYYY-MM-DD ou null",
  "endereco": "texto ou null",
  "confianca": 0.0
}
O mês de referência pode vir da competência, emissão ou vencimento. Preserve o nome completo do titular.`;
}

function promptExtratoBancario(): string {
  return `Você é auditor de movimentação bancária brasileira. Leia todas as páginas do extrato ou comprovante anexado e extraia SOMENTE lançamentos de dinheiro expressamente visíveis no documento. Responda SOMENTE JSON válido, sem markdown:
{
  "documento_compativel": true,
  "banco": "nome do banco ou null",
  "periodo_inicio": "YYYY-MM-DD ou null",
  "periodo_fim": "YYYY-MM-DD ou null",
  "lancamentos": [
    {
      "data": "YYYY-MM-DD",
      "tipo": "entrada|saida",
      "descricao": "descrição curta e literal",
      "valor": 0.00,
      "evidencia": "trecho literal curto que comprova a linha ou null"
    }
  ],
  "total_entradas": 0.00,
  "total_saidas": 0.00,
  "confianca": 0.0
}

Regras obrigatórias: o valor deve ser positivo e representar o valor absoluto do lançamento; classifique como entrada ou saída conforme a coluna, sinal ou descrição expressa no documento; nunca trate saldo anterior, saldo final, limite, subtotal ou total do extrato como lançamento; inclua tarifas, juros, impostos, transferências e pagamentos somente quando forem linhas de movimentação efetiva; não invente data, tipo, valor ou descrição; se uma linha estiver ambígua, omita-a; preserve uma evidência curta e literal; use null quando não houver informação. Datas devem ser convertidas para YYYY-MM-DD. A confiança deve estar entre 0 e 1.`;
}

function formatarDataBr(dataIso: string | null | undefined): string {
  const match = String(dataIso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '--';
}

function normalizarExtratoBancario(
  extraidos: any,
  semanaInicio: string,
  semanaFim: string,
): Omit<AnaliseExtratoBancarioResult, 'arquivo_id' | 'empresa_id'> {
  const inicio = parseDate(semanaInicio);
  const fim = parseDate(semanaFim);
  const observacoes: string[] = [];
  const documentoCompativel = extraidos?.documento_compativel !== false;
  const entradas = Array.isArray(extraidos?.lancamentos) ? extraidos.lancamentos : [];
  // `validos` guarda TODO lançamento bem formado do documento, antes do filtro
  // pela semana selecionada -- serve para diferenciar "o documento não tinha
  // lançamentos legíveis" de "o documento foi lido corretamente, mas nenhuma
  // data cai na semana escolhida" (ver `total_lancamentos_no_documento`).
  const validos: LancamentoExtratoExtraido[] = [];

  for (const item of entradas) {
    const data = parseDate(item?.data || item?.data_movimento);
    const tipoRaw = String(item?.tipo || '').trim().toLowerCase();
    const tipo = tipoRaw === 'entrada' || tipoRaw === 'credito' || tipoRaw === 'crédito'
      ? 'entrada'
      : tipoRaw === 'saida' || tipoRaw === 'saída' || tipoRaw === 'debito' || tipoRaw === 'débito'
        ? 'saida'
        : null;
    const valorBruto = asNumber(item?.valor ?? item?.amount);
    const valor = valorBruto === null ? null : Math.round(Math.abs(valorBruto) * 100) / 100;
    const descricao = String(item?.descricao || item?.description || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!data || !tipo || valor === null || valor <= 0 || !descricao) continue;
    const evidencia = item?.evidencia === null || item?.evidencia === undefined
      ? null
      : String(item.evidencia).replace(/\s+/g, ' ').trim().slice(0, 1000) || null;
    const chave = `${data}|${tipo}|${valor.toFixed(2)}|${normalizarBasico(descricao)}`;
    if (validos.some((lancamento) => `${lancamento.data}|${lancamento.tipo}|${lancamento.valor.toFixed(2)}|${normalizarBasico(lancamento.descricao)}` === chave)) continue;
    validos.push({ data, tipo, descricao, valor, evidencia });
  }

  const lancamentos = validos.filter((item) => !(inicio && item.data < inicio) && !(fim && item.data > fim));

  if (!documentoCompativel) observacoes.push('O arquivo não foi identificado como extrato ou comprovante bancário. Nenhum lançamento foi importado.');
  if (entradas.length !== validos.length) {
    observacoes.push('Algumas linhas foram descartadas por valor/tipo inválido, duplicidade ou ausência de descrição objetiva.');
  }
  if (documentoCompativel && !validos.length) {
    observacoes.push('Nenhum lançamento legível foi encontrado no documento.');
  } else if (documentoCompativel && validos.length && !lancamentos.length) {
    // Este é o caso que antes ficava indistinguível de uma falha de leitura: a
    // IA/OCR leu o extrato corretamente (há `validos.length` lançamentos),
    // mas nenhuma data cai dentro da semana bancária selecionada.
    const datasDocumento = validos.map((item) => item.data).sort();
    observacoes.push(
      `O documento foi lido com sucesso e tem ${validos.length} lançamento(s) entre `
      + `${formatarDataBr(datasDocumento[0])} e ${formatarDataBr(datasDocumento.at(-1) || datasDocumento[0])}, `
      + `mas nenhuma data cai na semana selecionada${inicio || fim ? ` (${formatarDataBr(inicio)} a ${formatarDataBr(fim)})` : ''}. `
      + 'Selecione a semana bancária correta para importar esses lançamentos.',
    );
  }

  const totalEntradas = Math.round(lancamentos.filter((item) => item.tipo === 'entrada').reduce((total, item) => total + item.valor, 0) * 100) / 100;
  const totalSaidas = Math.round(lancamentos.filter((item) => item.tipo === 'saida').reduce((total, item) => total + item.valor, 0) * 100) / 100;
  const datas = validos.map((item) => item.data).sort();
  const confiancaRaw = asNumber(extraidos?.confianca);
  const confianca = confiancaRaw === null ? null : Math.max(0, Math.min(1, confiancaRaw));
  return {
    documento_compativel: documentoCompativel,
    banco: String(extraidos?.banco || '').trim().slice(0, 200) || null,
    periodo_inicio: parseDate(extraidos?.periodo_inicio) || datas[0] || null,
    periodo_fim: parseDate(extraidos?.periodo_fim) || datas.at(-1) || null,
    lancamentos,
    total_lancamentos_no_documento: validos.length,
    total_entradas: totalEntradas,
    total_saidas: totalSaidas,
    confianca,
    fonte_extracao: String(extraidos?.fonte_extracao || '').trim() || null,
    modelo_ia: null,
    revisao_humana_necessaria: true,
    observacoes,
  };
}

// CORREÇÃO (2026-08-30, auditoria de linguagem do prompt -- seção sobre
// remover frases que enviesam o modelo a favor do slot de upload): a versão
// anterior deste prompt dizia "analise exclusivamente o arquivo enviado
// COMO ${nome}", o que sugere ao modelo que o arquivo JÁ É aquele tipo só
// porque foi anexado nesse campo -- exatamente o viés que motivou o bug P0
// de identidade documental corrigido em extracaoDocumentalLocal.ts
// (parseComprovanteRegime). O nome do campo de upload é a INTENÇÃO de quem
// anexou, nunca uma prova do conteúdo real do arquivo; o prompt agora deixa
// isso explícito e pede para o tipo real ser identificado pelo conteúdo
// primeiro, só então comparado ao tipo esperado.
// CORREÇÃO (2026-08-31, bug real reportado em produção): um Relatório de
// Inclusão no CADIN de verdade (empresa CNPJ 49.366.887/0001-25, upload real
// do usuário) foi lido e a IA confirmou "documento_compativel: true" (é
// mesmo um documento de CADIN) sem que nada no prompt pedisse explicitamente
// para verificar SE a certidão/relatório é negativa (nada consta) ou
// positiva (o CNPJ ESTÁ incluído/tem pendência) -- o documento real dizia
// "INCLUÍDO PELA RFB EM 23/11/2025", o oposto de "nada consta", e nada
// garantia que isso virasse um alerta visível. `documento_compativel` só
// prova que o TIPO do documento está certo; nunca provou que o RESULTADO da
// certidão é favorável. Para a categoria `cnd_cpend` (CND/CPEND Federal,
// PGFN, CADIN -- ver `analise: 'cnd_cpend'` em shared/documentTypes.ts) o
// prompt agora exige explicitamente o campo `situacao_certidao`, com a
// consequência de cada valor deixada inequívoca para o modelo.
function promptDocumentoCatalogado(tipoDocumento: string, nome: string, categoria: string, promptCodigo: string): string {
  const exigenciaSituacaoCertidao = promptCodigo === 'cnd_cpend_extract'
    ? ' Além dos campos padrão, este documento é uma certidão/relatório de regularidade (CND, CPEND, PGFN ou CADIN): identifique explicitamente o RESULTADO declarado e retorne em "situacao_certidao" exatamente um destes valores -- "negativa" (nada consta / não há pendência / não está incluído), "positiva_com_efeito_negativo" (certidão positiva com efeito de negativa / CPEND), "positiva" (há pendência, débito ou inclusão ativa -- inclui qualquer CADIN que declare o CNPJ/CPF "incluído" ou "incluído pela RFB"), ou null se o resultado não estiver legível. NUNCA retorne "negativa" só porque o documento é do tipo certo -- "negativa" exige que o texto afirme expressamente ausência de pendência; um documento que declara o contribuinte incluído/positivo é "positiva" mesmo que estruturalmente pareça um relatório oficial válido.'
    : '';
  const perfil = descricaoPerfilParaPrompt(tipoDocumento);
  return `Você é um analista documental de crédito empresarial. Um arquivo foi anexado no campo "${nome}" (${tipoDocumento}), categoria ${categoria} -- mas o nome desse campo é apenas a intenção de quem fez o upload, nunca uma prova do que o arquivo realmente é. Identifique o tipo do documento exclusivamente pelo conteúdo real do arquivo (título, cabeçalho, órgão emissor, campos preenchidos), de forma totalmente independente do nome do campo em que foi anexado -- nunca presuma que o documento é "${nome}" só porque foi anexado nesse campo. Só depois de identificar o tipo real do conteúdo, compare com o tipo esperado ("${nome}" / ${tipoDocumento}) para decidir documento_compativel: documento_compativel deve ser false sempre que o conteúdo real for de um tipo diferente do esperado, mesmo que os dois pertençam à mesma categoria (${categoria}) ou sirvam a propósitos relacionados. Retorne somente JSON válido e não tome decisão final de crédito. ${perfil} Separe rigorosamente campos_comprovados (valor, campo, página/trecho e confiança) de campos_inferidos; se algo não estiver legível, use null e registre pendencia. Identifique documento_compativel, tipo_detectado, competencia (inicio/fim), validade (inicio/fim), data_emissao, cnpj, cpf, razão social, nomes, valores financeiros, órgão emissor, número, situação, assinaturas e evidencias quando existirem.${exigenciaSituacaoCertidao} Nunca invente dados, não trate ausência de evidência como confirmação e indique revisao_humana_necessaria para divergência, baixa confiança, data ausente quando exigida ou documento incompatível. Prompt ${promptCodigo}.`;
}

// CORREÇÃO (2026-08-31, "não é mais aceitável falha... tire esse texto
// enorme, não precisa dessa explicação"): rótulo curto, em português, do tipo
// de documento REALMENTE detectado no conteúdo -- usado para compor um alerta
// mínimo (é ou não é o documento esperado + o que o documento diz), em vez do
// texto longo anterior. Cobre tanto os códigos internos do classificador
// central (`classificadorDocumentalCentral.ts`, em maiúsculas) quanto os do
// classificador determinístico de comprovante de regime
// (`extracaoDocumentalLocal.ts`, em minúsculas).
const ROTULOS_TIPO_DETECTADO: Record<string, string> = {
  ECF: 'ECF', ecf: 'ECF',
  RECIBO_ECF: 'Recibo de ECF', recibo_ecf: 'Recibo de ECF',
  PGDAS_D: 'PGDAS-D (Simples Nacional)', pgdas_d: 'PGDAS-D (Simples Nacional)',
  RECIBO_PGDAS: 'Recibo de PGDAS-D (Simples Nacional)', recibo_pgdas: 'Recibo de PGDAS-D (Simples Nacional)',
  DCTFWEB_MIT: 'DCTFWeb/MIT', dctf_mit: 'DCTFWeb/MIT',
  DARF: 'DARF', darf: 'DARF',
  ECD: 'ECD', ecd: 'ECD',
  LIVRO_CAIXA: 'Livro Caixa', livro_caixa: 'Livro Caixa',
  CND: 'CND', CPEND: 'CPEND', CADIN: 'CADIN', PGFN: 'PGFN', CENPROT: 'CENPROT',
  SITUACAO_FISCAL: 'Situação Fiscal', SCR: 'SCR', CCS: 'CCS', CCF: 'CCF', SERASA: 'SERASA',
};
function descreverTipoDetectadoResumido(tipoDetectado: unknown): string | null {
  const chave = String(tipoDetectado || '').trim();
  if (!chave || chave === 'DOCUMENTO_NAO_IDENTIFICADO') return null;
  return ROTULOS_TIPO_DETECTADO[chave] || null;
}

function normalizarDocumentoCatalogado(extraidos: any, tipoDocumento: string): {
  dados: Record<string, any>;
  evidencias: AnaliseDocumentalGenericaResult['evidencias'];
  camposInferidos: Record<string, unknown>;
  alertas: AlertaDocumental[];
  classificacao?: ClassificacaoDocumentalResult;
  textoFonte: string | null;
} {
  const bruto = extraidos && typeof extraidos === 'object' ? extraidos : {};
  const { __texto_local: textoLocal, ...brutoPersistivel } = bruto;
  const comprovados = bruto.campos_comprovados || bruto.campos_extraidos || bruto.dados || {};
  const camposInferidos = bruto.campos_inferidos && typeof bruto.campos_inferidos === 'object' ? bruto.campos_inferidos : {};
  const evidencias = (Array.isArray(bruto.evidencias) ? bruto.evidencias : []).map((evidencia: any) => ({
    campo: String(evidencia?.campo || 'não especificado'),
    valor: evidencia?.valor ?? null,
    pagina: evidencia?.pagina == null ? null : Number(evidencia.pagina),
    trecho: evidencia?.trecho ? String(evidencia.trecho).slice(0, 1000) : null,
    confianca: normalizarConfianca(evidencia?.confianca),
  }));
  const alertas: AlertaDocumental[] = [];
  // Dados lidos do próprio arquivo (independente de ele ser ou não o
  // documento esperado) -- usados para responder à segunda pergunta exigida
  // pelo usuário ("o que o documento diz": enquadramento/regime/tipo de
  // empresa) no alerta consolidado mais adiante.
  const situacaoSimplesLida = String(bruto.situacao_simples ?? comprovados.situacao_simples ?? '').trim();
  const regimeLido = String(bruto.regime_tributario ?? comprovados.regime_tributario ?? '').trim();
  const enquadramentoLido = bruto.opcao_mei === true
    ? 'MEI/SIMEI'
    : regimeLido || (situacaoSimplesLida ? `Simples Nacional (${situacaoSimplesLida})` : null);
  const brutoIncompativel = bruto.documento_compativel === false;
  const confianca = normalizarConfianca(bruto.confianca ?? bruto.nivel_confianca);
  if (confianca !== null && confianca < 0.72) {
    alertas.push({ codigo: 'documento_catalogado_baixa_confianca', mensagem: 'A leitura automática ficou abaixo do limiar de confiança.', severidade: 'media', valor_documento: confianca, recomendacao: 'Conferir o arquivo inteiro e confirmar os campos extraídos.' });
  }
  const chavesTecnicas = new Set(['documento_compativel', 'confianca', 'nivel_confianca', 'fonte_extracao', 'mecanismo_extracao', 'tipo_detectado']);
  const haDadosExtraidos = Object.entries(brutoPersistivel).some(([chave, valor]) => (
    !chavesTecnicas.has(chave)
    && valor !== null && valor !== undefined && valor !== ''
    && !(Array.isArray(valor) && valor.length === 0)
  ));
  if (!evidencias.length && Object.keys(comprovados).length === 0 && !haDadosExtraidos) {
    alertas.push({ codigo: 'documento_catalogado_sem_evidencia', mensagem: 'Não foram encontrados campos comprovados nem evidências suficientes.', severidade: 'alta', recomendacao: 'Solicitar novo arquivo legível e encaminhar para revisão humana.' });
  }

  // 'comprovante_regime_outro' (rodada 12): o campo genérico "Outro" da
  // pendência de regime tributário -- aceita qualquer documento, mas só
  // confirma o regime quando ele estiver EXPLICITAMENTE declarado no texto,
  // exatamente pela mesma checagem usada para ECF/DCTF/DARF/Livro Caixa
  // abaixo. Pedido explícito do usuário: "o outro vai ter que estar
  // exatamente explícito qual o regime tributário".
  const tiposComprovacaoRegime = new Set([
    'ecf', 'recibo_ecf', 'pgdas', 'pgdas_d', 'recibo_pgdas',
    'dctf', 'dctfweb', 'mit', 'darf', 'ecd', 'recibo_ecd', 'livro_caixa',
    'comprovante_regime_outro',
  ]);
  const dadosRegime: Record<string, any> = {};
  if (tiposComprovacaoRegime.has(tipoDocumento)) {
    const textoParaRegime = [textoLocal, bruto.texto, bruto.ocr_texto, comprovados.texto, comprovados.regime_tributario, bruto.regime_tributario]
      .filter((valor) => typeof valor === 'string' && valor.trim())
      .join('\n');
    const detectado = detectarRegimeTributarioDeclarado(textoParaRegime);
    const regimeExplicito = [comprovados.regime_tributario, bruto.regime_tributario]
      .map((valor) => String(valor || '').trim())
      .find((valor) => /^(?:mei\s*\/\s*simei|simples\s+nacional|lucro\s+presumido|lucro\s+real|lucro\s+arbitrado|imune\s+ou\s+isenta)$/i.test(valor)) || null;
    const regime = detectado.ambiguo ? null : regimeExplicito || detectado.regime;
    if (detectado.ambiguo) {
      alertas.push({ codigo: 'regime_tributario_ambiguo', mensagem: 'O documento apresenta mais de um regime tributário possível; a confirmação foi retida para revisão humana.', severidade: 'alta', recomendacao: 'Conferir a declaração efetiva no documento e anexar uma evidência inequívoca.' });
    } else if (!regime && detectado.codigoReceitaNaoConfirmado) {
      // CORREÇÃO (2026-08-30): reversão da decisão anterior de tratar o
      // código de receita 8998 como "Lucro Real" por compatibilidade. O
      // código não está confirmado na tabela oficial da RFB para IRPJ, então
      // o sistema não infere mais regime nenhum a partir dele -- fica
      // explicitamente sinalizado como CODIGO_NAO_MAPEADO/REVISAO_HUMANA, em
      // vez de arriscar um regime errado (que puxaria a lista de documentos
      // exigidos errada adiante).
      alertas.push({
        codigo: 'regime_tributario_codigo_nao_mapeado',
        mensagem: `O código de receita ${detectado.codigoReceitaNaoConfirmado} identificado no DARF não está confirmado na tabela oficial de códigos de receita da RFB para IRPJ -- o regime tributário não pode ser inferido automaticamente a partir dele (CODIGO_NAO_MAPEADO).`,
        severidade: 'alta',
        recomendacao: 'Encaminhar para revisão humana (REVISAO_HUMANA) e anexar um comprovante legível (ECF, DCTFWeb/MIT ou Livro Caixa) que declare o regime tributário efetivo.',
      });
    } else if (!regime) {
      alertas.push({ codigo: 'regime_tributario_nao_identificado', mensagem: 'O documento foi lido, mas não identificou de forma inequívoca Lucro Presumido, Lucro Real ou Lucro Arbitrado.', severidade: 'alta', recomendacao: 'Anexar um comprovante legível que declare o regime tributário efetivo.' });
    } else {
      const regimeNormalizado = regime.replace(/\s+/g, ' ').trim();
      dadosRegime.regime_tributario = regimeNormalizado;
      dadosRegime.regime_confirmado = true;
      dadosRegime.regime_a_confirmar = false;
      if (!evidencias.some((evidencia: AnaliseDocumentalGenericaResult['evidencias'][number]) => evidencia.campo === 'regime_tributario')) {
        const textoNormalizado = textoParaRegime.replace(/\s+/g, ' ').trim();
        const indice = textoNormalizado.toLowerCase().indexOf(regimeNormalizado.toLowerCase());
        evidencias.push({ campo: 'regime_tributario', valor: regimeNormalizado, pagina: null, trecho: indice >= 0 ? textoNormalizado.slice(Math.max(0, indice - 180), indice + regimeNormalizado.length + 180) : regimeNormalizado, confianca });
      }
    }
  }

  // 'comprovante_regime_outro' (rodada 12) é, por definição, um campo sem
  // identidade/formato fixo esperado -- ao contrário de ECF/DCTF/DARF/Livro
  // Caixa, não existe um único "tipo detectado" correto para comparar.
  // Submeter esse tipo ao classificador central de identidade (feito para
  // comparar um tipo esperado fixo contra um tipo detectado dentre um
  // conjunto fechado de formulários oficiais) faria QUALQUER documento aceito
  // aqui ser marcado erroneamente como "incompatível", porque o tipo esperado
  // ('comprovante_regime_outro') nunca é igual a nenhum tipo detectado desse
  // conjunto fechado. A identidade documental não é o requisito deste campo
  // -- o requisito único e não negociável é o regime tributário estar
  // EXPLICITAMENTE declarado no texto, já garantido de forma totalmente
  // independente desta classificação pela checagem de `tiposComprovacaoRegime`
  // acima (`regimeFoiComprovado`, usada em `satisfazRequisito` mais abaixo).
  const identidadeFlexivel = tipoDocumento === 'comprovante_regime_outro';
  const classificacaoBase: ClassificacaoDocumentalResult = identidadeFlexivel
    ? {
        tipo_esperado: tipoDocumento,
        tipo_detectado: tipoDocumento as unknown as ClassificacaoDocumentalResult['tipo_detectado'],
        satisfaz_requisito: true,
        identidade_status: 'IDENTIFICADO',
        temporalidade_status: 'ATUAL',
        cobertura_status: 'SATISFAZ',
        confianca: 1,
        evidencias: [],
        motivo: 'Campo de identidade flexível: qualquer documento é aceito, desde que o regime tributário esteja explicitamente declarado no texto.',
      }
    : classificarResultadoPersistido({
        tipoEsperado: tipoDocumento,
        resultado: { ...brutoPersistivel, campos_comprovados: comprovados },
        texto: textoLocal,
        competencia: bruto.competencia || { inicio: bruto.competencia_inicio || null, fim: bruto.competencia_fim || null },
        validade: bruto.validade || { inicio: bruto.validade_inicio || null, fim: bruto.validade_fim || null },
      });
  const haEvidenciaEstruturada = evidencias.length > 0 || haDadosExtraidos || Object.values(comprovados).some((valor) => valor !== null && valor !== undefined && String(valor).trim() !== '');
  const confirmacaoAssistidaConfiavel = !identidadeFlexivel
    && classificacaoBase.identidade_status === 'NAO_IDENTIFICADO'
    && bruto.documento_compativel === true
    && (confianca ?? 0) >= 0.75
    && haEvidenciaEstruturada;
  const temporalidadeAceita = classificacaoBase.temporalidade_status === 'ATUAL' || classificacaoBase.temporalidade_status === 'NAO_APLICAVEL';
  const classificacao: ClassificacaoDocumentalResult = confirmacaoAssistidaConfiavel
    ? {
        ...classificacaoBase,
        tipo_detectado: String(bruto.tipo_detectado || canonicalizeDocumentType(tipoDocumento)).toUpperCase(),
        identidade_status: 'IDENTIFICADO',
        satisfaz_requisito: temporalidadeAceita,
        cobertura_status: temporalidadeAceita ? 'SATISFAZ' : 'NAO_SATISFAZ',
        confianca: confianca ?? 0,
        motivo: temporalidadeAceita
          ? 'Identidade confirmada pela leitura assistida com evidências estruturadas; temporalidade compatível.'
          : classificacaoBase.motivo,
      }
    : classificacaoBase;
  const exigeIdentidadeFixa = !identidadeFlexivel && !['outros', 'outro'].includes(tipoDocumento);
  if (exigeIdentidadeFixa) {
    if (classificacao.identidade_status === 'INCOMPATIVEL' || brutoIncompativel) {
      // CORREÇÃO (2026-08-31, "não é mais aceitável falha... não ler um outro
      // documento junto com duplicidade"): antes, este bloco e o bloco de
      // `bruto.documento_compativel === false` acima podiam gerar DOIS alertas
      // quase idênticos para o mesmo problema (ex.: um PGDAS-D no slot do ECF
      // disparava tanto "documento_catalogado_incompativel" quanto
      // "documento_catalogado_tipo_incompativel", cada um com um texto
      // diferente para a mesma causa). Agora, para os tipos críticos, os dois
      // sinais (classificador central e classificador determinístico
      // local/IA) resultam em UM ÚNICO alerta, com o texto mínimo exigido:
      // só (1) se é ou não o documento esperado e (2) o que o documento em si
      // afirma sobre enquadramento/regime -- nada de explicação longa.
      const tipoDetectadoLabel = descreverTipoDetectadoResumido(classificacao.tipo_detectado)
        || descreverTipoDetectadoResumido(bruto.tipo_detectado)
        || null;
      const mensagem = `Documento incorreto para "${documentLabel(tipoDocumento)}"${tipoDetectadoLabel ? ` -- conteúdo identificado: ${tipoDetectadoLabel}` : ''}. Não validado.${enquadramentoLido ? ` Enquadramento indicado no arquivo: ${enquadramentoLido}.` : ''}`;
      alertas.push({
        codigo: 'documento_catalogado_tipo_incompativel',
        mensagem,
        severidade: 'alta',
      });
    } else if (classificacao.identidade_status === 'NAO_IDENTIFICADO') {
      alertas.push({
        codigo: 'documento_catalogado_tipo_nao_identificado',
        mensagem: 'A identidade do documento não pôde ser comprovada pelo texto disponível.',
        severidade: 'alta',
        recomendacao: 'Encaminhar para revisão humana; ausência de evidência não satisfaz o requisito.',
      });
    }
  }

  const dadosEfd: Record<string, any> = {};
  if (canonicalizeDocumentType(tipoDocumento) === 'efd_contribuicoes') {
    const m400 = Array.isArray(bruto.registros_m400) ? bruto.registros_m400 : [];
    const m800 = Array.isArray(bruto.registros_m800) ? bruto.registros_m800 : [];
    const conciliado = bruto.totais_m400_m800_conciliados === true;
    dadosEfd.status_analise = m400.length && m800.length && conciliado ? 'CONCLUIDA' : 'REVISAO_HUMANA';
    dadosEfd.registros_m400 = m400;
    dadosEfd.registros_m800 = m800;
    dadosEfd.totais_m400_m800_conciliados = conciliado;
    dadosEfd.receita_nao_tributada_confirmada = conciliado ? bruto.receita_nao_tributada_confirmada ?? null : null;
    if (!m400.length || !m800.length || !conciliado) {
      alertas.push({
        codigo: 'efd_contribuicoes_m400_m800_incompletos',
        mensagem: !m400.length || !m800.length
          ? 'A EFD-Contribuições foi identificada, mas os registros M400 e M800 não foram ambos localizados com segurança.'
          : 'Os totais M400 (PIS) e M800 (COFINS) divergem; nenhum valor consolidado foi assumido.',
        severidade: 'alta',
        recomendacao: 'Conferir o arquivo SPED completo e os registros M400/M800 antes de usar os valores na análise de crédito.',
      });
    }
  }

  // CORREÇÃO (2026-08-31, bug real reportado em produção -- ver
  // CHANGELOG_CORRECOES.md, Rodada 4): um Relatório de Inclusão no CADIN de
  // verdade (CNPJ 49.366.887/0001-25) foi anexado no campo "Nada consta
  // CADIN (CNPJ)" e o documento em si é, de fato, um relatório de CADIN --
  // `documento_compativel` corretamente seria `true`. O problema é outro:
  // o CONTEÚDO do relatório diz "Situação do contribuinte no Cadin:
  // INCLUÍDO PELA RFB EM 23/11/2025", ou seja, o EXATO OPOSTO de "nada
  // consta" -- e nada no sistema convertia isso num alerta. Verificar o TIPO
  // do documento nunca provou que o RESULTADO da certidão é favorável; são
  // duas perguntas diferentes. Esta correção fecha essa lacuna para toda a
  // categoria `cnd_cpend` (CND/CPEND Federal, PGFN e CADIN, tanto CNPJ
  // quanto CPF -- ver `analise: 'cnd_cpend'` em shared/documentTypes.ts):
  // `situacao_certidao` (ver exigência acrescentada a `promptDocumentoCatalogado`
  // acima) agora vira um alerta de severidade crítica sempre que a certidão
  // não for expressamente negativa ou positiva-com-efeito-de-negativa, e um
  // alerta de revisão humana quando a IA não confirmar nenhum resultado --
  // nunca fica em silêncio.
  const dadosCertidao: Record<string, any> = {};
  if (documentAnalysisConfig(tipoDocumento)?.tipo === 'cnd_cpend') {
    const situacaoBruta = String(bruto.situacao_certidao ?? comprovados.situacao_certidao ?? '').trim().toLowerCase();
    const situacaoCertidao: 'negativa' | 'positiva_com_efeito_negativo' | 'positiva' | null =
      situacaoBruta === 'negativa' || situacaoBruta === 'positiva_com_efeito_negativo' || situacaoBruta === 'positiva'
        ? situacaoBruta
        : null;
    dadosCertidao.situacao_certidao = situacaoCertidao;
    if (situacaoCertidao === 'positiva') {
      alertas.push({
        codigo: 'certidao_situacao_positiva',
        mensagem: `O documento indica que ${documentLabel(tipoDocumento)} está POSITIVO -- há pendência, débito ou inclusão ativa declarada no próprio documento. Isto não satisfaz uma exigência de "nada consta".`,
        severidade: 'critica',
        recomendacao: 'Tratar como pendência ativa de crédito: solicitar regularização, negociação ou uma certidão positiva com efeito de negativa (CPEND). Nunca considerar este requisito satisfeito com o documento atual.',
      });
    } else if (!situacaoCertidao) {
      alertas.push({
        codigo: 'certidao_situacao_nao_identificada',
        mensagem: `Não foi possível confirmar se ${documentLabel(tipoDocumento)} é negativa, positiva ou positiva com efeito de negativa a partir do documento anexado.`,
        severidade: 'alta',
        recomendacao: 'Conferir manualmente o resultado da certidão/relatório antes de considerar este requisito satisfeito.',
      });
    }
  }

  const regimeFoiComprovado = !tiposComprovacaoRegime.has(tipoDocumento) || dadosRegime.regime_confirmado === true;
  const certidaoExigeMerito = documentAnalysisConfig(tipoDocumento)?.tipo === 'cnd_cpend';
  const situacaoCertidao = String(dadosCertidao.situacao_certidao || '');
  const certidaoFoiComprovada = !certidaoExigeMerito || ['negativa', 'positiva_com_efeito_negativo'].includes(situacaoCertidao);
  const perfil = obterPerfilAnaliseDocumental(tipoDocumento);
  const valorExtraido = (campo: string): unknown => {
    if (campo === 'periodo') return bruto.periodo ?? bruto.competencia ?? comprovados.periodo ?? comprovados.competencia;
    if (campo === 'valores') return bruto.valores ?? bruto.competencias_mensais ?? bruto.valor ?? comprovados.valores;
    return comprovados[campo] ?? bruto[campo];
  };
  const camposObrigatoriosAusentes = perfil.camposObrigatorios.filter((campo) => {
    const valor = valorExtraido(campo);
    return valor === null || valor === undefined || valor === '' || (Array.isArray(valor) && valor.length === 0);
  });
  if (camposObrigatoriosAusentes.length > 0) {
    alertas.push({
      codigo: 'campos_essenciais_nao_comprovados',
      mensagem: `Campos essenciais não comprovados: ${camposObrigatoriosAusentes.join(', ')}.`,
      severidade: 'alta',
      recomendacao: 'Conferir a legibilidade e completar o documento; campos ausentes não são inferidos.',
    });
  }
  const satisfazRequisito = classificacao.satisfaz_requisito
    && regimeFoiComprovado
    && certidaoFoiComprovada
    && camposObrigatoriosAusentes.length === 0;
  const identidadeComprovada = classificacao.identidade_status === 'IDENTIFICADO'
    || (classificacao.identidade_status === 'NAO_IDENTIFICADO' && bruto.documento_compativel === true);
  const dados = {
    ...brutoPersistivel,
    ...dadosRegime,
    ...dadosEfd,
    ...dadosCertidao,
    campos_comprovados: comprovados,
    campos_inferidos: camposInferidos,
    evidencias,
    documento_compativel: exigeIdentidadeFixa
      ? bruto.documento_compativel !== false && identidadeComprovada && regimeFoiComprovado
      : bruto.documento_compativel !== false,
    confianca,
    tipo_documento: tipoDocumento,
    competencia: bruto.competencia || { inicio: bruto.competencia_inicio || null, fim: bruto.competencia_fim || null },
    validade: bruto.validade || { inicio: bruto.validade_inicio || null, fim: bruto.validade_fim || null },
    separacao_comprovado_inferido: true,
    tipo_esperado: classificacao.tipo_esperado,
    tipo_detectado: classificacao.tipo_detectado,
    satisfaz_requisito: satisfazRequisito,
    identidade_status: classificacao.identidade_status,
    temporalidade_status: classificacao.temporalidade_status,
    cobertura_status: satisfazRequisito ? classificacao.cobertura_status : 'NAO_SATISFAZ',
    campos_essenciais_ausentes: camposObrigatoriosAusentes,
    classificacao_motivo: classificacao.motivo,
  };
  return { dados, evidencias, camposInferidos, alertas, classificacao, textoFonte: textoLocal || null };
}

function competenciaInicio(value: unknown): string | null {
  const texto = String(value || '').trim();
  if (/^\d{4}-\d{2}$/.test(texto)) return `${texto}-01`;
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);
  const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
}

function competenciaFim(value: unknown): string | null {
  const inicio = competenciaInicio(value);
  if (!inicio) return null;
  if (!/^\d{4}-\d{2}-01$/.test(inicio)) return inicio;
  const data = new Date(`${inicio}T12:00:00.000Z`);
  data.setUTCMonth(data.getUTCMonth() + 1, 0);
  return data.toISOString().slice(0, 10);
}

function extrairCompetenciasComValor(dados: Record<string, any>): Array<{ ano: number; mes: number; valor: number }> {
  const candidatos = [dados.competencias_mensais, dados.faturamento_mensal, dados.competencias, dados.meses].find(Array.isArray) || [];
  return candidatos.flatMap((item: any) => {
    const competencia = String(item?.competencia || item?.mes_referencia || '').trim();
    const match = competencia.match(/^(20\d{2})[-\/]([01]?\d)$/);
    const ano = Number(item?.ano || match?.[1]);
    const mes = Number(item?.mes || match?.[2]);
    const valor = Number(item?.valor ?? item?.faturamento ?? item?.receita_bruta);
    return Number.isInteger(ano) && ano >= 2000 && Number.isInteger(mes) && mes >= 1 && mes <= 12 && Number.isFinite(valor) && valor >= 0
      ? [{ ano, mes, valor }]
      : [];
  });
}

async function persistirEvidenciasP0(
  db: Queryable,
  empresaId: string,
  arquivoId: string,
  tipoDocumento: string,
  dados: Record<string, any>,
  evidencias: AnaliseDocumentalGenericaResult['evidencias'],
  textoFonte: string | null,
): Promise<void> {
  const confianca = typeof dados.confianca === 'number' ? dados.confianca : null;
  const fonte = String(dados.fonte_extracao || 'documento_ia').slice(0, 120);
  const inicio = competenciaInicio(dados.competencia?.inicio || dados.competencia_inicio || dados.ano_calendario);
  const fim = competenciaFim(dados.competencia?.fim || dados.competencia_fim || inicio);

  if (dados.regime_confirmado === true && dados.regime_tributario) {
    await registrarPeriodoRegime(db, {
      empresaId,
      regime: String(dados.regime_tributario),
      dataEvidenciaInicio: inicio || new Date().toISOString().slice(0, 10),
      dataEvidenciaFim: fim,
      fonte,
      confianca,
      documentoEvidenciaId: arquivoId,
      observacao: `Regime extraído de ${tipoDocumento}.`,
    });
  }

  for (const competencia of extrairCompetenciasComValor(dados)) {
    await registrarFaturamentoCompetencia(db, {
      empresaId,
      ano: competencia.ano,
      mes: competencia.mes,
      valor: competencia.valor,
      fonte,
      documentoId: arquivoId,
      regimeNoPeriodo: dados.regime_tributario || null,
      confianca,
      observacao: `Competência extraída de ${tipoDocumento}.`,
    });
  }

  const texto = [
    textoFonte,
    ...evidencias.map((evidencia) => `${evidencia.campo}: ${String(evidencia.valor ?? '')} ${evidencia.trecho || ''}`),
  ].filter(Boolean).join('\n');
  const requisitos = detectarRequisitosCobertosPeloTexto(texto);
  if (!requisitos.length) return;
  const statusCertidao = detectarStatusCertidaoDebitos(texto);
  const statusExplicito = String(dados.status_bureau || dados.status || dados.situacao || dados.resultado || '').toLowerCase();
  const bureauSatisfeito = /regular|nada\s+consta|sem\s+restri[cç][aã]o|adimplente|inexist[eê]ncia\s+de\s+restri[cç][aã]o/.test(statusExplicito);
  for (const requirementCode of requisitos) {
    const status = ['CND_FEDERAL', 'CNDT'].includes(requirementCode)
      ? statusCertidao || 'PENDENTE'
      : bureauSatisfeito ? 'SATISFEITO' : 'PENDENTE';
    await registrarCoberturaEvidencia(db, {
      documentoId: arquivoId,
      requirementCode,
      coverageStatus: status,
      confidence: confianca,
      sourceSection: tipoDocumento,
      extractedValue: { fonte, tipo_documento: tipoDocumento },
    });
  }
}

export class AnaliseDocumentalService {
  private ultimoModeloUsado: string | null = null;
  private ultimaFonteExtracao: 'local' | 'gemini' | 'injetada' | null = null;

  constructor(
    private readonly db: Queryable = defaultPool,
    private readonly extratorInjetado?: ExtratorInjetado,
  ) {}

  private async extrairComIA(arquivoPath: string, prompt: string, mimeType: string, textoExtraido?: string | null): Promise<any> {
    if (this.extratorInjetado) {
      this.ultimaFonteExtracao = 'injetada';
      return this.extratorInjetado(arquivoPath, prompt, mimeType);
    }

    if (!externalAiFallbackDocumentalEnabled()) {
      throw new Error('Fallback externo documental desativado; a validação deve usar o motor interno.');
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('Gemini não configurado: informe GEMINI_API_KEY ou GOOGLE_API_KEY.');

    const resolvedPath = await resolverCaminhoSeguro(arquivoPath);
    const buffer = await fs.readFile(resolvedPath);
    const maxBytes = Number(process.env.GEMINI_MAX_INLINE_BYTES || 20 * 1024 * 1024);
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error('GEMINI_MAX_INLINE_BYTES inválido.');
    if (buffer.length > maxBytes) throw new Error(`Arquivo excede o limite de ${maxBytes} bytes para análise inline.`);

    const effectiveMime = String(mimeType || '').toLowerCase().split(';')[0].trim();
    const inferredMime = (!effectiveMime || effectiveMime === 'application/octet-stream') ? mimePorExtensao(resolvedPath) : effectiveMime;
    const suportaInline = Boolean(inferredMime && (inferredMime === 'application/pdf' || inferredMime.startsWith('image/')));
    const textoEstruturado = String(textoExtraido || '').trim();
    if (!suportaInline && !textoEstruturado) throw new Error(`Tipo de arquivo não suportado pela análise documental: ${inferredMime || 'desconhecido'}.`);

    const principal = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const fallback = process.env.GEMINI_MODEL_FALLBACK || 'gemini-2.5-pro';
    const modelos = Array.from(new Set([principal, fallback].map((item) => String(item || '').trim()).filter(Boolean)));
    const configuredTimeout = Number(process.env.GEMINI_TIMEOUT_MS || 30000);
    const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 30000;
    const genAI = new GoogleGenerativeAI(apiKey);
    let ultimoErro: unknown = null;

    for (const modelName of modelos) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { temperature: 0, responseMimeType: 'application/json' } as any,
        });
        const conteudo = suportaInline
          ? [{ text: prompt }, { inlineData: { mimeType: inferredMime!, data: buffer.toString('base64') } }]
          : [{ text: `${prompt}\n\nCONTEÚDO TEXTUAL EXTRAÍDO DO ARQUIVO ESTRUTURADO:\n${textoEstruturado.slice(0, 250_000)}` }];
        const request = model.generateContent(conteudo as any);
        const result = await Promise.race([
          request,
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout Gemini após ${timeoutMs}ms`)), timeoutMs)),
        ]);
        const responseText = result.response.text();
        const parsed = extrairJson(responseText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Gemini retornou JSON documental inválido.');
        this.ultimoModeloUsado = modelName;
        this.ultimaFonteExtracao = 'gemini';
        return { ...parsed, fonte_extracao: parsed?.fonte_extracao || 'gemini_document_ocr' };
      } catch (error) {
        ultimoErro = error;
        console.warn('[AnaliseDocumentalService] Falha na extração Gemini; tentando fallback quando disponível:', modelName, (error as any)?.message || error);
      }
    }

    throw ultimoErro instanceof Error ? ultimoErro : new Error('Não foi possível extrair o documento com IA.');
  }

  private async extrairHibrido(
    arquivoPath: string,
    prompt: string,
    mimeType: string,
    tipo: TipoDocumentoLocal,
    usarExtracaoLocal = true,
    tipoDocumentoEsperado?: string,
  ): Promise<any> {
    if (this.extratorInjetado || !usarExtracaoLocal) return this.extrairComIA(arquivoPath, prompt, mimeType);

    const resolvedPath = await resolverCaminhoSeguro(arquivoPath);
    const thresholdConfigurado = Number(process.env.LOCAL_DOCUMENT_CONFIDENCE_MIN || 0.72);
    const threshold = Number.isFinite(thresholdConfigurado)
      ? Math.max(0.4, Math.min(0.95, thresholdConfigurado))
      : 0.72;

    let local: Awaited<ReturnType<typeof extrairDocumentoLocal>> | null = null;
    const fallbackLocalParcial = (motivo: unknown): any | null => {
      const temDadosLocais = !!local?.dados && Object.keys(local.dados).some((chave) => {
        const valor = local?.dados?.[chave];
        return valor !== null && valor !== undefined && valor !== ''
          && !(Array.isArray(valor) && valor.length === 0)
          && !(typeof valor === 'object' && !Array.isArray(valor) && Object.keys(valor).length === 0);
      });
      const temTextoLocal = Boolean(String(local?.texto || '').trim());
      if (!local || (!temDadosLocais && !temTextoLocal)) return null;
      this.ultimoModeloUsado = `local:${local.mecanismo || 'ocr'}-v1-parcial`;
      this.ultimaFonteExtracao = 'local';
      return {
        ...(local.dados || {}),
        confianca: local.confianca,
        fonte_extracao: 'local_deterministica',
        mecanismo_extracao: local.mecanismo,
        ...(temTextoLocal ? { __texto_local: local.texto } : {}),
        extracao_parcial: true,
        motivo_extracao_parcial: local.motivo || String((motivo as any)?.message || motivo || 'Extração local abaixo do limiar de confiança.'),
      };
    };
    try {
      local = await extrairDocumentoLocal(resolvedPath, mimeType, tipo, tipoDocumentoEsperado);
      // CORREÇÃO (2026-08-31, bug real reportado em produção 3 vezes seguidas
      // para o mesmo caso -- ver comentário em TIPOS_COMPROVANTE_REGIME_DETERMINISTICO):
      // a condição anterior só usava o resultado local diretamente quando ele
      // NÃO apontasse incompatibilidade -- ou seja, exatamente quando o
      // classificador determinístico mais precisava ser ouvido (encontrou um
      // documento do tipo errado, ex.: PGDAS no slot de ECF), o código descartava
      // esse achado e pedia uma segunda opinião à IA. Como a IA é não
      // determinística e `normalizarDocumentoCatalogado` assume
      // `documento_compativel: true` quando o campo vem ausente da resposta,
      // isso apagava sistematicamente o "false" correto. Para os 4 tipos com
      // classificador 100% determinístico, um "false" local agora é decisivo,
      // igual a um "true" -- sem rodada extra pela IA. Para os demais tipos com
      // extração local (QSA, Atos da Junta, Cartão CNPJ etc.), cujo
      // `documento_compativel` vem de heurísticas mais aproximadas, o
      // comportamento de pedir a segunda opinião da IA continua idêntico ao de
      // antes desta correção.
      const classificacaoLocalEDeterministica = TIPOS_COMPROVANTE_REGIME_DETERMINISTICO.has(tipo);
      const confiavelParaUsoDireto = local.legivel && local.confianca >= threshold
        && (classificacaoLocalEDeterministica || local.dados?.documento_compativel !== false);
      if (confiavelParaUsoDireto) {
        this.ultimoModeloUsado = `local:${local.mecanismo}-v1`;
        this.ultimaFonteExtracao = 'local';
        return {
          ...local.dados,
          confianca: local.confianca,
          fonte_extracao: 'local_deterministica',
          mecanismo_extracao: local.mecanismo,
          ...(local.texto ? { __texto_local: local.texto } : {}),
        };
      }
    } catch (error: any) {
      console.warn('[AnaliseDocumentalService] Extração local falhou de forma controlada:', tipo, error?.message || error);
    }

    if (!externalAiFallbackDocumentalEnabled()) {
      const parcial = fallbackLocalParcial('Fallback externo desativado por política internal-first.');
      if (parcial) return parcial;
      throw new Error(`${tipo}: o motor interno não encontrou evidência legível suficiente; revisão humana necessária.`);
    }

    try {
      const resultadoIa = await this.extrairComIA(arquivoPath, prompt, mimeType, local?.texto || null);
      // CORREÇÃO (2026-08-31): antes, o texto local só era propagado para a IA
      // quando `tipo === 'qsa'`, mesmo quando a extração local tinha texto de
      // sobra para os demais tipos críticos (ECF, DCTF/MIT, DARF, Livro Caixa,
      // e qualquer outro tipo com extração local). Sem esse texto,
      // `classificarResultadoPersistido` (o classificador central,
      // `classificadorDocumentalCentral.ts`) nunca recebia conteúdo real para
      // analisar neste ramo -- ficava com `NAO_IDENTIFICADO` em vez de
      // `INCOMPATIVEL`, mesmo já existindo texto extraído localmente que
      // provaria a incompatibilidade. Propagar sempre que houver texto local
      // não muda em nada o resultado da IA em si -- só garante que a camada de
      // classificação determinística por trás dela tenha o texto real para
      // trabalhar.
      return local?.texto
        ? { ...resultadoIa, __texto_local: local.texto }
        : resultadoIa;
    } catch (error: any) {
      // A ausência de Gemini não transforma uma leitura local executada em
      // "aguardando análise". Quando o OCR/pdftotext conseguiu extrair algum
      // conteúdo estruturado, persistimos o resultado como parcial e o motor
      // determinístico gera as pendências objetivas para revisão humana.
      // Assim a tela sempre mostra o que foi lido e por que não pode avançar.
      const parcial = fallbackLocalParcial(error);
      if (parcial) {
        console.warn('[AnaliseDocumentalService] Gemini indisponível; mantendo extração local parcial para revisão humana:', tipo, error?.message || error);
        return parcial;
      }
      throw new Error(`${tipo}: ${local?.motivo || error?.message || 'não foi possível ler o documento pelo motor interno; revisão humana necessária.'}`);
    }
  }

  private async carregarContexto(empresaId: string, arquivoId: string): Promise<{ empresa: any; socios: any[]; documento: DocumentoArquivoRow }> {
    const [empresaResult, sociosResult, documentoResult] = await Promise.all([
      this.db.query('SELECT * FROM public.empresas WHERE id = $1 LIMIT 1', [empresaId]),
      this.db.query('SELECT * FROM public.socios_empresa WHERE empresa_id = $1 AND COALESCE(ativo, true) = true ORDER BY nome ASC', [empresaId]),
      this.db.query(
        `SELECT id, empresa_id, entidade_id, entidade_tipo, socio_id, nome_original, nome_arquivo, hash_arquivo, caminho_arquivo, url_arquivo, mime_type, tipo_documento
           FROM public.documentos_arquivos
          WHERE id = $1
            AND excluido_em IS NULL
            AND COALESCE(status, 'ativo') <> 'excluido'
          LIMIT 1`,
        [arquivoId],
      ),
    ]);

    const empresa = empresaResult.rows[0];
    const documento = documentoResult.rows[0] as DocumentoArquivoRow | undefined;
    if (!empresa) throw new Error('Empresa não encontrada para análise documental.');
    if (!documento) throw new Error('Documento não encontrado para análise.');
    const pertenceEmpresa = documento.empresa_id === empresaId || (documento.entidade_tipo === 'empresa' && documento.entidade_id === empresaId);
    if (!pertenceEmpresa) throw new Error('Documento não pertence à empresa informada.');
    // Registros antigos podem ter caminho_arquivo vazio e ainda assim possuir
    // nome_arquivo/url_arquivo válidos. O mesmo resolvedor usado pelo Acervo
    // deve ter a oportunidade de localizar esses arquivos antes de declarar falha.

    // Usa o mesmo resolvedor do Acervo Documental. Assim, o arquivo que pode ser
    // visualizado/baixado também pode ser lido pela análise, independentemente de
    // DATA_DIR apontar para /var/data/destrava ou do volume real estar em /app/uploads.
    // Em testes unitários com extrator injetado não há leitura física do arquivo.
    if (!this.extratorInjetado) {
      const caminhoResolvido = resolveDocumentPath(documento);
      if (!caminhoResolvido.absolutePath) {
        throw new Error(`Arquivo documental não localizado no armazenamento persistente (${documento.nome_original || documento.id}).`);
      }
      documento.caminho_arquivo = caminhoResolvido.absolutePath;
    }
    const sociosSincronizados = consolidarSociosSincronizados(empresa, sociosResult.rows || []);
    return { empresa, socios: sociosSincronizados, documento };
  }

  /**
   * Despacho único usado por upload e reprocessamento. Manter a escolha do
   * motor aqui impede que o backfill produza um laudo genérico diferente do
   * laudo especializado gerado para o mesmo tipo no upload.
   */
  async analisarDocumentoAutomatico(empresaId: string, arquivoId: string, tipoDocumento: string): Promise<AnaliseDocumentalResult> {
    const tipoCanonico = canonicalizeDocumentType(tipoDocumento);
    if (tipoCanonico === 'comprovante_residencia') return this.analisarComprovanteResidencia(empresaId, arquivoId);
    if (tipoDocumento === 'qsa') return this.analisarQSA(empresaId, arquivoId);
    if (['simples_nacional', 'enquadramento_tributario_cnpj'].includes(tipoDocumento)) return this.analisarSimplesNacional(empresaId, arquivoId);
    if (tipoCanonico === 'faturamento_12_meses') return this.analisarFaturamento(empresaId, arquivoId);
    if (tipoDocumento === 'atos_junta_comercial') return this.analisarAtosJuntaComercial(empresaId, arquivoId);
    return this.analisarDocumentoCatalogado(empresaId, arquivoId, tipoDocumento);
  }

  async analisarQSA(empresaId: string, arquivoId: string): Promise<AnaliseDocumentalResult> {
    this.ultimoModeloUsado = null;
    this.ultimaFonteExtracao = null;
    const { empresa, socios, documento } = await this.carregarContexto(empresaId, arquivoId);
    const extraidos = await this.extrairHibrido(documento.caminho_arquivo!, promptQsa(), documento.mime_type || 'application/pdf', 'qsa');
    const dados = normalizarDadosQsa(extraidos);

    // Última proteção contra falsos "Sócios 0": se a estrutura do PDF/OCR foi
    // perdida, mas o nome sincronizado aparece literalmente no texto do QSA, o
    // backend confirma esse nome a partir da evidência documental. Dados pessoais
    // não são consultados nem inferidos. A condição de administrador só é marcada
    // quando também há evidência textual próxima no próprio documento.
    const sociosPorTexto = inferirSociosQsaPorTextoSincronizado(extraidos?.__texto_local, socios);
    if (sociosPorTexto.length) {
      const porNome = new Map<string, any>();
      for (const socio of [...dados.socios, ...sociosPorTexto]) {
        const chave = normalizarBasico(socio?.nome);
        if (!chave) continue;
        const atual = porNome.get(chave);
        porNome.set(chave, atual
          ? {
              ...atual,
              qualificacao: atual.qualificacao || socio.qualificacao || null,
              administrador: atual.administrador ?? socio.administrador ?? null,
            }
          : socio);
      }
      dados.socios = Array.from(porNome.values());
      if (dados.socios.length) dados.extracao_parcial = false;
    }

    const alertas = validarQsaExtraida(empresa, socios, dados);
    await persistirEvidenciasP0(this.db, empresaId, arquivoId, 'qsa', dados, [], extraidos?.__texto_local || null)
      .catch((error: any) => console.warn('[P0] Evidências do QSA indisponíveis; laudo preservado:', error?.message || error));
    return criarResultado('qsa', empresaId, arquivoId, dados, alertas, this.ultimoModeloUsado);
  }

  async analisarSimplesNacional(empresaId: string, arquivoId: string): Promise<AnaliseDocumentalResult> {
    this.ultimoModeloUsado = null;
    this.ultimaFonteExtracao = null;
    const { empresa, documento } = await this.carregarContexto(empresaId, arquivoId);
    const extraidos = await this.extrairHibrido(documento.caminho_arquivo!, promptSimples(), documento.mime_type || 'application/pdf', 'simples_nacional');
    const dados = normalizarDadosSimples(extraidos);
    const alertas = validarSimplesExtraido(empresa, dados);
    await persistirEvidenciasP0(this.db, empresaId, arquivoId, 'simples_nacional', dados, [], extraidos?.__texto_local || null)
      .catch((error: any) => console.warn('[P0] Evidências de enquadramento indisponíveis; laudo preservado:', error?.message || error));
    return criarResultado('simples_nacional', empresaId, arquivoId, dados, alertas, this.ultimoModeloUsado);
  }

  async analisarAtosJuntaComercial(empresaId: string, arquivoId: string): Promise<AnaliseDocumentalResult> {
    this.ultimoModeloUsado = null;
    this.ultimaFonteExtracao = null;
    const { empresa, documento } = await this.carregarContexto(empresaId, arquivoId);
    const extraidos = await this.extrairHibrido(documento.caminho_arquivo!, promptAtosJunta(), documento.mime_type || 'application/pdf', 'atos_junta_comercial');
    const dados = normalizarDadosAtos(extraidos);
    const alertas = validarAtosJuntaExtraidos(empresa, dados);
    await persistirEvidenciasP0(this.db, empresaId, arquivoId, 'atos_junta_comercial', dados, [], extraidos?.__texto_local || null)
      .catch((error: any) => console.warn('[P0] Evidências societárias indisponíveis; laudo preservado:', error?.message || error));
    return criarResultado('atos_junta_comercial', empresaId, arquivoId, dados, alertas, this.ultimoModeloUsado);
  }

  async analisarFaturamento(empresaId: string, arquivoId: string): Promise<AnaliseDocumentalResult> {
    this.ultimoModeloUsado = null;
    this.ultimaFonteExtracao = null;
    const { empresa, socios, documento } = await this.carregarContexto(empresaId, arquivoId);
    const extraidos = await this.extrairHibrido(documento.caminho_arquivo!, promptFaturamento12Meses(), documento.mime_type || 'application/pdf', 'faturamento_12_meses');
    const validacao = validarFaturamentoExtraido(empresa, socios, extraidos);
    await persistirEvidenciasP0(this.db, empresaId, arquivoId, 'faturamento_12_meses', validacao.dados, [], extraidos?.__texto_local || null)
      .catch((error: any) => console.warn('[P0] Faturamento rolling 12 indisponível; laudo preservado:', error?.message || error));
    return criarResultado('faturamento_12_meses', empresaId, arquivoId, validacao.dados, validacao.alertas, this.ultimoModeloUsado);
  }

  async analisarComprovanteResidencia(empresaId: string, arquivoId: string): Promise<AnaliseDocumentalResult> {
    this.ultimoModeloUsado = null;
    this.ultimaFonteExtracao = null;
    const { socios, documento } = await this.carregarContexto(empresaId, arquivoId);
    const extraidos = await this.extrairHibrido(documento.caminho_arquivo!, promptComprovanteResidencia(), documento.mime_type || 'application/pdf', 'comprovante_residencia');
    const validacao = validarComprovanteEnderecoExtraido(socios, extraidos, documento.socio_id || null);
    await persistirEvidenciasP0(this.db, empresaId, arquivoId, 'comprovante_residencia', validacao.dados, [], extraidos?.__texto_local || null)
      .catch((error: any) => console.warn('[P0] Evidências de endereço indisponíveis; laudo preservado:', error?.message || error));
    return criarResultado('comprovante_residencia', empresaId, arquivoId, validacao.dados, validacao.alertas, this.ultimoModeloUsado);
  }

  async analisarDocumentoCatalogado(empresaId: string, arquivoId: string, tipoDocumento: string): Promise<AnaliseDocumentalGenericaResult> {
    this.ultimoModeloUsado = null;
    this.ultimaFonteExtracao = null;
    const catalogo = getDocumentCatalogEntry(tipoDocumento);
    if (!catalogo) throw new Error(`Tipo documental não catalogado: ${tipoDocumento}`);
    const tipoCanonico = canonicalizeDocumentType(tipoDocumento);
    const promptConfig = documentAnalysisConfig(tipoDocumento);
    const prompt = promptDocumentoCatalogado(tipoDocumento, catalogo.nome, catalogo.categoria, promptConfig?.promptCodigo || `catalogo_${tipoCanonico}`);
    const { documento } = await this.carregarContexto(empresaId, arquivoId);
    const tipoLocal = tipoLeitorLocalDocumentoCatalogado(tipoDocumento);
    const extraidos = await this.extrairHibrido(documento.caminho_arquivo!, prompt, documento.mime_type || 'application/pdf', tipoLocal, true, tipoDocumento);
    const normalizado = normalizarDocumentoCatalogado(extraidos, tipoDocumento);
    const resultadoBase = criarResultado('documento_generico', empresaId, arquivoId, normalizado.dados, normalizado.alertas, this.ultimoModeloUsado);
    await persistirEvidenciasP0(this.db, empresaId, arquivoId, tipoDocumento, normalizado.dados, normalizado.evidencias, normalizado.textoFonte)
      .catch((error: any) => console.warn('[P0] Evidências temporais/rolling/bureau indisponíveis; laudo preservado:', error?.message || error));
    return {
      ...resultadoBase,
      tipo_analise: 'documento_generico',
      tipo_documento: tipoDocumento,
      tipo_documento_canonico: tipoCanonico,
      evidencias: normalizado.evidencias,
      campos_inferidos: normalizado.camposInferidos,
      competencia: normalizado.dados.competencia,
      validade: normalizado.dados.validade,
    };
  }

  async analisarExtratoBancario(empresaId: string, arquivoId: string, semanaInicio: string, semanaFim: string): Promise<AnaliseExtratoBancarioResult> {
    this.ultimoModeloUsado = null;
    this.ultimaFonteExtracao = null;
    const { documento } = await this.carregarContexto(empresaId, arquivoId);
    const extraidos = await this.extrairHibrido(documento.caminho_arquivo!, promptExtratoBancario(), documento.mime_type || 'application/pdf', 'extrato_bancario');
    const dados = normalizarExtratoBancario(extraidos, semanaInicio, semanaFim);
    return {
      arquivo_id: arquivoId,
      empresa_id: empresaId,
      ...dados,
      modelo_ia: this.ultimoModeloUsado,
      fonte_extracao: dados.fonte_extracao || this.ultimaFonteExtracao,
    };
  }


  async analisarContratoComAtosJunta(empresaId: string, contratoArquivoId: string, atosArquivoId: string): Promise<AnaliseDocumentalResult> {
    this.ultimoModeloUsado = null;
    this.ultimaFonteExtracao = null;
    const [contratoContexto, atosContexto] = await Promise.all([
      this.carregarContexto(empresaId, contratoArquivoId),
      this.carregarContexto(empresaId, atosArquivoId),
    ]);
    const [contrato, atos] = await Promise.all([
      this.extrairHibrido(contratoContexto.documento.caminho_arquivo!, promptContratoSocial(), contratoContexto.documento.mime_type || 'application/pdf', 'contrato_social_alteracao'),
      this.extrairHibrido(atosContexto.documento.caminho_arquivo!, promptAtosJunta(), atosContexto.documento.mime_type || 'application/pdf', 'atos_junta_comercial'),
    ]);
    const contratoNormalizado = normalizarDadosContratoSocial(contrato);
    const atosNormalizados = normalizarDadosAtos(atos);
    const analiseSocietariaAuditavel = executarAgenteAnaliseSocietaria(
      contratoNormalizado,
      atosNormalizados,
      contratoContexto.empresa,
      contratoContexto.socios,
    );
    const alertasBase = validarContratoComAtosJunta(contratoNormalizado, atosNormalizados, contratoContexto.empresa, contratoContexto.socios);
    const alertasAgente: AlertaDocumental[] = analiseSocietariaAuditavel.revisao_obrigatoria
      ? [{
          codigo: 'contrato_agente_societario_revisao_obrigatoria',
          campo: 'analise_societaria_auditavel',
          mensagem: `A reconstrução societária exige revisão humana: ${analiseSocietariaAuditavel.motivos_revisao.join(' ')}`,
          severidade: 'alta',
          valor_documento: analiseSocietariaAuditavel,
          recomendacao: 'Conferir o documento inteiro, a certificação da Junta, o quadro final e o QSA vigente antes de concluir.',
        }]
      : [];
    const alertas = uniqueAlerts([...alertasBase, ...alertasAgente]);
    const dados = {
      contrato_arquivo_id: contratoArquivoId,
      atos_arquivo_id: atosArquivoId,
      contrato: contratoNormalizado,
      atos_junta: atosNormalizados,
      analise_societaria_auditavel: analiseSocietariaAuditavel,
      status_societario: analiseSocietariaAuditavel.status_documento,
      estado_atual_societario: analiseSocietariaAuditavel.estado_atual,
      linha_tempo_societaria: analiseSocietariaAuditavel.linha_tempo_societaria,
      evidencias_societarias: analiseSocietariaAuditavel.evidencias,
      datas_chave: {
        data_documento: contratoNormalizado.data_documento,
        data_registro: contratoNormalizado.data_registro,
        data_efeitos_registro: contratoNormalizado.data_efeitos_registro,
        data_ato_junta_mais_recente: atosNormalizados.historico_arquivamentos?.at(-1)?.data || atosNormalizados.data_registro || null,
      },
      tipo_ato: contratoNormalizado.tipo_ato,
      diagnostico_factual: analiseSocietariaAuditavel.diagnostico_objetivo,
      nire_confere: onlyDigits(contratoNormalizado.nire) !== '' && onlyDigits(contratoNormalizado.nire) === onlyDigits(atosNormalizados.nire),
      data_registro_confere: !!parseDate(contratoNormalizado.data_registro) && [
        parseDate(atosNormalizados.data_registro),
        ...(Array.isArray(atosNormalizados.historico_arquivamentos) ? atosNormalizados.historico_arquivamentos.map((item: any) => parseDate(item?.data)) : []),
      ].filter(Boolean).includes(parseDate(contratoNormalizado.data_registro)),
      numero_ato_confere: !!onlyDigits(contratoNormalizado.numero_arquivamento) && (Array.isArray(atosNormalizados.historico_arquivamentos)
        ? atosNormalizados.historico_arquivamentos.some((item: any) => onlyDigits(item?.numero) === onlyDigits(contratoNormalizado.numero_arquivamento))
        : false),
      cnpj_empresa_confere: !!onlyDigits(contratoNormalizado.cnpj) && onlyDigits(contratoNormalizado.cnpj) === onlyDigits(contratoContexto.empresa?.cnpj),
      confianca: Math.min(normalizarConfianca(contratoNormalizado.confianca) ?? 0, normalizarConfianca(atosNormalizados.confianca) ?? 0),
    };
    return criarResultado('contrato_junta', empresaId, contratoArquivoId, dados, alertas, this.ultimoModeloUsado);
  }
}

export const analiseDocumentalService = new AnaliseDocumentalService();

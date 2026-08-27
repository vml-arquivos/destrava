import { isSituacaoAtiva } from '../utils/situacaoCadastral';
import { normalizeText, onlyDigits } from '../utils/helpers';
import { Router, Request, Response } from 'express';
import pkg from 'pg';
import { auth } from '../middleware/auth';
import { analisarCnpjReceitaCartaoEmpresa, buscarUltimaAnaliseCnpjEmpresa, limparAnalisesCnpjEmpresa } from '../services/analiseCnpjReceitaCartao';
import { analiseDocumentalService, type AnaliseDocumentalResult, type TipoAnaliseDocumental } from '../services/analiseDocumentalEspecializada';
import { calcularCadeiaComprovacaoSocietaria } from '../services/cadeiaSocietariaService';
import { InsufficientHistoricalPeriodException, validateTwelveMonthContractHistory } from '../services/documentPipelineService';
import { buildCadastralValidationDTO, phase1Approved } from '../services/phase1AnalysisService';
import { ensureDocumentacaoSchema } from '../services/documentacaoSchema';
import { gerarMapaDocumentalCredito } from '../services/mapaDocumentalCreditoService';
import { upsertSocioEmpresa } from './socios_documentos';
import { generateBrandedPdfBuffer } from '../services/brandedPdfLayout';
import { construirSecoesAnaliseDocumento } from '../../shared/documentalPresentation';

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const router = Router();

// A leitura dos três documentos iniciais pode ultrapassar o timeout do proxy. O trabalho
// pesado roda fora da requisição HTTP e a interface consulta o mesmo dossiê
// persistido até a conclusão. A rota síncrona antiga continua disponível para
// integrações existentes.
const analisesIniciaisEmAndamento = new Map<string, Promise<void>>();
const analisesSocietariasEmAndamento = new Map<string, Promise<void>>();

// Versão específica do motor QSA da Fase 1. A troca de versão invalida somente
// resultados persistidos do QSA que foram produzidos por regras antigas, sem
// apagar arquivo, cadastro, bloco ou qualquer outra análise documental.
const VERSAO_ANALISE_DOCUMENTAL: Record<string, string> = {
  qsa_extract: '5.1.0',
  simples_extract: '1.0.0',
  atos_junta_extract: '1.0.0',
  faturamento_12m_extract: '1.0.0',
  comprovante_residencia_extract: '1.0.0',
};
const versaoPromptDocumental = (promptCodigo: string) => VERSAO_ANALISE_DOCUMENTAL[promptCodigo] || '1.0.0';

const BLOCO_CODIGOS = [
  'cnpj_receita',
  'qsa_quadro_societario',
  'atos_junta_comercial',
  'enquadramento_tributario',
  'contrato_social_alteracoes',
  'socios_representantes',
  'endereco_contatos',
  'faturamento_historico',
  'previsao_faturamento',
  'demonstracoes_contabeis_fiscais',
  'extratos_movimentacao_bancaria',
  'acompanhamento_bancario',
  'acompanhamento_financeiro',
  'certidoes_regularidade',
  'scr_endividamento',
  'garantias',
  'contratos_gerados',
  'pendencias_documentais',
  'analise_ia_credito',
] as const;

type BlocoCodigo = typeof BLOCO_CODIGOS[number];

type Pendencia = {
  codigo: string;
  mensagem: string;
  severidade: 'alta' | 'media' | 'baixa';
  origem?: string;
  recomendacao?: string;
};

function somenteDigitos(value?: string | null) {
  return String(value || '').replace(/\D/g, '');
}

function escapeHtmlRelatorio(value: unknown): string {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function dataRelatorio(value: unknown): string {
  if (!value) return '—';
  const data = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(data.getTime())) return String(value);
  return data.toLocaleDateString('pt-BR');
}

function arquivoDocumentoTemConteudo(documento: any): boolean {
  if (!documento || documento.vazio === true || documento.arquivo_vazio === true) return false;
  const tamanho = documento.tamanho_bytes ?? documento.tamanho ?? documento.size;
  if (tamanho !== undefined && tamanho !== null && Number(tamanho) <= 0) return false;
  return true;
}

function statusRelatorio(value: unknown): string {
  const status = String(value || '').toLowerCase();
  if (status.includes('valid') || status.includes('complet') || status === 'aprovado') return 'Validado';
  if (status.includes('falha') || status.includes('recus') || status.includes('bloque') || status.includes('pend')) return 'Com pendência';
  if (status.includes('process') || status.includes('analis') || status.includes('aguard')) return 'Em análise';
  return value ? String(value) : 'Anexado';
}

const TIPOS_COM_ANALISE_AUTOMATICA = new Set([
  'faturamento_12_meses',
  'comprovante_faturamento',
  'declaracao_faturamento',
  'comprovante_residencia',
]);

function documentoTemAnalise(documento: any, inicial = false, blocoStatus?: string | null): boolean {
  if (inicial) return documento?.analisado === true || documento?.consistente === true;
  if (!arquivoDocumentoTemConteudo(documento)) return false;
  const laudo = documento?.resultado_validacao?.analise_regra_documental;
  const laudoErro = documento?.resultado_validacao?.analise_regra_documental_erro;
  const tipo = String(documento?.tipo_documento || '');
  if (TIPOS_COM_ANALISE_AUTOMATICA.has(tipo)) return Boolean(laudo) || Boolean(laudoErro);
  return documento?.analisado === true
    || documento?.validado === true
    || ['validado', 'completo'].includes(String(blocoStatus || '').toLowerCase())
    || Boolean(laudo)
    || Boolean(laudoErro);
}

function chaveDocumentoRelatorio(documento: any): string {
  const codigoOriginal = normalizeText(String(documento?.codigo || documento?.tipo_documento || 'documento'));
  const nome = normalizeText(String(documento?.nome || documento?.nome_original || documento?.nome_arquivo || 'documento'));
  const tipo = normalizeText(String(documento?.tipo_documento || ''));
  const texto = `${codigoOriginal} ${tipo} ${nome}`;
  const inicial = /cartao|cnpj|qsa|quadro societ|enquadramento|simples nacional|optante/.test(texto);
  if (/atos junta|junta comercial/.test(texto)) return 'atos_junta_comercial';
  if (inicial && /qsa|quadro societ/.test(texto)) return 'qsa';
  if (inicial && /enquadramento|simples nacional|optante/.test(texto)) return 'enquadramento_tributario';
  if (inicial && /cartao|cnpj/.test(`${codigoOriginal} ${tipo} ${nome}`)) return 'cartao_cnpj';
  return `${codigoOriginal}:${nome}`;
}

function pontuacaoDocumentoRelatorio(documento: any): number {
  return (documento?.analisado ? 4 : 0)
    + (documento?.consistente ? 3 : 0)
    + (documento?.observacao ? 1 : 0)
    + (documento?.criado_em ? 1 : 0);
}

function deduplicarDocumentosRelatorio<T extends Record<string, any>>(documentos: T[]): T[] {
  const unicos = new Map<string, T>();
  for (const documento of documentos) {
    const chave = chaveDocumentoRelatorio(documento);
    const anterior = unicos.get(chave);
    if (!anterior || pontuacaoDocumentoRelatorio(documento) > pontuacaoDocumentoRelatorio(anterior)) unicos.set(chave, documento);
  }
  return Array.from(unicos.values());
}

function valorResultadoRelatorio(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => typeof item === 'object' ? item.nome || item.label || item.valor || null : String(item)).filter(Boolean).join(', ') || null;
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'object') return null;
  return String(value);
}

function montarResultadoDetalhadoRelatorio(documento: any, analiseEspecializada: any = null) {
  const laudo = documento?.resultado_validacao?.analise_regra_documental;
  const laudoErro = documento?.resultado_validacao?.analise_regra_documental_erro;
  const analiseNormalizada = analiseEspecializada?.resultado_analise || analiseEspecializada || null;
  const analise = analiseNormalizada || laudo || null;
  const dados = analise?.dados_extraidos || {};
  const contratoDados = dados?.contrato || {};
  const analiseSocietariaAuditavel = analise?.analise_societaria_auditavel
    || documento?.analise_societaria_auditavel
    || contratoDados?.analise_societaria_auditavel
    || dados?.analise_societaria_auditavel
    || null;
  const diagnosticoFactual = analise?.diagnostico_factual
    || analiseSocietariaAuditavel?.diagnostico_objetivo
    || documento?.diagnostico_factual
    || contratoDados?.diagnostico_factual
    || dados?.diagnostico_factual
    || null;
  const alteracoesSocietarias = Array.isArray(analise?.alteracoes_societarias)
    ? analise.alteracoes_societarias
    : Array.isArray(documento?.alteracoes_societarias)
      ? documento.alteracoes_societarias
      : Array.isArray(contratoDados?.alteracoes_societarias)
        ? contratoDados.alteracoes_societarias
        : Array.isArray(analiseSocietariaAuditavel?.alteracoes_documento)
          ? analiseSocietariaAuditavel.alteracoes_documento
          : [];
  const quadroSocietarioFinal = Array.isArray(analise?.quadro_societario_final)
    ? analise.quadro_societario_final
    : Array.isArray(documento?.quadro_societario_final)
      ? documento.quadro_societario_final
      : Array.isArray(contratoDados?.quadro_societario_final)
        ? contratoDados.quadro_societario_final
        : Array.isArray(analiseSocietariaAuditavel?.quadro_final_documento)
          ? analiseSocietariaAuditavel.quadro_final_documento
          : [];
  const fontesSociosLidos = [
    analise?.socios_lidos,
    analise?.socios,
    dados?.socios_lidos,
    dados?.socios,
    dados?.qsa?.socios,
    documento?.socios_lidos,
    documento?.socios,
    documento?.analise_documental?.socios_lidos,
    documento?.analise_documental?.socios,
  ];
  const sociosLidos = Array.from(new Map(
    fontesSociosLidos
      .filter(Array.isArray)
      .flatMap((lista: any[]) => lista)
      .filter((socio: any) => socio && typeof socio === 'object' && String(socio.nome || socio.nome_socio || socio.razao_social || '').trim())
      .map((socio: any) => {
        const nome = String(socio.nome || socio.nome_socio || socio.razao_social).trim();
        return [nome.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase(), { ...socio, nome }] as [string, any];
      }),
  ).values());
  const evidencias = Array.from(new Set([
    ...(Array.isArray(analise?.evidencias) ? analise.evidencias.map((item: any) => item?.texto || item).filter(Boolean).map(String) : []),
    ...alteracoesSocietarias.map((alteracao: any) => alteracao?.evidencia).filter(Boolean).map(String),
    ...(Array.isArray(analiseSocietariaAuditavel?.evidencias) ? analiseSocietariaAuditavel.evidencias.map((item: any) => item?.texto || item).filter(Boolean).map(String) : []),
  ]));
  const campos = {
    ...(analise?.campos_principais || {}),
    ...(documento?.campos_principais || {}),
  };
  const camposResultado: Array<{ label: string; valor: string }> = [];
  const adicionarCampo = (label: string, value: unknown) => {
    const valor = valorResultadoRelatorio(value);
    if (valor) camposResultado.push({ label, valor });
  };
  Object.entries(campos).forEach(([chave, valor]) => adicionarCampo(chave.replace(/_/g, ' '), valor));
  adicionarCampo('CNPJ do QSA', dados?.cnpj);
  adicionarCampo('Razão social do QSA', dados?.razao_social);
  adicionarCampo('Capital social do QSA', dados?.capital_social);
  adicionarCampo('Sócios lidos no QSA', sociosLidos.length || null);
  adicionarCampo('NIRE', documento?.nire || dados?.nire || dados?.contrato?.nire);
  adicionarCampo('Data de registro', documento?.data_registro || dados?.data_registro || dados?.contrato?.data_registro);
  adicionarCampo('Tipo do ato', documento?.tipo_ato || dados?.tipo_ato || dados?.contrato?.tipo_ato);
  adicionarCampo('Sócios identificados', sociosLidos.length || (Array.isArray(documento?.socios) ? documento.socios.length : null));
  adicionarCampo('Fonte da leitura', documento?.fonte || documento?.fonte_extracao || analise?.modelo_ia);
  adicionarCampo('Confiança da leitura', documento?.confianca ?? documento?.nivel_confianca ?? analise?.nivel_confianca);
  adicionarCampo('Status da leitura', documento?.status_leitura || analise?.status);
  if (dados?.periodo_analisado) adicionarCampo('Período analisado', dados.periodo_analisado);
  if (dados?.titular_identificado) adicionarCampo('Titular identificado', dados.titular_identificado);
  adicionarCampo('CNPJ do contrato', contratoDados?.cnpj);
  adicionarCampo('Razão social do contrato', contratoDados?.razao_social);
  adicionarCampo('Número do arquivamento', contratoDados?.numero_arquivamento);
  adicionarCampo('Capital social anterior', contratoDados?.capital_social_anterior);
  adicionarCampo('Capital social atual', contratoDados?.capital_social_atual);
  adicionarCampo('Status societário', analiseSocietariaAuditavel?.status_documento || dados?.status_societario);
  adicionarCampo('Data do documento', contratoDados?.data_documento || dados?.datas_chave?.data_documento);
  adicionarCampo('Data de efeitos do registro', contratoDados?.data_efeitos_registro || dados?.datas_chave?.data_efeitos_registro);
  adicionarCampo('Data do ato mais recente da Junta', dados?.datas_chave?.data_ato_junta_mais_recente);
  adicionarCampo('Confronto com QSA', analiseSocietariaAuditavel?.confronto_qsa?.status || dados?.estado_atual_societario?.fonte);

  const alertas = [
    ...(Array.isArray(documento?.alertas) ? documento.alertas : []),
    ...(Array.isArray(analise?.alertas) ? analise.alertas : []),
  ].filter((item: any) => item && (item.mensagem || item.codigo));
  const observacoes = [
    ...(Array.isArray(analise?.observacoes) ? analise.observacoes : []),
    documento?.diagnostico,
    documento?.mensagem,
    documento?.observacao,
    laudoErro?.mensagem ? `Falha na análise automática: ${laudoErro.mensagem}` : null,
    analise?.revisao_humana_necessaria === true ? 'A análise exige revisão humana antes da conclusão operacional.' : null,
    analiseSocietariaAuditavel?.revisao_obrigatoria ? 'A análise societária exige revisão humana antes da conclusão operacional.' : null,
    ...(Array.isArray(analiseSocietariaAuditavel?.motivos_revisao) ? analiseSocietariaAuditavel.motivos_revisao : []),
  ].filter(Boolean).map(String);
  const observacoesUnicas = Array.from(new Set(observacoes));
  const temEvidenciaDeAnalise = documento?.analisado === true
    || documento?.validado === true
    || documento?.consistente === true
    || Boolean(laudo)
    || Boolean(analiseEspecializada);
  const resultado = documento?.analisado === false || !temEvidenciaDeAnalise
    ? 'Aguardando leitura documental.'
    : documento?.consistente === true || analise?.status === 'concluido'
      ? 'Leitura concluída; documento considerado consistente.'
      : 'Leitura concluída com observações ou necessidade de revisão.';

  return {
    conclusao: resultado,
    diagnostico: diagnosticoFactual || observacoesUnicas[0] || null,
    diagnostico_factual: diagnosticoFactual,
    tipo_documento: documento?.tipo_documento || null,
    tipo_leitura: documento?.tipo_leitura || (String(documento?.codigo || '').toLowerCase() === 'qsa' ? 'qsa' : null),
    qsa_leitura: documento?.qsa_leitura === true || String(documento?.tipo_documento || '').toLowerCase() === 'qsa' || String(documento?.codigo || '').toLowerCase() === 'qsa',
    socios_lidos: sociosLidos,
    alteracoes_societarias: alteracoesSocietarias,
    quadro_societario_final: quadroSocietarioFinal,
    evidencias,
    analise_societaria_auditavel: analiseSocietariaAuditavel,
    status_societario: analiseSocietariaAuditavel?.status_documento || dados?.status_societario || null,
    estado_atual_societario: analiseSocietariaAuditavel?.estado_atual || dados?.estado_atual_societario || null,
    confronto_qsa: analiseSocietariaAuditavel?.confronto_qsa || null,
    linha_tempo_societaria: analiseSocietariaAuditavel?.linha_tempo_societaria || dados?.linha_tempo_societaria || [],
    qsa_adicional_necessario: analiseSocietariaAuditavel?.qsa_adicional_necessario === true,
    qsa_adicional_motivo: analiseSocietariaAuditavel?.qsa_adicional_motivo || null,
    datas_chave: dados?.datas_chave || null,
    motivos_revisao: analiseSocietariaAuditavel?.motivos_revisao || [],
    campos: camposResultado,
    observacoes: observacoesUnicas.filter((item) => item !== diagnosticoFactual).slice(1),
    alertas: alertas.map((item: any) => ({
      codigo: item.codigo || 'alerta_documental',
      mensagem: item.mensagem || String(item.codigo || 'Alerta documental'),
      severidade: item.severidade || 'media',
      recomendacao: item.recomendacao || null,
    })),
  };
}

export async function montarRelatorioDocumental(dossie: any) {
  const blocos = Array.isArray(dossie?.blocos) ? dossie.blocos : [];
  const mapa = dossie?.mapa_documental_credito || {};
  const etapas = Array.isArray(mapa.etapas) ? mapa.etapas : [];
  const documentosIniciais = Object.values(dossie?.identidade_cnpj?.documentos_iniciais || {}) as any[];
  const documentacaoSocietaria = dossie?.documentacao_societaria || {};
  const documentosSocietarios = Array.isArray(documentacaoSocietaria.documentos_analisados)
    ? documentacaoSocietaria.documentos_analisados
    : [];
  const analisesSocietariasPorArquivo = new Map<string, any>(documentosSocietarios.map((documento: any) => [String(documento.arquivo_id), documento] as [string, any]));
  if (documentacaoSocietaria.atos_arquivo_id && documentacaoSocietaria.analisado === true) {
    analisesSocietariasPorArquivo.set(String(documentacaoSocietaria.atos_arquivo_id), {
      arquivo_id: documentacaoSocietaria.atos_arquivo_id,
      nome: 'Atos da Junta Comercial',
      consistente: documentacaoSocietaria.atos_junta_aprovados === true,
      nire: documentacaoSocietaria.nire_junta,
      data_registro: documentacaoSocietaria.data_ato_junta,
      diagnostico: documentacaoSocietaria.diagnostico,
      resultado_analise: documentacaoSocietaria.resultado_analise_atos || null,
      alertas: [
        ...(Array.isArray(documentacaoSocietaria.avisos) ? documentacaoSocietaria.avisos : []).map((mensagem: string) => ({ mensagem, severidade: 'media' })),
        ...(Array.isArray(documentacaoSocietaria.bloqueios) ? documentacaoSocietaria.bloqueios : []).map((mensagem: string) => ({ mensagem, severidade: 'alta' })),
      ],
    });
  }
  const documentosAnexados = blocos.flatMap((bloco: any) => (Array.isArray(bloco.documentos) ? bloco.documentos : []).map((documento: any) => ({
    ...documento,
    bloco_codigo: bloco.codigo,
    bloco_nome: bloco.nome_amigavel,
    bloco_status: bloco.status,
  })));

  // Bug real observado: um QSA (ou outro documento com análise especializada
  // própria) podia aparecer no relatório como "Validado"/"Leitura concluída;
  // documento considerado consistente" mesmo quando a extração de IA não achou
  // nenhum sócio -- porque este relatório só conhecia a análise especializada
  // dos documentos societários (contrato/alteração + atos da Junta) e, para
  // qualquer outro arquivo, caía de volta na flag manual `documento.validado`
  // (um campo administrativo, não uma confirmação de que a IA leu o conteúdo).
  // Isso é o mesmo laudo persistido que `montarQsaDocumentalDados` já usa para
  // decidir a Etapa 1 -- aqui ele só precisa ser buscado por arquivo (o Acervo
  // Documental permite múltiplos arquivos do mesmo tipo, ex.: mais de um QSA).
  const idsParaAnaliseEspecializada = new Map<string, string>();
  for (const documento of documentosAnexados) {
    const id = String(documento?.id || '');
    if (!id || analisesSocietariasPorArquivo.has(id)) continue;
    const configuracao = ANALISE_ESPECIALIZADA_POR_TIPO[String(documento?.tipo_documento || '')];
    if (configuracao) idsParaAnaliseEspecializada.set(id, configuracao.promptCodigo);
  }
  const analisesPorTipoPorArquivo = new Map<string, any>(
    (await Promise.all(
      Array.from(idsParaAnaliseEspecializada.entries()).map(async ([id, promptCodigo]) => {
        try {
          const resultado = await buscarAnaliseEspecializadaPersistida(id, promptCodigo);
          return resultado ? ([id, resultado] as [string, any]) : null;
        } catch (error) {
          console.warn('[Relatório documental] Falha ao buscar análise especializada persistida:', id, promptCodigo, (error as any)?.message || error);
          return null;
        }
      }),
    )).filter((item): item is [string, any] => item !== null),
  );

  const documentosRelatorio = deduplicarDocumentosRelatorio([
    ...documentosIniciais
      .filter((documento) => documentoTemAnalise(documento, true))
      .map((documento: any) => ({ documento, inicial: true })),
    ...documentosAnexados.map((documento: any) => ({ documento, inicial: false })),
  ].map(({ documento, inicial }) => {
    const laudo = documento?.resultado_validacao?.analise_regra_documental;
    const laudoErro = documento?.resultado_validacao?.analise_regra_documental_erro;
    const analiseEspecializada = analisesSocietariasPorArquivo.get(String(documento?.id || ''))
      || analisesPorTipoPorArquivo.get(String(documento?.id || ''))
      || null;
    const conteudoValido = inicial || arquivoDocumentoTemConteudo(documento);
    const analisado = documentoTemAnalise(documento, inicial, documento?.bloco_status)
      || (conteudoValido && Boolean(analiseEspecializada));
    const tipoTemAnaliseAutomatica = TIPOS_COM_ANALISE_AUTOMATICA.has(String(documento?.tipo_documento || ''));
    // Quando existe uma análise especializada real para ESTE arquivo, ela manda:
    // nem uma flag manual de "validado" pode transformar uma leitura que a IA
    // marcou como incompleta/revisão em "consistente" no relatório, nem a
    // ausência dela deve esconder uma leitura que a IA de fato concluiu bem.
    // Sem análise especializada para o tipo do documento (ex.: certidões,
    // garantias), o comportamento anterior é preservado.
    const analiseEspecializadaIndicaConsistente = Boolean(analiseEspecializada?.consistente) || analiseEspecializada?.status === 'concluido';
    const consistente = inicial
      ? documento.consistente === true
      : analiseEspecializada
        ? analiseEspecializadaIndicaConsistente
        : documento.consistente === true
          || (documento.validado === true && !laudoErro && (!tipoTemAnaliseAutomatica || Boolean(laudo)) && documento.exige_revisao_humana !== true);
    const statusOrigem = laudoErro ? 'falha_leitura' : documento.status || laudo?.status || (consistente ? 'validado' : analisado ? 'analisado' : 'aguardando_analise');
    const resultadoDetalhado = montarResultadoDetalhadoRelatorio({ ...documento, analisado, consistente }, analiseEspecializada);
    if (!analisado) {
      resultadoDetalhado.conclusao = 'Anexo recebido, aguardando análise documental.';
      if (!resultadoDetalhado.diagnostico) resultadoDetalhado.diagnostico = 'O arquivo foi anexado, mas ainda não existe laudo concluído para este documento.';
    }
    return {
      codigo: documento.codigo || documento.tipo_documento || documento.bloco_codigo || 'documento',
      tipo_documento: documento.tipo_documento || null,
      nome: documento.nome || documento.nome_original || documento.bloco_nome || documento.tipo_documento || 'Documento',
      bloco: documento.bloco_nome || documento.etapa || 'Análise documental',
      status: analisado ? statusRelatorio(statusOrigem) : 'Aguardando análise',
      analisado,
      consistente,
      criado_em: documento.criado_em || documento.analisado_em || null,
      observacao: resultadoDetalhado.diagnostico || (analisado
        ? documento.bloco_status || (consistente ? 'Documento lido e considerado consistente.' : 'Leitura concluída com pendências.')
        : 'Anexo recebido, mas ainda não possui laudo de análise. Não foi considerado validado.'),
      resultado_analise: resultadoDetalhado,
    };
  }));
  const analisadosUnicos = documentosRelatorio.filter((documento) => documento.analisado);
  const pendentesAnaliseUnicos = documentosRelatorio.filter((documento) => !documento.analisado);

  const faltantesMapa = etapas.flatMap((etapa: any) => (Array.isArray(etapa.documentos) ? etapa.documentos : [])
    .filter((documento: any) => documento.obrigatorio && !documento.anexado)
    .map((documento: any) => ({
      codigo: documento.codigo,
      nome: documento.nome,
      etapa: etapa.titulo || `Etapa ${etapa.numero || ''}`.trim(),
      finalidade: documento.finalidade || 'Documento obrigatório para concluir a etapa.',
      origem: 'Mapa documental de crédito',
      obrigatorio: true,
    })));
  const faltantesPendencias = (Array.isArray(dossie?.pendencias) ? dossie.pendencias : [])
    .filter((pendencia: any) => {
      const texto = normalizeText(`${pendencia?.codigo || ''} ${pendencia?.mensagem || ''} ${pendencia?.recomendacao || ''}`);
      return pendencia?.anexado === false
        || /nao anex|ausente|sem documento|nenhum .*localizado|falta anex/.test(texto);
    })
    .map((pendencia: any) => ({
      codigo: pendencia.codigo || 'pendencia_documental',
      nome: pendencia.bloco_nome || pendencia.codigo || 'Pendência documental',
      etapa: pendencia.bloco_nome || 'Análise documental',
      finalidade: pendencia.mensagem || pendencia.recomendacao || 'Regularizar a pendência indicada.',
      origem: pendencia.origem || 'Análise documental',
      obrigatorio: true,
      severidade: pendencia.severidade || 'media',
    }));
  const faltantes = Array.from(new Map([...faltantesMapa, ...faltantesPendencias].map((item) => [
    `${normalizeText(String(item.codigo || 'pendencia'))}:${normalizeText(String(item.nome || 'documento'))}`,
    item,
  ])).values());
  const blocosAnalisados = blocos.filter((bloco: any) => bloco.status || bloco.completo || bloco.validado || (Array.isArray(bloco.documentos) && bloco.documentos.length > 0)).map((bloco: any) => ({
    codigo: bloco.codigo,
    nome: bloco.nome_amigavel || bloco.codigo,
    status: statusRelatorio(bloco.status || (bloco.completo ? 'completo' : bloco.validado ? 'validado' : 'analisado')),
    completo: bloco.completo === true,
    validado: bloco.validado === true,
    documentos: Array.isArray(bloco.documentos) ? bloco.documentos.length : 0,
    pendencias: Array.isArray(bloco.pendencias) ? bloco.pendencias : [],
  }));
  const pendenciasAltas = faltantes.filter((item: any) => item.severidade === 'alta').length;
  const statusGeral = faltantes.length === 0 && pendentesAnaliseUnicos.length === 0
    ? 'Documentação obrigatória identificada como completa'
    : pendenciasAltas > 0 || pendentesAnaliseUnicos.length > 0
      ? 'Pendente de documentos e/ou correções'
      : 'Em complementação documental';

  return {
    gerado_em: new Date().toISOString(),
    empresa: dossie?.empresa || {},
    regime: {
      codigo: mapa.regime_identificado || 'nao_identificado',
      descricao: mapa.regime_descricao || 'Regime ainda não identificado',
      etapa_atual: mapa.etapa_atual || null,
    },
    status_geral: statusGeral,
    resumo: {
      ...(dossie?.resumo || {}),
      documentos_analisados: analisadosUnicos.length,
      documentos_pendentes_analise: pendentesAnaliseUnicos.length,
      blocos_analisados: blocosAnalisados.length,
      documentos_faltantes: faltantes.length,
      pendencias_altas: pendenciasAltas,
    },
    identidade_cnpj: {
      status: dossie?.identidade_cnpj?.status || 'PHASE_1_PENDING',
      apto_para_avancar: dossie?.identidade_cnpj?.apto_para_avancar === true,
      documentos_iniciais: documentosIniciais,
      validacao: dossie?.identidade_cnpj?.validation || null,
    },
    documentacao_societaria: documentacaoSocietaria,
    resultados_analises: [
      {
        codigo: 'identidade_cnpj',
        titulo: 'Identidade do CNPJ',
        status: dossie?.identidade_cnpj?.apto_para_avancar === true ? 'Concluída' : 'Pendente de correções ou complementos',
        conclusao: dossie?.identidade_cnpj?.diagnostico || 'A validação inicial ainda não foi concluída.',
        pontos_positivos: Array.isArray(dossie?.identidade_cnpj?.pontos_positivos) ? dossie.identidade_cnpj.pontos_positivos : [],
        observacoes: Array.isArray(dossie?.identidade_cnpj?.avisos_estrategicos) ? dossie.identidade_cnpj.avisos_estrategicos : [],
        bloqueios: Array.isArray(dossie?.identidade_cnpj?.motivos_pendentes) ? dossie.identidade_cnpj.motivos_pendentes : [],
      },
      {
        codigo: 'documentacao_societaria',
        titulo: 'Continuidade societária, Atos da Junta e contratos',
        status: documentacaoSocietaria.apto_para_avancar === true ? 'Concluída' : documentacaoSocietaria.analisado ? 'Analisada com pendências' : 'Aguardando análise',
        conclusao: documentacaoSocietaria.diagnostico || 'A etapa societária ainda não foi concluída.',
        pontos_positivos: [
          documentacaoSocietaria.nire_confere === true ? 'NIRE do contrato confere com o NIRE da Junta Comercial.' : null,
          documentacaoSocietaria.data_confere === true ? 'Data do contrato confere com o último registro identificado na Junta Comercial.' : null,
          documentacaoSocietaria.continuidade_12_meses_comprovada === true ? `Histórico societário comprova ${documentacaoSocietaria.meses_comprovados || 12} meses ou mais de continuidade.` : null,
        ].filter(Boolean),
        observacoes: Array.isArray(documentacaoSocietaria.avisos) ? documentacaoSocietaria.avisos : [],
        bloqueios: Array.isArray(documentacaoSocietaria.bloqueios) ? documentacaoSocietaria.bloqueios : [],
      },
    ],
    anotacoes: Array.from(new Set([
      ...(Array.isArray(dossie?.identidade_cnpj?.pontos_positivos) ? dossie.identidade_cnpj.pontos_positivos : []),
      ...(Array.isArray(dossie?.identidade_cnpj?.avisos_estrategicos) ? dossie.identidade_cnpj.avisos_estrategicos : []),
      ...(Array.isArray(documentacaoSocietaria.avisos) ? documentacaoSocietaria.avisos : []),
      ...(Array.isArray(documentacaoSocietaria.bloqueios) ? documentacaoSocietaria.bloqueios : []),
    ].filter(Boolean))),
    blocos_analisados: blocosAnalisados,
    documentos_analisados: analisadosUnicos,
    documentos_pendentes_analise: pendentesAnaliseUnicos,
    documentos_faltantes: faltantes,
    pendencias: Array.isArray(dossie?.pendencias) ? dossie.pendencias : [],
    proxima_acao: mapa.proxima_acao || 'Revisar o acervo documental e anexar os itens pendentes.',
    proximas_etapas: etapas.map((etapa: any) => ({
      numero: etapa.numero,
      titulo: etapa.titulo,
      bloqueada: etapa.bloqueada === true,
      documentos_faltantes: (Array.isArray(etapa.documentos) ? etapa.documentos : []).filter((documento: any) => documento.obrigatorio && !documento.anexado).length,
    })),
  };
}

function compactarTextoPdf(value: unknown, maxLength = 320): string {
  const texto = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (texto.length <= maxLength) return texto;
  return `${texto.slice(0, maxLength - 1).trimEnd()}…`;
}

function nomePessoaSocietariaPdf(value: any): string | null {
  if (!value || typeof value !== 'object') return null;
  const nome = value.nome || value.nome_socio || value.nomeSocio || value.socio || null;
  return nome ? compactarTextoPdf(nome, 180) : null;
}

function gerarHtmlResumoSocietarioPdf(relatorio: any): string {
  const empresa = relatorio.empresa || {};
  const societaria = relatorio.documentacao_societaria || {};
  const documentos = Array.isArray(societaria.documentos_analisados) ? societaria.documentos_analisados : [];
  const candidatosVigentes = documentos.filter((documento: any) =>
    documento?.estado_atual_societario?.fonte === 'contrato'
    || documento?.analise_societaria_auditavel?.status_documento === 'atual'
  );
  const ordenarPorData = (a: any, b: any) => String(b?.data_registro || '').localeCompare(String(a?.data_registro || ''));
  const documentoVigente = [...(candidatosVigentes.length ? candidatosVigentes : documentos)].sort(ordenarPorData)[0] || null;
  const analise = documentoVigente?.analise_societaria_auditavel || {};
  const alteracoes = Array.isArray(documentoVigente?.alteracoes_societarias)
    ? documentoVigente.alteracoes_societarias
    : [];
  const transacoes = alteracoes.map((alteracao: any) => {
    const cedente = nomePessoaSocietariaPdf(alteracao?.cedente || alteracao?.socio_retirante);
    const cessionario = nomePessoaSocietariaPdf(alteracao?.cessionario || alteracao?.socio_admitido);
    const quotas = alteracao?.quotas_transferidas?.quantidade
      ?? alteracao?.quotas_transferidas?.quotas
      ?? alteracao?.quotas_transferidas
      ?? null;
    if (cedente && cessionario) {
      return `Transferência de ${cedente} para ${cessionario}${quotas ? ` — ${compactarTextoPdf(quotas, 120)} quotas` : ''}.`;
    }
    if (cedente) return `Retirada de ${cedente}; o cessionário não foi identificado expressamente.`;
    if (cessionario) return `Entrada de ${cessionario}; o cedente não foi identificado expressamente.`;
    return null;
  }).filter(Boolean) as string[];
  const atoPraticado = analise.ato_praticado || documentoVigente?.resultado_analise?.ato_praticado || null;
  const transacoesFinais = transacoes.length ? transacoes : atoPraticado ? [compactarTextoPdf(atoPraticado, 360)] : ['A alteração societária não foi identificada expressamente no laudo.'];
  const dataAlteracao = documentoVigente?.data_registro || analise.ato_mais_recente?.data || societaria.data_ato_junta || null;
  const sociosAtuais = Array.isArray(analise.estado_atual?.socios) && analise.estado_atual.socios.length
    ? analise.estado_atual.socios
    : Array.isArray(documentoVigente?.quadro_societario_final) ? documentoVigente.quadro_societario_final : [];
  const titularAtual = sociosAtuais.map((socio: any) => nomePessoaSocietariaPdf(socio)).filter(Boolean) as string[];
  const evidencias = [
    ...(Array.isArray(analise.evidencias) ? analise.evidencias : []),
    ...(Array.isArray(documentoVigente?.resultado_analise?.evidencias) ? documentoVigente.resultado_analise.evidencias : []),
  ].map((evidencia: any) => compactarTextoPdf(evidencia?.texto || evidencia, 420)).filter(Boolean);
  const documentosComData = documentos.filter((documento: any) => documento?.data_registro).sort(ordenarPorData);
  const dataMaisRecente = documentosComData[0]?.data_registro || societaria.data_ato_junta || null;
  const dataMaisAntiga = documentosComData[documentosComData.length - 1]?.data_registro || null;
  const mesesComprovados = societaria.meses_comprovados || (societaria.continuidade_12_meses_comprovada ? 12 : null);
  const continuidade = societaria.continuidade_12_meses_comprovada === true
    ? `Comprovação de continuidade superior a 12 meses${mesesComprovados ? `: ${mesesComprovados} meses` : ''}${dataMaisAntiga && dataMaisRecente ? `, entre ${dataRelatorio(dataMaisAntiga)} e ${dataRelatorio(dataMaisRecente)}` : ''}.`
    : 'A comprovação de continuidade superior a 12 meses não foi confirmada no laudo atual.';
  const nomeEmpresa = empresa.razao_social || empresa.nome_fantasia || 'Empresa não identificada';
  const nomeDocumento = documentoVigente?.nome || 'Alteração contratual vigente';
  const titularTexto = titularAtual.length ? titularAtual.join('; ') : 'Titular atual não identificado expressamente.';
  const evidenciaHtml = evidencias.length
    ? evidencias.slice(0, 3).map((evidencia) => `<li>${escapeHtmlRelatorio(evidencia)}</li>`).join('')
    : '<li>Não foi localizada evidência textual suficiente no laudo persistido.</li>';

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Resultado da alteração societária — ${escapeHtmlRelatorio(nomeEmpresa)}</title><style>
  @page { size: A4; margin: 36mm 22mm 28mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 2mm 0 0; font-family: Arial, sans-serif; color: #172033; font-size: 10pt; line-height: 1.45; }
  h1 { color: #123b78; font-size: 17pt; margin: 0 0 4px; }
  h2 { color: #123b78; font-size: 11pt; margin: 16px 0 6px; border-bottom: 1px solid #d9e2ef; padding-bottom: 4px; }
  p { margin: 4px 0; }
  .subtitle { color: #64748b; margin-bottom: 13px; }
  .identity, .summary, .evidence, .continuity { border: 1px solid #d9e2ef; border-radius: 8px; padding: 10px; margin: 8px 0; page-break-inside: avoid; }
  .identity { background: #f1f7ff; border-left: 4px solid #1b3a8c; }
  .summary { background: #ecfdf5; border-color: #bbf7d0; }
  .continuity { background: #f5f3ff; border-color: #ddd6fe; }
  .evidence { background: #fff; border-left: 4px solid #64748b; }
  .label { color: #64748b; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .04em; }
  .value { display: block; margin-top: 2px; font-weight: 700; }
  ul { margin: 5px 0 0; padding-left: 18px; }
  li { margin: 4px 0; }
  .footer-note { margin-top: 16px; color: #64748b; font-size: 7.5pt; border-top: 1px solid #e5eaf1; padding-top: 7px; }
  </style></head><body>
  <h1>Resultado da alteração societária</h1>
  <p class="subtitle">Resumo objetivo da transação identificada no documento vigente.</p>
  <div class="identity"><span class="label">Empresa</span><strong class="value">${escapeHtmlRelatorio(nomeEmpresa)}</strong><small>${escapeHtmlRelatorio(nomeDocumento)}</small></div>
  <div class="summary"><h2>Transação realizada</h2>${transacoesFinais.map((item) => `<p>${escapeHtmlRelatorio(item)}</p>`).join('')}<p><span class="label">Data da alteração</span><strong class="value">${escapeHtmlRelatorio(dataAlteracao ? dataRelatorio(dataAlteracao) : 'Não identificada expressamente')}</strong></p></div>
  <div class="summary"><h2>Titular atual do contrato social</h2><p><strong>${escapeHtmlRelatorio(titularTexto)}</strong></p></div>
  <div class="continuity"><h2>Comprovação de continuidade</h2><p>${escapeHtmlRelatorio(continuidade)}</p></div>
  <div class="evidence"><h2>Evidências da leitura</h2><ul>${evidenciaHtml}</ul></div>
  <p class="footer-note">Este resumo reproduz somente os fatos identificados no documento analisado e nas evidências persistidas. Para atualizar o conteúdo, reprocessar o documento vigente e gerar o PDF novamente.</p>
  </body></html>`;
}

function gerarHtmlRelatorioDocumental(relatorio: any): string {
  const empresa = relatorio.empresa || {};
  const cards = [
    ['Status geral', relatorio.status_geral],
    ['Regime tributário', relatorio.regime?.descricao],
    ['Anexados e analisados', String(relatorio.resumo?.documentos_analisados ?? 0)],
    ['Aguardando análise', String(relatorio.resumo?.documentos_pendentes_analise ?? 0)],
    ['Faltantes para anexar', String(relatorio.resumo?.documentos_faltantes ?? 0)],
  ];
  const blocos = Array.isArray(relatorio.blocos_analisados) ? relatorio.blocos_analisados : [];
  const analisados = Array.isArray(relatorio.documentos_analisados) ? relatorio.documentos_analisados : [];
  const pendentesAnalise = Array.isArray(relatorio.documentos_pendentes_analise) ? relatorio.documentos_pendentes_analise : [];
  const faltantes = Array.isArray(relatorio.documentos_faltantes) ? relatorio.documentos_faltantes : [];
  const pendencias = Array.isArray(relatorio.pendencias) ? relatorio.pendencias : [];
  const etapas = Array.isArray(relatorio.proximas_etapas) ? relatorio.proximas_etapas : [];
  const resultadosAnalises = Array.isArray(relatorio.resultados_analises) ? relatorio.resultados_analises : [];
  const anotacoes = Array.isArray(relatorio.anotacoes) ? relatorio.anotacoes : [];
  const escapeLista = (items: unknown[]) => items.filter(Boolean).map((item: any) => `<li>${escapeHtmlRelatorio(typeof item === 'string' ? item : item.mensagem || item.recomendacao || item.nome || item.label || '')}</li>`).join('');
  const listaOuVazio = (items: unknown[], texto: string) => items.length ? `<ul>${escapeLista(items)}</ul>` : `<p class="empty">${escapeHtmlRelatorio(texto)}</p>`;
  const cardsHtml = cards.map(([label, value]) => `<div class="card"><span>${escapeHtmlRelatorio(label)}</span><strong>${escapeHtmlRelatorio(value)}</strong></div>`).join('');
  // Seções marcadas `colapsavel` (checklist técnico, texto jurídico completo,
  // evidência literal) existem pra quem quiser conferir o detalhe na tela,
  // atrás de um botão de informações -- no PDF impresso elas nem entram: o
  // relatório fica só com o resultado e os dados essenciais de cada
  // documento, sem o texto de apoio inflando as páginas.
  const secoesAnaliseHtml = (resultado: any, documento: any) => construirSecoesAnaliseDocumento(resultado, documento).filter((secao: any) => !secao.colapsavel).map((secao: any) => {
    const classe = secao.id === 'resultado'
      ? 'result'
      : secao.id === 'diagnostico_factual'
        ? 'facts'
        : secao.id === 'evidencias' || secao.id === 'observacoes'
          ? 'notes'
          : 'facts';
    const itens = Array.isArray(secao.itens) && secao.itens.length
      ? `<ul>${secao.itens.map((item: string) => `<li>${secao.id === 'evidencias' ? `<i>${escapeHtmlRelatorio(item)}</i>` : escapeHtmlRelatorio(item)}</li>`).join('')}</ul>`
      : '';
    const campos = Array.isArray(secao.campos) && secao.campos.length
      ? `<div class="fields">${secao.campos.map((campo: any) => `<div class="field"><span>${escapeHtmlRelatorio(campo.label)}</span><strong>${escapeHtmlRelatorio(campo.valor)}</strong></div>`).join('')}</div>`
      : '';
    return `<div class="${classe}"><b>${escapeHtmlRelatorio(secao.titulo)}</b>${secao.texto ? `<p>${escapeHtmlRelatorio(secao.texto)}</p>` : ''}${itens}${campos}</div>`;
  }).join('');
  const analisadosHtml = analisados.length ? analisados.map((documento: any) => {
    const resultado = documento.resultado_analise || {};
    return `<article class="doc analyzed"><div class="doc-head"><div><strong>${escapeHtmlRelatorio(documento.nome)}</strong><small>${escapeHtmlRelatorio(documento.bloco)}${documento.criado_em ? ` · ${escapeHtmlRelatorio(dataRelatorio(documento.criado_em))}` : ''}</small></div><span class="pill green">${escapeHtmlRelatorio(documento.status || 'Analisado')}</span></div>${secoesAnaliseHtml(resultado, documento)}</article>`;
  }).join('') : `<div class="success">Nenhum documento analisado foi encontrado no acervo.</div>`;
  const pendentesAnaliseHtml = pendentesAnalise.length ? pendentesAnalise.map((documento: any) => {
    const resultado = documento.resultado_analise || {};
    return `<article class="doc waiting"><div class="doc-head"><div><strong>${escapeHtmlRelatorio(documento.nome)}</strong><small>${escapeHtmlRelatorio(documento.bloco)}${documento.criado_em ? ` · ${escapeHtmlRelatorio(dataRelatorio(documento.criado_em))}` : ''}</small></div><span class="pill orange">Aguardando análise</span></div><p>${escapeHtmlRelatorio(resultado.diagnostico || documento.observacao || 'Executar a leitura documental antes de considerar o arquivo válido.')}</p></article>`;
  }).join('') : `<div class="success">Nenhum anexo está aguardando análise.</div>`;
  // Lista enxuta: só o nome do documento e a etiqueta Obrigatório/Recomendado.
  // Antes cada item trazia código técnico, finalidade e origem -- informação
  // correta, mas que deixava a lista de faltantes grande e cansativa de ler
  // num relatório impresso (pedido do usuário: "quero isso aqui enxuto").
  const faltantesHtml = faltantes.length ? faltantes.map((documento: any) => `<article class="doc missing compact"><div class="doc-head"><strong>${escapeHtmlRelatorio(documento.nome)}</strong><span class="pill amber">${documento.obrigatorio ? 'Obrigatório' : 'Recomendado'}</span></div></article>`).join('') : `<div class="success">Nenhum documento obrigatório pendente foi identificado.</div>`;
  const resultadosHtml = resultadosAnalises.length ? resultadosAnalises.map((analise: any) => `<article class="stage"><div class="doc-head"><strong>${escapeHtmlRelatorio(analise.titulo)}</strong><span class="pill purple">${escapeHtmlRelatorio(analise.status)}</span></div><p><b>Conclusão:</b> ${escapeHtmlRelatorio(analise.conclusao)}</p>${analise.pontos_positivos?.length ? `<div class="positive"><b>Confirmado</b>${listaOuVazio(analise.pontos_positivos, '')}</div>` : ''}${analise.observacoes?.length ? `<div class="notes"><b>Observações</b>${listaOuVazio(analise.observacoes, '')}</div>` : ''}${analise.bloqueios?.length ? `<div class="alerts"><b>Pendências e bloqueios</b>${listaOuVazio(analise.bloqueios, '')}</div>` : ''}</article>`).join('') : `<p class="empty">As análises por etapa ainda não foram calculadas.</p>`;
  const blocosHtml = blocos.length ? `<table><thead><tr><th>Bloco</th><th>Status</th><th>Arquivos</th><th>Pendências/observações</th></tr></thead><tbody>${blocos.map((bloco: any) => `<tr><td>${escapeHtmlRelatorio(bloco.nome)}</td><td>${escapeHtmlRelatorio(bloco.status)}</td><td>${escapeHtmlRelatorio(bloco.documentos)}</td><td>${escapeHtmlRelatorio(bloco.pendencias?.length ? bloco.pendencias.map((item: any) => item.mensagem || item.recomendacao || item).join('; ') : 'Nenhuma pendência registrada')}</td></tr>`).join('')}</tbody></table>` : `<p class="empty">Nenhum bloco foi analisado até o momento.</p>`;
  const pendenciasHtml = pendencias.length ? `<div class="alerts">${listaOuVazio(pendencias.map((pendencia: any) => `${String(pendencia.severidade || 'atenção').toUpperCase()}: ${pendencia.mensagem || pendencia.recomendacao || pendencia.codigo}`), '')}</div>` : `<p class="empty">Nenhuma pendência adicional registrada.</p>`;
  const etapasHtml = etapas.length ? `<table><thead><tr><th>Etapa</th><th>Situação</th><th>Documentos faltantes</th></tr></thead><tbody>${etapas.map((etapa: any) => `<tr><td>${escapeHtmlRelatorio(`${etapa.numero || ''} — ${etapa.titulo || 'Etapa documental'}`)}</td><td>${etapa.bloqueada ? 'Aguardando etapa anterior' : 'Disponível para análise'}</td><td>${escapeHtmlRelatorio(etapa.documentos_faltantes)}</td></tr>`).join('')}</tbody></table>` : `<p class="empty">As próximas etapas ainda não foram calculadas.</p>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Relatório documental — ${escapeHtmlRelatorio(empresa.razao_social || empresa.nome_fantasia || 'Empresa')}</title><style>
  @page { size: A4; margin: 38mm 22mm 28mm; } * { box-sizing: border-box; } body { margin: 0; font-family: Arial, sans-serif; color: #172033; font-size: 9pt; line-height: 1.4; } h1 { color: #123b78; font-size: 20pt; margin: 0 0 4px; } h2 { color: #123b78; font-size: 13pt; margin: 22px 0 9px; border-bottom: 1px solid #d9e2ef; padding-bottom: 5px; page-break-after: avoid; } p { margin: 5px 0; } .subtitle { color: #64748b; font-size: 9pt; } .identity { background: #f1f7ff; border: 1px solid #cbdcf4; border-radius: 8px; padding: 12px; margin: 15px 0; } .meta { display: grid; grid-template-columns: 1.6fr 1fr 1fr; gap: 10px; margin-top: 8px; } .meta span, .card span, .field span { display: block; color: #64748b; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .04em; } .meta strong { display: block; margin-top: 2px; } .cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px; margin: 12px 0 15px; } .card { border: 1px solid #d9e2ef; border-radius: 7px; padding: 8px; min-height: 53px; } .card strong { display: block; margin-top: 4px; font-size: 9.2pt; color: #123b78; } .legend { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin: 10px 0 15px; } .legend div { border: 1px solid #d9e2ef; border-radius: 7px; padding: 8px; font-size: 8pt; } .green { color: #047857; } .orange { color: #c2410c; } .amber { color: #b45309; } table { width: 100%; border-collapse: collapse; margin: 5px 0 12px; page-break-inside: auto; } th { background: #123b78; color: #fff; text-align: left; font-size: 7.8pt; padding: 6px; } td { border-bottom: 1px solid #e5eaf1; vertical-align: top; padding: 6px; font-size: 8pt; } tr:nth-child(even) td { background: #f8fafc; } small { display: block; color: #64748b; font-size: 7.5pt; margin-top: 3px; } .doc, .stage { border: 1px solid #d9e2ef; border-radius: 8px; padding: 9px; margin: 7px 0; page-break-inside: auto; } .doc.compact { padding: 6px 10px; margin: 4px 0; page-break-inside: avoid; } .analyzed { border-left: 4px solid #10b981; } .waiting { border-left: 4px solid #f97316; } .missing { border-left: 4px solid #f59e0b; } .doc-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; } .doc-head > div { flex: 1; } .pill { display: inline-block; border-radius: 999px; padding: 3px 7px; font-size: 7.5pt; font-weight: bold; white-space: nowrap; } .pill.green { background: #d1fae5; } .pill.orange { background: #ffedd5; } .pill.amber { background: #fef3c7; } .pill.purple { background: #ede9fe; color: #6d28d9; } .result, .positive, .notes, .alerts, .facts { margin-top: 7px; padding: 7px; border-radius: 6px; } .result { background: #ecfdf5; border: 1px solid #bbf7d0; } .positive { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; } .notes { background: #f8fafc; border: 1px solid #e2e8f0; } .facts { background: #eff6ff; border: 1px solid #bfdbfe; } .alerts { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; } .fields { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 7px; } .field { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 5px; padding: 6px; } .field strong { display: block; margin-top: 2px; overflow-wrap: anywhere; } ul { margin: 5px 0 3px; padding-left: 17px; } li { margin: 3px 0; } .success { background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; padding: 10px; border-radius: 7px; } .empty { color: #64748b; font-style: italic; padding: 4px 0; } .footer-note { margin-top: 18px; color: #64748b; font-size: 7.5pt; border-top: 1px solid #e5eaf1; padding-top: 8px; }
  </style></head><body><h1>Relatório de análise documental</h1><p class="subtitle">Estado consolidado do acervo, das análises realizadas e dos documentos necessários para a próxima etapa.</p><div class="identity"><strong>${escapeHtmlRelatorio(empresa.razao_social || empresa.nome_fantasia || 'Empresa não identificada')}</strong><div class="meta"><div><span>CNPJ</span><strong>${escapeHtmlRelatorio(empresa.cnpj)}</strong></div><div><span>Regime tributário</span><strong>${escapeHtmlRelatorio(relatorio.regime?.descricao)}</strong></div><div><span>Relatório gerado em</span><strong>${escapeHtmlRelatorio(dataRelatorio(relatorio.gerado_em))}</strong></div></div></div><div class="cards">${cardsHtml}</div><div class="legend"><div><b class="green">Anexados e analisados</b><br/>Arquivo localizado com leitura ou validação concluída.</div><div><b class="orange">Aguardando análise</b><br/>Arquivo recebido, mas ainda não considerado validado.</div><div><b class="amber">Faltantes</b><br/>Documento que ainda precisa ser anexado.</div></div><h2>Resumo executivo</h2><p>${escapeHtmlRelatorio(relatorio.proxima_acao)}</p><h2>1. Documentos anexados e analisados</h2>${analisadosHtml}<h2>2. Documentos anexados e aguardando análise</h2>${pendentesAnaliseHtml}<h2>3. Documentos ainda faltantes para anexar</h2>${faltantesHtml}<h2>4. Resultados consolidados por etapa</h2>${resultadosHtml}<h2>5. Observações e anotações gerais</h2>${listaOuVazio(anotacoes, 'Nenhuma observação adicional registrada.')}<h2>6. Blocos e pendências operacionais</h2>${blocosHtml}${pendenciasHtml}<h2>7. Próximas etapas</h2>${etapasHtml}<p class="footer-note">Este relatório é uma fotografia do dossiê no momento da geração. Após anexar novos documentos, gere novamente o relatório para atualizar o estado da empresa.</p></body></html>`;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}


function normalizeArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    for (const key of ['qsa', 'socios', 'socios_receita', 'quadro_societario', 'quadroSocietario', 'administradores']) {
      if (Array.isArray(value[key])) return value[key];
    }
  }
  return [];
}

function firstValue(obj: any, keys: string[]) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

function isEmpresaIndividual(empresa: any): boolean {
  const texto = [empresa?.natureza_juridica, empresa?.porte, empresa?.porte_receita, empresa?.razao_social, empresa?.nome_fantasia]
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return !!empresa?.opcao_mei || texto.includes('microempreendedor individual') || texto.includes('mei') || texto.includes('empresario individual') || texto.includes('individual');
}

function mapSocioReceita(item: any, index: number) {
  return {
    id: item?.id || `receita-${index}`,
    nome: firstValue(item, ['nome', 'nome_socio', 'nomeSocio', 'socio', 'razao_social', 'nome_empresarial']) || null,
    cpf_cnpj: firstValue(item, ['cpf_cnpj', 'cpfCnpj', 'documento', 'cnpj_cpf_do_socio', 'cnpj_cpf_socio', 'cpf', 'cnpj']) || null,
    qualificacao: firstValue(item, ['qualificacao_socio', 'qualificacao', 'qualificacaoSocio', 'cargo', 'descricao_qualificacao']) || null,
    cargo: firstValue(item, ['cargo', 'qualificacao', 'qualificacao_socio']) || null,
    percentual_participacao: asNumber(firstValue(item, ['percentual_participacao', 'participacao', 'percentual', 'cotas_percentual'])),
    administrador: String(firstValue(item, ['qualificacao', 'qualificacao_socio', 'cargo']) || '').toLowerCase().includes('administr'),
    representante_legal: String(firstValue(item, ['qualificacao', 'qualificacao_socio', 'cargo']) || '').toLowerCase().includes('administr'),
    assina_contrato: String(firstValue(item, ['qualificacao', 'qualificacao_socio', 'cargo']) || '').toLowerCase().includes('administr'),
    data_entrada_sociedade: firstValue(item, ['data_entrada_sociedade', 'dataEntradaSociedade', 'data_entrada', 'dataEntrada']) || null,
    fonte_dados: 'receita_json',
    cpfhub_status: null,
    pendencias_contrato: [],
    completo_para_contrato: false,
    campos_complementares: {
      rg: null,
      orgao_emissor: null,
      estado_civil: null,
      profissao: null,
      nacionalidade: null,
      email: null,
      telefone: null,
      endereco: null,
    },
  };
}

function montarProprietarioInferido(empresa: any) {
  if (!isEmpresaIndividual(empresa)) return null;
  const nome = empresa?.responsavel_nome || empresa?.nome_fantasia || empresa?.razao_social || null;
  if (!nome) return null;
  return {
    id: `proprietario-${empresa.id || 'empresa'}`,
    nome,
    cpf_cnpj: empresa?.responsavel_cpf || null,
    qualificacao: empresa?.opcao_mei ? 'Proprietário / Administrador (MEI)' : 'Proprietário / Administrador (Empresa Individual)',
    cargo: empresa?.responsavel_cargo || 'Proprietário / Administrador',
    percentual_participacao: 100,
    administrador: true,
    representante_legal: true,
    assina_contrato: true,
    data_entrada_sociedade: empresa?.data_abertura || null,
    fonte_dados: 'inferido_empresa_individual',
    cpfhub_status: null,
    pendencias_contrato: [],
    completo_para_contrato: false,
    campos_complementares: {
      rg: null,
      orgao_emissor: null,
      estado_civil: null,
      profissao: empresa?.responsavel_cargo || null,
      nacionalidade: null,
      email: empresa?.responsavel_email || empresa?.email || null,
      telefone: empresa?.responsavel_telefone || empresa?.whatsapp || empresa?.telefone || null,
      endereco: [empresa?.logradouro || empresa?.endereco, empresa?.numero, empresa?.bairro, empresa?.cidade, empresa?.estado].filter(Boolean).join(', ') || null,
    },
  };
}

function diasDesde(data?: string | Date | null): number | null {
  if (!data) return null;
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

async function tableExists(tableName: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function ensureBlocosCatalogo() {
  await ensureDocumentacaoSchema(pool);
  await pool.query(`
    INSERT INTO public.documentacao_blocos (codigo, nome_amigavel, descricao, entidade_principal, obrigatorio, ordem, configuracao)
    VALUES
      ('cnpj_receita', 'CNPJ / Receita Federal', 'Dados oficiais de CNPJ e situação cadastral.', 'empresa', true, 1, '{"prioridade":"imediata"}'::jsonb),
      ('qsa_quadro_societario', 'QSA / Quadro Societário', 'Quadro de Sócios e Administradores da empresa.', 'empresa', true, 2, '{"prioridade":"imediata"}'::jsonb),
      ('enquadramento_tributario', 'Enquadramento Tributário', 'Regime tributário atual da empresa (Simples Nacional, MEI, Lucro Presumido ou Lucro Real) -- obtido pela consulta de CNPJ; um comprovante pode ser anexado como reforço opcional, mas não é exigido.', 'empresa', false, 3, '{"prioridade":"imediata","etapa":"identidade_cnpj","documento_obrigatorio":false}'::jsonb),
      ('atos_junta_comercial', 'Atos da Junta Comercial', 'Histórico de arquivamentos lido antes do contrato para definir quais atos devem ser anexados.', 'empresa', true, 4, '{"etapa":"documentacao_societaria","sequencia_analise":1}'::jsonb),
      ('contrato_social_alteracoes', 'Contrato Social e Alterações', 'Contrato social vigente e alterações, validados depois dos Atos da Junta por número do ato, data, NIRE, CNPJ e QSA.', 'empresa', true, 5, '{"etapa":"documentacao_societaria","sequencia_analise":2}'::jsonb),
      ('socios_representantes', 'Sócios, Administradores e Representantes', 'Dados e documentos dos sócios/representantes.', 'socio', true, 6, '{}'::jsonb),
      ('endereco_contatos', 'Endereço, Contatos e Dados Operacionais', 'Endereço, contatos e dados operacionais.', 'empresa', false, 7, '{}'::jsonb),
      ('faturamento_historico', 'Faturamento Histórico', 'Histórico mensal de faturamento, analisado quando anexado, sem obrigatoriedade.', 'empresa', false, 8, '{"documento_obrigatorio":false}'::jsonb),
      ('previsao_faturamento', 'Previsão de Faturamento', 'Projeção de faturamento.', 'empresa', false, 9, '{}'::jsonb),
      ('demonstracoes_contabeis_fiscais', 'Demonstrações Contábeis e Fiscais', 'Balanço, DRE, ECD, ECF e declarações.', 'empresa', false, 10, '{}'::jsonb),
      ('extratos_movimentacao_bancaria', 'Extratos Bancários e Movimentação', 'Extratos e movimentação bancária.', 'empresa', false, 11, '{}'::jsonb),
      ('acompanhamento_bancario', 'Acompanhamento Bancário', 'Monitoramento bancário e rating.', 'empresa', false, 12, '{}'::jsonb),
      ('acompanhamento_financeiro', 'Acompanhamento Financeiro', 'Pagamentos, parcelas e inadimplência.', 'empresa', false, 13, '{}'::jsonb),
      ('certidoes_regularidade', 'Certidões e Regularidade', 'Certidões, protestos e restrições.', 'empresa', false, 14, '{}'::jsonb),
      ('scr_endividamento', 'SCR / Endividamento', 'Relatórios SCR/BACEN e endividamento.', 'empresa', false, 15, '{}'::jsonb),
      ('garantias', 'Garantias', 'Garantias vinculadas a operações/contratos.', 'empresa', false, 16, '{}'::jsonb),
      ('contratos_gerados', 'Contratos Gerados', 'Contratos e PDFs gerados.', 'empresa', false, 17, '{}'::jsonb),
      ('pendencias_documentais', 'Pendências Documentais', 'Pendências consolidadas do dossiê.', 'empresa', true, 18, '{}'::jsonb),
      ('analise_ia_credito', 'Parecer de Crédito', 'Parecer consolidado com revisão humana.', 'empresa', false, 19, '{}'::jsonb)
    ON CONFLICT (codigo) DO UPDATE SET
      nome_amigavel = EXCLUDED.nome_amigavel,
      descricao = EXCLUDED.descricao,
      entidade_principal = EXCLUDED.entidade_principal,
      obrigatorio = EXCLUDED.obrigatorio,
      ordem = EXCLUDED.ordem,
      configuracao = EXCLUDED.configuracao,
      ativo = true;
  `);
}

async function getEmpresa(empresaId: string) {
  const { rows } = await pool.query(`SELECT * FROM public.empresas WHERE id = $1 LIMIT 1`, [empresaId]);
  return rows[0] || null;
}

async function getSociosEmpresa(empresaId: string) {
  if (!(await tableExists('socios_empresa'))) return [];
  const { rows } = await pool.query(`SELECT * FROM public.socios_empresa WHERE empresa_id = $1 ORDER BY COALESCE(nome, '') ASC`, [empresaId]);
  return rows;
}

async function contarDocumentos(where: string, values: unknown[]) {
  if (!(await tableExists('documentos_arquivos'))) return 0;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM public.documentos_arquivos WHERE excluido_em IS NULL AND status <> 'excluido' AND ${where}`,
    values
  );
  return rows[0]?.total || 0;
}

async function listarDocumentosEmpresaPorTipos(empresaId: string, tipos: string[]) {
  if (!(await tableExists('documentos_arquivos'))) return [];
  const { rows } = await pool.query(
    `SELECT id, entidade_tipo, entidade_id, empresa_id, socio_id, contrato_id, simulacao_id, tipo_documento,
            nome_original, nome_arquivo, mime_type, tamanho_bytes, status, validado, criado_em, atualizado_em, observacoes, metadados, resultado_validacao
       FROM public.documentos_arquivos
      WHERE excluido_em IS NULL
        AND status <> 'excluido'
        AND (empresa_id = $1 OR (entidade_tipo = 'empresa' AND entidade_id = $1))
        AND tipo_documento = ANY($2::text[])
      ORDER BY criado_em DESC
      LIMIT 100`,
    [empresaId, tipos]
  );
  return rows;
}

function montarCnpjDados(empresa: any) {
  return {
    cnpj: empresa.cnpj || null,
    cnpj_limpo: somenteDigitos(empresa.cnpj),
    razao_social: empresa.razao_social || null,
    nome_fantasia: empresa.nome_fantasia || null,
    data_abertura: empresa.data_abertura || null,
    situacao_cadastral: empresa.situacao_cadastral || null,
    data_situacao_cadastral: empresa.data_situacao_cadastral || null,
    motivo_situacao_cadastral: empresa.motivo_situacao_cadastral || null,
    natureza_juridica: empresa.natureza_juridica || null,
    capital_social: asNumber(empresa.capital_social),
    cnae_principal: empresa.cnae_principal || null,
    cnaes_secundarios: Array.isArray(empresa.cnaes_secundarios) ? empresa.cnaes_secundarios : [],
    porte: empresa.porte || empresa.porte_receita || null,
    regime_tributario: empresa.regime_tributario || null,
    matriz_filial: empresa.matriz_filial || null,
    opcao_simples: empresa.opcao_simples ?? null,
    opcao_mei: empresa.opcao_mei ?? null,
    inscricao_estadual: empresa.inscricao_estadual || null,
    inscricao_municipal: empresa.inscricao_municipal || null,
    endereco_receita: {
      cep: empresa.cep || null,
      logradouro: empresa.logradouro || empresa.endereco || null,
      numero: empresa.numero || null,
      complemento: empresa.complemento || null,
      bairro: empresa.bairro || null,
      cidade: empresa.cidade || null,
      estado: empresa.estado || null,
    },
    contato: {
      email: empresa.email || null,
      telefone: empresa.telefone || null,
      whatsapp: empresa.whatsapp || null,
      site: empresa.site || null,
      responsavel_nome: empresa.responsavel_nome || null,
      responsavel_cpf: empresa.responsavel_cpf || null,
      responsavel_cargo: empresa.responsavel_cargo || null,
      responsavel_email: empresa.responsavel_email || null,
      responsavel_telefone: empresa.responsavel_telefone || null,
    },
    fonte_dados_empresa: empresa.fonte_dados_empresa || empresa.provedor_cnpj || null,
    fontes_cnpj: Array.isArray(empresa.fontes_cnpj) ? empresa.fontes_cnpj : [],
    ultima_sincronizacao_receita: empresa.ultima_sincronizacao_receita || empresa.atualizado_receita_em || null,
    dados_extra_receita: empresa.dados_extra_receita || {},
  };
}

function pendenciasCnpj(empresa: any, docsCnpj: any[]): Pendencia[] {
  const dados = montarCnpjDados(empresa);
  const pendencias: Pendencia[] = [];
  const cnpj = somenteDigitos(empresa.cnpj);
  if (cnpj.length !== 14) {
    pendencias.push({ codigo: 'cnpj_invalido_ou_ausente', mensagem: 'CNPJ ausente ou inválido.', severidade: 'alta', origem: 'empresas.cnpj', recomendacao: 'Informar CNPJ válido e sincronizar dados cadastrais.' });
  }
  if (!empresa.razao_social) pendencias.push({ codigo: 'razao_social_ausente', mensagem: 'Razão social ausente.', severidade: 'alta', origem: 'empresas.razao_social' });
  if (!empresa.situacao_cadastral) pendencias.push({ codigo: 'situacao_cadastral_ausente', mensagem: 'Situação cadastral não informada.', severidade: 'media', origem: 'empresas.situacao_cadastral' });
  if (empresa.situacao_cadastral && !isSituacaoAtiva(empresa.situacao_cadastral)) {
    pendencias.push({ codigo: 'situacao_cadastral_nao_ativa', mensagem: `Situação cadastral diferente de ativa: ${empresa.situacao_cadastral}.`, severidade: 'alta', origem: 'empresas.situacao_cadastral' });
  }
  if (!empresa.data_abertura) pendencias.push({ codigo: 'data_abertura_ausente', mensagem: 'Data de abertura ausente.', severidade: 'media', origem: 'empresas.data_abertura' });
  if (!empresa.cnae_principal) pendencias.push({ codigo: 'cnae_principal_ausente', mensagem: 'CNAE principal ausente.', severidade: 'media', origem: 'empresas.cnae_principal' });
  if (dados.capital_social === null) pendencias.push({ codigo: 'capital_social_ausente', mensagem: 'Capital social não informado.', severidade: 'media', origem: 'empresas.capital_social' });
  const diasSync = diasDesde(dados.ultima_sincronizacao_receita);
  if (diasSync === null) {
    pendencias.push({ codigo: 'receita_nao_sincronizada', mensagem: 'Dados da Receita ainda não possuem data de sincronização.', severidade: 'media', origem: 'empresas.ultima_sincronizacao_receita' });
  } else if (diasSync > 90) {
    pendencias.push({ codigo: 'receita_desatualizada', mensagem: `Dados da Receita desatualizados há ${diasSync} dias.`, severidade: 'media', origem: 'empresas.ultima_sincronizacao_receita', recomendacao: 'Atualizar dados na Receita antes da análise.' });
  }
  if (docsCnpj.length === 0) {
    pendencias.push({ codigo: 'cartao_cnpj_nao_anexado', mensagem: 'Cartão CNPJ ou comprovante de inscrição não anexado.', severidade: 'baixa', origem: 'documentos_arquivos' });
  }
  return pendencias;
}

function dadosQsa(empresa: any, socios: any[]) {
  const sociosReceita = [
    ...normalizeArray(empresa.socios_receita),
    ...normalizeArray(empresa.dados_extra_receita),
    ...normalizeArray(empresa.dados_fontes_cnpj),
  ].filter(Boolean);

  const sociosCadastro = socios.map((s) => {
    const qualificacao = s.qualificacao_socio || s.qualificacao || s.cargo || null;
    const administradorPorTexto = /administrador|administradora|titular/i.test(String(qualificacao || ''));
    return {
      id: s.id,
      nome: s.nome || null,
      qualificacao,
      administrador: !!s.administrador || administradorPorTexto,
      fonte_dados: s.fonte_dados || 'cadastro_manual',
    };
  }).filter((s) => s.nome && normalizeText(s.nome) !== 'nao identificado');

  const sociosReceitaMapeados = sociosReceita
    .map(mapSocioReceita)
    .filter((s) => s.nome && normalizeText(s.nome) !== 'nao identificado')
    .map((s) => ({
      id: s.id,
      nome: s.nome,
      qualificacao: s.qualificacao,
      administrador: !!s.administrador,
      fonte_dados: s.fonte_dados,
    }));

  const proprietario = sociosCadastro.length === 0 && sociosReceitaMapeados.length === 0
    ? montarProprietarioInferido(empresa)
    : null;
  let sociosConsolidados: any[] = sociosCadastro.length
    ? sociosCadastro
    : sociosReceitaMapeados.length
      ? sociosReceitaMapeados
      : proprietario
        ? [{ id: proprietario.id, nome: proprietario.nome, qualificacao: proprietario.qualificacao, administrador: true, fonte_dados: proprietario.fonte_dados }]
        : [];

  if (sociosConsolidados.length === 1 && !sociosConsolidados[0].administrador) {
    sociosConsolidados = [{ ...sociosConsolidados[0], administrador: true }];
  }

  return {
    total_socios_cadastrados: sociosCadastro.length,
    total_socios_receita_json: sociosReceitaMapeados.length,
    total_socios_consolidados: sociosConsolidados.length,
    empresa_individual_detectada: isEmpresaIndividual(empresa),
    proprietario_inferido: !!proprietario,
    origem_qsa_exibido: sociosCadastro.length > 0 ? 'socios_empresa' : sociosReceitaMapeados.length > 0 ? 'receita_json' : proprietario ? 'inferido_empresa_individual' : 'nao_disponivel',
    socios: sociosConsolidados,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Enquadramento Tributário compõe a Etapa 1. Atos da Junta pertencem à Etapa 2
// e são lidos apenas para a conferência por NIRE e data com o contrato/alteração.
// ─────────────────────────────────────────────────────────────────────────

function severidadeParaPendencia(sev: string): 'alta' | 'media' | 'baixa' {
  return sev === 'critica' ? 'alta' : (sev === 'media' || sev === 'baixa') ? sev : 'alta';
}

// Contrato fechado da Fase 1. Somente divergências institucionais do QSA podem
// participar da decisão de avanço. Pendências pessoais/contratuais de sócios
// ficam fora desta lista por definição e, portanto, não podem regressar para o gate.
const QSA_FASE1_CODIGOS_PERMITIDOS = new Set([
  'qsa_documento_nao_anexado',
  'qsa_falha_leitura',
  'qsa_aguardando_analise',
  'qsa_documento_incompativel',
  'qsa_extracao_inconclusiva',
  'qsa_cnpj_nao_extraido',
  'qsa_cnpj_divergente',
  'qsa_razao_social_nao_extraida',
  'qsa_razao_social_divergente',
  'qsa_capital_social_nao_extraido',
  'qsa_capital_social_divergente',
  'qsa_socios_nao_extraidos',
  'qsa_socio_documento_nao_encontrado_receita',
  'qsa_socio_receita_ausente_documento',
  'qsa_administrador_nao_identificado',
  'qsa_administrador_divergente',
]);

function filtrarPendenciasQsaFase1(pendencias: Pendencia[]): Pendencia[] {
  return (Array.isArray(pendencias) ? pendencias : []).filter((pendencia) => QSA_FASE1_CODIGOS_PERMITIDOS.has(String(pendencia?.codigo || '')));
}

function mensagemSeguraFalhaLeitura(tipo: string, error: unknown): string {
  const original = String((error as any)?.message || error || '').trim();
  const normalizada = original.toLowerCase();
  if (normalizada.includes('não localizado') || normalizada.includes('nao localizado') || normalizada.includes('enoent')) {
    return `${tipo}: o arquivo está registrado no acervo, mas o arquivo físico não foi localizado no armazenamento persistente.`;
  }
  if (normalizada.includes('tesseract') || normalizada.includes('pdftotext') || normalizada.includes('pdftoppm')) {
    return `${tipo}: o leitor interno de PDF/OCR não está disponível ou não conseguiu concluir a leitura deste arquivo.`;
  }
  if (normalizada.includes('gemini') || normalizada.includes('api_key') || normalizada.includes('api key')) {
    return `${tipo}: a leitura interna ficou inconclusiva e o mecanismo externo de apoio não conseguiu concluir o processamento.`;
  }
  if (normalizada.includes('formato não suportado') || normalizada.includes('formato nao suportado') || normalizada.includes('tipo de arquivo não suportado')) {
    return `${tipo}: o formato anexado não é compatível com a leitura automática. Anexe PDF, PNG ou JPG legível.`;
  }
  if (normalizada.includes('timeout')) {
    return `${tipo}: o tempo máximo de leitura foi excedido. Tente novamente; se persistir, anexe uma versão mais leve ou legível.`;
  }
  return `${tipo}: a leitura automática não pôde ser concluída. O arquivo permanece preservado e precisa ser reprocessado ou revisado.`;
}

function resumoAnaliseEspecializada(analise: AnaliseDocumentalResult, nome: string): string {
  const alertas = Array.isArray(analise.alertas) ? analise.alertas : [];
  const relevante = alertas.find((alerta) => alerta.severidade === 'critica' || alerta.severidade === 'alta') || alertas[0];
  if (relevante?.mensagem) return relevante.mensagem;
  return `${nome} lido e cruzado com os dados cadastrais da empresa, sem divergência impeditiva.`;
}

async function buscarAnaliseEspecializadaPersistida(
  arquivoId: string,
  promptCodigo: string,
): Promise<AnaliseDocumentalResult | null> {
  if (!(await tableExists('documentos_extracoes_ia'))) return null;
  const { rows } = await pool.query(
    `SELECT resultado, status, prompt_versao
       FROM public.documentos_extracoes_ia
      WHERE arquivo_id = $1
        AND prompt_codigo = $2
        AND status IN ('concluido', 'revisao_humana')
      ORDER BY processado_em DESC NULLS LAST, atualizado_em DESC, criado_em DESC
      LIMIT 1`,
    [arquivoId, promptCodigo],
  );
  const row = rows[0];
  const resultado = row?.resultado;
  if (!resultado || typeof resultado !== 'object' || !resultado.tipo_analise) return null;

  // Laudos concluídos de versões anteriores continuam sendo evidência histórica
  // válida para o relatório. A versão do prompt é usada no fluxo de reprocessamento
  // para decidir quando uma nova análise deve ser criada, não para esconder análises
  // já persistidas do usuário.
  return resultado as AnaliseDocumentalResult;
}

async function buscarFalhaAnaliseEspecializada(
  arquivoId: string,
  promptCodigo: string,
): Promise<{ mensagem: string; processado_em: string | null } | null> {
  if (!(await tableExists('documentos_extracoes_ia'))) return null;
  const { rows } = await pool.query(
    `SELECT erros, pendencias, processado_em
       FROM public.documentos_extracoes_ia
      WHERE arquivo_id = $1
        AND prompt_codigo = $2
        AND status = 'falhou'
      ORDER BY processado_em DESC NULLS LAST, atualizado_em DESC, criado_em DESC
      LIMIT 1`,
    [arquivoId, promptCodigo],
  );
  const row = rows[0];
  if (!row) return null;
  const erros = Array.isArray(row.erros) ? row.erros : [];
  const pendencias = Array.isArray(row.pendencias) ? row.pendencias : [];
  const mensagem = String(erros[0]?.mensagem || pendencias[0]?.mensagem || 'Falha de leitura documental.');
  return { mensagem, processado_em: row.processado_em || null };
}

async function persistirAnaliseEspecializada(
  arquivoId: string,
  promptCodigo: string,
  resultado: AnaliseDocumentalResult,
): Promise<void> {
  const { extracao } = await registrarExtracaoEspecializada({
    arquivoId,
    blocoEntidadeId: null,
    promptCodigo,
  });
  await pool.query(
    `UPDATE public.documentos_extracoes_ia
        SET status = $2,
            modelo = $3,
            campos_extraidos = $4::jsonb,
            resultado = $5::jsonb,
            nivel_confianca = $6,
            pendencias = $7::jsonb,
            erros = '[]'::jsonb,
            processado_em = NOW()
      WHERE id = $1`,
    [
      extracao.id,
      resultado.status,
      resultado.modelo_ia,
      JSON.stringify(resultado.dados_extraidos || {}),
      JSON.stringify(resultado),
      resultado.nivel_confianca,
      JSON.stringify(resultado.alertas || []),
    ],
  );
}

async function persistirFalhaAnaliseEspecializada(
  arquivoId: string,
  promptCodigo: string,
  error: unknown,
): Promise<void> {
  try {
    const { extracao } = await registrarExtracaoEspecializada({
      arquivoId,
      blocoEntidadeId: null,
      promptCodigo,
    });
    const mensagem = String((error as any)?.message || error || 'Falha de leitura documental').slice(0, 1200);
    await pool.query(
      `UPDATE public.documentos_extracoes_ia
          SET status = 'falhou',
              erros = $2::jsonb,
              pendencias = $2::jsonb,
              processado_em = NOW(),
              atualizado_em = NOW()
        WHERE id = $1`,
      [extracao.id, JSON.stringify([{ codigo: 'falha_leitura_documental', mensagem }])],
    );
  } catch (persistError: any) {
    console.warn('[Dossiê] Não foi possível persistir a falha de leitura documental:', persistError?.message || persistError);
  }
}

async function obterAnaliseEspecializada(params: {
  empresaId: string;
  arquivoId: string;
  tipo: TipoAnaliseDocumental;
  promptCodigo: string;
  processar: boolean;
  reprocessar?: boolean;
}): Promise<AnaliseDocumentalResult | null> {
  const persistida = await buscarAnaliseEspecializadaPersistida(params.arquivoId, params.promptCodigo);
  // GETs continuam reaproveitando o último laudo persistido. Já o comando
  // explícito de recalcular força nova leitura dos arquivos atuais, evitando
  // manter resultados antigos/placeholder depois de uma atualização do motor.
  if (persistida && !params.reprocessar) return persistida;
  if (!params.processar) return persistida;

  try {
    const resultado = params.tipo === 'qsa'
      ? await analiseDocumentalService.analisarQSA(params.empresaId, params.arquivoId)
      : params.tipo === 'simples_nacional'
        ? await analiseDocumentalService.analisarSimplesNacional(params.empresaId, params.arquivoId)
        : await analiseDocumentalService.analisarAtosJuntaComercial(params.empresaId, params.arquivoId);
    await persistirAnaliseEspecializada(params.arquivoId, params.promptCodigo, resultado);
    return resultado;
  } catch (error: any) {
    // Uma indisponibilidade momentânea do OCR/IA não apaga nem invalida um
    // laudo anterior já concluído para o mesmo arquivo.
    if (persistida) {
      console.warn('[Dossiê] Reprocessamento indisponível; mantendo última análise válida:', params.promptCodigo, error?.message || error);
      return persistida;
    }
    await persistirFalhaAnaliseEspecializada(params.arquivoId, params.promptCodigo, error);
    throw error;
  }
}

// Antes desta correção, o QSA extraído do documento (PDF/OCR) só era COMPARADO
// contra os sócios já existentes em `socios_empresa` (gerando alertas de
// divergência) -- nunca gravava um sócio novo. Se a sincronização com a Receita
// (fonte usual de `socios_empresa`) estivesse incompleta ou desatualizada e o QSA
// físico mostrasse um sócio adicional, esse sócio nunca aparecia na aba
// "Documentação dos Sócios" (que lê exclusivamente de `socios_empresa`) -- ou
// seja, nenhum campo de documento pessoal era exibido para ele. Esta função
// resolve isso: sempre que uma leitura NOVA do QSA acontece (processar=true),
// cada sócio identificado no documento é conciliado com `socios_empresa` via
// `upsertSocioEmpresa` (que já faz o casamento por nome/CPF e nunca sobrescreve
// dado confirmado manualmente -- ver SOCIOS_MANUAL_PROTECTED_COLUMNS). Só nome,
// qualificação e se é administrador são gravados aqui -- nenhum dado pessoal
// (CPF, RG, endereço, estado civil...) é lido do QSA nem inferido, mantendo a
// regra de "Fase 1 = zero dados pessoais" intacta. Falhas aqui são só logadas:
// nunca devem quebrar a leitura/exibição do QSA em si.
export async function sincronizarSociosExtraidosDoQsa(empresaId: string, sociosExtraidos: unknown): Promise<void> {
  const lista = Array.isArray(sociosExtraidos) ? sociosExtraidos : [];
  for (const socio of lista) {
    const nome = String((socio as any)?.nome || '').trim();
    if (!nome) continue;
    try {
      await upsertSocioEmpresa(empresaId, {
        nome,
        qualificacao_socio: (socio as any)?.qualificacao ? String((socio as any).qualificacao).trim() : null,
        representante_legal: (socio as any)?.administrador === true,
        fonte_dados: 'qsa_documento',
      } as any);
    } catch (error: any) {
      console.warn('[Dossie] Falha ao conciliar sócio extraído do QSA com socios_empresa:', nome, error?.message || error);
    }
  }
}

async function montarQsaDocumentalDados(
  empresaId: string,
  processar: boolean,
): Promise<{ dados: Record<string, any>; pendencias: Pendencia[] }> {
  const docs = await listarDocumentosEmpresaPorTipos(empresaId, ['qsa']);
  if (!docs.length) {
    return {
      dados: { anexado: false, analisado: false },
      pendencias: [{ codigo: 'qsa_documento_nao_anexado', mensagem: 'Documento QSA ainda não anexado.', severidade: 'alta', origem: 'documentos_arquivos', recomendacao: 'Anexar o QSA no Acervo Documental.' }],
    };
  }
  const docMaisRecente = docs[0];
  try {
    const analise = await obterAnaliseEspecializada({
      empresaId,
      arquivoId: docMaisRecente.id,
      tipo: 'qsa',
      promptCodigo: 'qsa_extract',
      processar,
      reprocessar: processar,
    });
    if (!analise) {
      const falhaPersistida = await buscarFalhaAnaliseEspecializada(docMaisRecente.id, 'qsa_extract');
      if (falhaPersistida) {
        const mensagem = mensagemSeguraFalhaLeitura('QSA', falhaPersistida.mensagem);
        return {
          dados: { anexado: true, analisado: false, tentativa_realizada: true, documento_id: docMaisRecente.id, status_leitura: 'falha_leitura', erro_processamento: mensagem, diagnostico: mensagem, lido_em: falhaPersistida.processado_em },
          pendencias: [{ codigo: 'qsa_falha_leitura', mensagem, severidade: 'alta', origem: 'qsa', recomendacao: 'Verificar o arquivo e tentar a leitura novamente.' }],
        };
      }
      return {
        dados: { anexado: true, analisado: false, documento_id: docMaisRecente.id, status_leitura: 'aguardando_analise', diagnostico: 'QSA anexado e aguardando o início da análise documental.' },
        pendencias: [{ codigo: 'qsa_aguardando_analise', mensagem: 'QSA anexado e aguardando o início da análise documental.', severidade: 'alta', origem: 'qsa', recomendacao: 'Iniciar a Etapa 1 quando Cartão CNPJ, QSA e Enquadramento Tributário estiverem anexados.' }],
      };
    }
    if (processar) await sincronizarSociosExtraidosDoQsa(empresaId, analise.dados_extraidos?.socios);
    return {
      dados: {
        anexado: true,
        analisado: true,
        tentativa_realizada: true,
        documento_id: docMaisRecente.id,
        status_leitura: analise.status,
        lido_em: analise.analisado_em,
        modelo: analise.modelo_ia,
        nivel_confianca: analise.nivel_confianca,
        fonte_extracao: analise.dados_extraidos?.fonte_extracao || analise.modelo_ia || null,
        diagnostico: resumoAnaliseEspecializada(analise, 'QSA'),
        ...analise.dados_extraidos,
      },
      pendencias: analise.alertas.map((a) => ({ codigo: a.codigo, mensagem: a.mensagem, severidade: severidadeParaPendencia(a.severidade), origem: 'qsa', recomendacao: a.recomendacao })),
    };
  } catch (err: any) {
    console.warn('[Dossie] Falha controlada na análise do QSA:', err?.message || err);
    const mensagem = mensagemSeguraFalhaLeitura('QSA', err);
    return {
      dados: {
        anexado: true,
        analisado: false,
        tentativa_realizada: processar,
        documento_id: docMaisRecente.id,
        status_leitura: processar ? 'falha_leitura' : 'aguardando_analise',
        erro_processamento: processar ? mensagem : null,
        diagnostico: processar ? mensagem : 'QSA anexado e aguardando o início da análise documental.',
      },
      pendencias: [{
        codigo: processar ? 'qsa_falha_leitura' : 'qsa_aguardando_analise',
        mensagem: processar ? mensagem : 'QSA anexado e aguardando o início da análise documental.',
        severidade: 'alta',
        origem: 'qsa',
        recomendacao: processar ? 'Verificar o arquivo anexado e executar novamente a análise documental inicial.' : 'Iniciar a Etapa 1 quando Cartão CNPJ, QSA e Enquadramento Tributário estiverem anexados.',
      }],
    };
  }
}

async function montarAtosJuntaDados(
  empresaId: string,
  processar: boolean,
): Promise<{ dados: Record<string, any>; pendencias: Pendencia[] }> {
  const docs = await listarDocumentosEmpresaPorTipos(empresaId, ['atos_junta_comercial']);
  if (!docs.length) {
    return {
      dados: { anexado: false, analisado: false },
      pendencias: [{ codigo: 'atos_junta_nao_anexado', mensagem: 'Atos da Junta Comercial ainda não anexados.', severidade: 'alta', origem: 'documentos_arquivos', recomendacao: 'Anexar os Atos da Junta Comercial no Acervo Documental.' }],
    };
  }
  const documentosComConteudo = docs.filter(arquivoDocumentoTemConteudo);
  if (!documentosComConteudo.length) {
    return {
      dados: { anexado: true, analisado: false, tentativa_realizada: false, status_leitura: 'arquivo_vazio', documento_invalido: true, diagnostico: 'Os Atos da Junta anexados estão vazios ou sem conteúdo legível. Nenhum foi considerado analisado.' },
      pendencias: [{ codigo: 'atos_junta_arquivo_vazio', mensagem: 'Os Atos da Junta Comercial estão vazios ou sem conteúdo legível.', severidade: 'alta', origem: 'atos_junta_comercial', recomendacao: 'Anexar um PDF legível e completo dos Atos da Junta Comercial.' }],
    };
  }
  const docMaisRecente = documentosComConteudo[0];
  try {
    const analise = await obterAnaliseEspecializada({ empresaId, arquivoId: docMaisRecente.id, tipo: 'atos_junta_comercial', promptCodigo: 'atos_junta_extract', processar, reprocessar: processar });
    if (!analise) {
      const falhaPersistida = await buscarFalhaAnaliseEspecializada(docMaisRecente.id, 'atos_junta_extract');
      if (falhaPersistida) {
        const mensagem = mensagemSeguraFalhaLeitura('Atos da Junta Comercial', falhaPersistida.mensagem);
        return {
          dados: { anexado: true, analisado: false, tentativa_realizada: true, documento_id: docMaisRecente.id, status_leitura: 'falha_leitura', erro_processamento: mensagem, diagnostico: mensagem, lido_em: falhaPersistida.processado_em },
          pendencias: [{ codigo: 'atos_junta_falha_leitura', mensagem, severidade: 'alta', origem: 'atos_junta_comercial', recomendacao: 'Verificar o arquivo e tentar a leitura novamente.' }],
        };
      }
      return {
        dados: { anexado: true, analisado: false, documento_id: docMaisRecente.id, status_leitura: 'aguardando_analise', diagnostico: 'Atos da Junta anexados e aguardando a validação societária da Etapa 2.' },
        pendencias: [{ codigo: 'atos_junta_aguardando_analise', mensagem: 'Atos da Junta anexados e aguardando conferência com o contrato/alteração social.', severidade: 'alta', origem: 'atos_junta_comercial', recomendacao: 'Iniciar a análise documental quando Cartão CNPJ, QSA e Enquadramento Tributário estiverem anexados.' }],
      };
    }
    const dadosExtraidos = analise.dados_extraidos || {};
    const historico = Array.isArray(dadosExtraidos.historico_arquivamentos) ? dadosExtraidos.historico_arquivamentos : [];
    const temEvidenciaDocumental = Boolean(onlyDigits(dadosExtraidos.nire).length || dadosExtraidos.data_registro || historico.length || dadosExtraidos.documento_compativel === false);
    if (!temEvidenciaDocumental) {
      const mensagem = 'A leitura dos Atos da Junta não produziu NIRE, data de registro, histórico ou outra evidência documental. O arquivo não foi considerado validado.';
      return {
        dados: { anexado: true, analisado: false, tentativa_realizada: true, documento_id: docMaisRecente.id, status_leitura: 'analise_inconclusiva', documento_invalido: true, lido_em: analise.analisado_em, diagnostico: mensagem },
        pendencias: [{ codigo: 'atos_junta_leitura_inconclusiva', mensagem, severidade: 'alta', origem: 'atos_junta_comercial', recomendacao: 'Anexar um documento legível e executar novamente a análise dos Atos da Junta.' }],
      };
    }
    return {
      dados: {
        anexado: true,
        analisado: true,
        tentativa_realizada: true,
        documento_id: docMaisRecente.id,
        status_leitura: analise.status,
        lido_em: analise.analisado_em,
        modelo: analise.modelo_ia,
        nivel_confianca: analise.nivel_confianca,
        fonte_extracao: dadosExtraidos.fonte_extracao || analise.modelo_ia || null,
        diagnostico: resumoAnaliseEspecializada(analise, 'Atos da Junta Comercial'),
        ...dadosExtraidos,
      },
      pendencias: analise.alertas.map((a) => ({ codigo: a.codigo, mensagem: a.mensagem, severidade: severidadeParaPendencia(a.severidade), origem: 'atos_junta_comercial', recomendacao: a.recomendacao })),
    };
  } catch (err: any) {
    console.warn('[Dossie] Falha controlada na análise dos Atos da Junta:', err?.message || err);
    const mensagem = mensagemSeguraFalhaLeitura('Atos da Junta Comercial', err);
    return {
      dados: {
        anexado: true,
        analisado: false,
        tentativa_realizada: processar,
        documento_id: docMaisRecente.id,
        status_leitura: processar ? 'falha_leitura' : 'aguardando_analise',
        erro_processamento: processar ? mensagem : null,
        diagnostico: processar ? mensagem : 'Atos da Junta anexados e aguardando a validação societária da Etapa 2.',
      },
      pendencias: [{
        codigo: processar ? 'atos_junta_falha_leitura' : 'atos_junta_aguardando_analise',
        mensagem: processar ? mensagem : 'Atos da Junta anexados e aguardando conferência com o contrato/alteração social.',
        severidade: 'alta',
        origem: 'atos_junta_comercial',
        recomendacao: processar ? 'Verificar o arquivo anexado e executar novamente a validação societária da Etapa 2.' : 'Concluir a Etapa 1 e iniciar a validação de Contrato/Alteração e Atos da Junta.',
      }],
    };
  }
}

export async function montarEnquadramentoDados(
  empresaId: string,
  processar: boolean,
  empresa: any = null,
): Promise<{ dados: Record<string, any>; pendencias: Pendencia[] }> {
  const docs = await listarDocumentosEmpresaPorTipos(empresaId, ['enquadramento_tributario_cnpj', 'simples_nacional']);
  if (!docs.length) {
    // O Enquadramento Tributário não é um documento físico -- a informação vem da
    // consulta pública de CNPJ (Receita Federal), já sincronizada em
    // `empresas.regime_tributario`/`opcao_simples`/`opcao_mei`. Sem nenhum
    // documento anexado, mas com o regime já identificado pela Receita, isto NÃO
    // é mais tratado como pendência bloqueante -- um upload continua opcional
    // (reforço documental), nunca obrigatório.
    const regimeReceita = String(empresa?.regime_tributario || '').trim();
    const opcaoSimples = empresa?.opcao_simples ?? null;
    const opcaoMei = empresa?.opcao_mei ?? null;
    const identificadoPelaReceita = !!regimeReceita || opcaoSimples != null || opcaoMei != null;
    if (identificadoPelaReceita) {
      return {
        dados: {
          anexado: false,
          analisado: true,
          fonte_extracao: 'consulta_cnpj_receita',
          regime_tributario: regimeReceita || null,
          opcao_simples: opcaoSimples,
          opcao_mei: opcaoMei,
          diagnostico: `Regime tributário identificado via consulta de CNPJ: ${regimeReceita || (opcaoMei ? 'MEI' : opcaoSimples ? 'Simples Nacional' : 'regime informado pela Receita')}.`,
        },
        pendencias: [],
      };
    }
    return {
      dados: { anexado: false, analisado: false },
      pendencias: [{ codigo: 'enquadramento_nao_identificado', mensagem: 'Regime tributário ainda não identificado pela consulta de CNPJ.', severidade: 'alta', origem: 'empresas.regime_tributario', recomendacao: 'Sincronizar os dados de CNPJ (Receita Federal) da empresa. Um comprovante de enquadramento pode ser anexado como reforço opcional.' }],
    };
  }
  const docMaisRecente = docs[0];
  try {
    const analise = await obterAnaliseEspecializada({ empresaId, arquivoId: docMaisRecente.id, tipo: 'simples_nacional', promptCodigo: 'simples_extract', processar, reprocessar: processar });
    if (!analise) {
      const falhaPersistida = await buscarFalhaAnaliseEspecializada(docMaisRecente.id, 'simples_extract');
      if (falhaPersistida) {
        const mensagem = mensagemSeguraFalhaLeitura('Enquadramento Tributário', falhaPersistida.mensagem);
        return {
          dados: { anexado: true, analisado: false, tentativa_realizada: true, documento_id: docMaisRecente.id, status_leitura: 'falha_leitura', erro_processamento: mensagem, diagnostico: mensagem, lido_em: falhaPersistida.processado_em },
          pendencias: [{ codigo: 'enquadramento_falha_leitura', mensagem, severidade: 'alta', origem: 'enquadramento_tributario', recomendacao: 'Verificar o arquivo e tentar a leitura novamente.' }],
        };
      }
      return {
        dados: { anexado: true, analisado: false, documento_id: docMaisRecente.id, status_leitura: 'aguardando_analise', diagnostico: 'Enquadramento Tributário anexado e aguardando o início da análise documental.' },
        pendencias: [{ codigo: 'enquadramento_aguardando_analise', mensagem: 'Enquadramento Tributário anexado e aguardando o início da análise documental.', severidade: 'alta', origem: 'enquadramento_tributario', recomendacao: 'Iniciar a análise documental quando Cartão CNPJ, QSA e Enquadramento Tributário estiverem anexados.' }],
      };
    }
    return {
      dados: {
        anexado: true,
        analisado: true,
        tentativa_realizada: true,
        documento_id: docMaisRecente.id,
        status_leitura: analise.status,
        lido_em: analise.analisado_em,
        modelo: analise.modelo_ia,
        nivel_confianca: analise.nivel_confianca,
        fonte_extracao: analise.dados_extraidos?.fonte_extracao || analise.modelo_ia || null,
        diagnostico: resumoAnaliseEspecializada(analise, 'Enquadramento Tributário'),
        ...analise.dados_extraidos,
      },
      pendencias: analise.alertas.map((a) => ({ codigo: a.codigo, mensagem: a.mensagem, severidade: severidadeParaPendencia(a.severidade), origem: 'enquadramento_tributario', recomendacao: a.recomendacao })),
    };
  } catch (err: any) {
    console.warn('[Dossie] Falha controlada na análise do Enquadramento Tributário:', err?.message || err);
    const mensagem = mensagemSeguraFalhaLeitura('Enquadramento Tributário', err);
    return {
      dados: {
        anexado: true,
        analisado: false,
        tentativa_realizada: processar,
        documento_id: docMaisRecente.id,
        status_leitura: processar ? 'falha_leitura' : 'aguardando_analise',
        erro_processamento: processar ? mensagem : null,
        diagnostico: processar ? mensagem : 'Enquadramento Tributário anexado e aguardando o início da análise documental.',
      },
      pendencias: [{
        codigo: processar ? 'enquadramento_falha_leitura' : 'enquadramento_aguardando_analise',
        mensagem: processar ? mensagem : 'Enquadramento Tributário anexado e aguardando o início da análise documental.',
        severidade: 'alta',
        origem: 'enquadramento_tributario',
        recomendacao: processar ? 'Verificar o arquivo anexado e executar novamente a análise documental inicial.' : 'Iniciar a Etapa 1 quando Cartão CNPJ, QSA e Enquadramento Tributário estiverem anexados.',
      }],
    };
  }
}

function pendenciasQsa(socios: any[], empresa?: any): Pendencia[] {
  const qsa = dadosQsa(empresa || {}, socios);
  const sociosAnalise = Array.isArray(qsa.socios) ? qsa.socios : [];
  const pendencias: Pendencia[] = [];
  if (sociosAnalise.length === 0) {
    pendencias.push({ codigo: 'qsa_nao_importado', mensagem: 'Quadro societário ainda não sincronizado para conferência com o QSA.', severidade: 'alta', origem: 'socios_empresa', recomendacao: 'Atualizar os dados societários da Receita antes de iniciar a análise documental.' });
    return pendencias;
  }
  if (!sociosAnalise.some((s: any) => !!s.administrador)) {
    pendencias.push({ codigo: 'qsa_administrador_nao_identificado', mensagem: 'Não foi possível identificar quem é o sócio-administrador no quadro societário sincronizado.', severidade: 'alta', origem: 'socios_empresa' });
  }
  for (const socio of sociosAnalise) {
    const prefixo = socio.nome ? `Sócio ${socio.nome}` : 'Sócio sem nome';
    if (!socio.nome) pendencias.push({ codigo: 'socio_nome_ausente', mensagem: 'Existe sócio sem nome no quadro societário.', severidade: 'alta', origem: 'socios_empresa.nome' });
    if (!socio.qualificacao) pendencias.push({ codigo: 'socio_qualificacao_ausente', mensagem: `${prefixo}: qualificação societária não identificada.`, severidade: 'alta', origem: 'socios_empresa.qualificacao_socio' });
  }
  return pendencias;
}

async function ensureEmpresaBloco(empresaId: string, codigo: BlocoCodigo, dados: any, pendencias: Pendencia[], origem = 'sistema') {
  const completo = pendencias.filter((p) => p.severidade === 'alta' || p.severidade === 'media').length === 0;
  const status = completo ? 'validado' : 'pendente';
  const { rows } = await pool.query(
    `INSERT INTO public.documentacao_entidade_blocos
        (bloco_id, entidade_tipo, entidade_id, empresa_id, status, completo, validado, dados_estruturados, pendencias, origem)
     SELECT b.id, 'empresa', $1, $1, $3, $4, $4, $5::jsonb, $6::jsonb, $7
       FROM public.documentacao_blocos b
      WHERE b.codigo = $2
     ON CONFLICT (entidade_tipo, entidade_id, bloco_id) DO UPDATE SET
        empresa_id = EXCLUDED.empresa_id,
        status = EXCLUDED.status,
        completo = EXCLUDED.completo,
        validado = CASE WHEN public.documentacao_entidade_blocos.validado THEN true ELSE EXCLUDED.validado END,
        dados_estruturados = EXCLUDED.dados_estruturados,
        pendencias = EXCLUDED.pendencias,
        origem = EXCLUDED.origem
     RETURNING *`,
    [empresaId, codigo, status, completo, JSON.stringify(dados), JSON.stringify(pendencias), origem]
  );
  return rows[0];
}

async function ensureSocioBlocos(empresaId: string, socios: any[]) {
  const blocoSocios = await pool.query(`SELECT id FROM public.documentacao_blocos WHERE codigo = 'socios_representantes' LIMIT 1`);
  const blocoId = blocoSocios.rows[0]?.id;
  if (!blocoId) return;
  const regrasObrigatorias = (await tableExists('documentos_regras_credito'))
    ? (await pool.query(
        `SELECT codigo, tipo_documento, nome_amigavel
           FROM public.documentos_regras_credito
          WHERE entidade_tipo='socio' AND ativo=true AND obrigatorio=true
          ORDER BY ordem`,
      )).rows
    : [
        { codigo: 'socio_documento_id', tipo_documento: 'documento_socio', nome_amigavel: 'Documento de identificação do sócio' },
        { codigo: 'socio_comprovante_residencia', tipo_documento: 'comprovante_residencia', nome_amigavel: 'Comprovante de endereço do sócio' },
      ];
  const equivalentes: Record<string, string[]> = {
    documento_socio: ['documento_socio', 'cpf', 'rg', 'cnh'],
    imposto_renda: ['imposto_renda', 'irpf'],
    rating_bacen_cpf: ['rating_bacen_cpf', 'scr_cpf'],
    scr_cpf: ['scr_cpf', 'rating_bacen_cpf'],
  };
  for (const s of socios) {
    const pendencias = pendenciasQsa([s]).filter((p) => p.codigo !== 'sem_assinante_identificado');
    const docsResult = await pool.query(
      `SELECT tipo_documento, id, status, validado
         FROM public.documentos_arquivos
        WHERE excluido_em IS NULL AND status <> 'excluido'
          AND (socio_id=$1 OR (entidade_tipo='socio' AND entidade_id=$1))`,
      [s.id],
    );
    const docs = docsResult.rows;
    if (docs.length === 0) pendencias.push({ codigo: 'socio_sem_documentos', mensagem: `Sócio ${s.nome || s.id}: nenhum documento pessoal anexado.`, severidade: 'media', origem: 'documentos_arquivos' });
    for (const regra of regrasObrigatorias) {
      const aceitos = equivalentes[regra.tipo_documento] || [regra.tipo_documento];
      if (!docs.some((doc: any) => aceitos.includes(String(doc.tipo_documento)))) {
        pendencias.push({
          codigo: `${regra.codigo}_ausente`,
          mensagem: `${s.nome || 'Sócio'}: ${regra.nome_amigavel || regra.tipo_documento} não anexado.`,
          severidade: 'media',
          origem: 'documentos_regras_credito',
          recomendacao: 'Anexar no campo deste sócio; documentos de outra pessoa não satisfazem esta pendência.',
        });
      }
    }
    const completo = pendencias.filter((p) => p.severidade === 'alta' || p.severidade === 'media').length === 0;
    const dadosSocio = dadosQsa({ socios_receita: [] }, [s]).socios[0];
    await pool.query(
      `INSERT INTO public.documentacao_entidade_blocos
          (bloco_id, entidade_tipo, entidade_id, empresa_id, socio_id, status, completo, validado, dados_estruturados, pendencias, origem)
       VALUES ($1, 'socio', $2, $3, $2, $4, $5, $5, $6::jsonb, $7::jsonb, 'sistema')
       ON CONFLICT (entidade_tipo, entidade_id, bloco_id) DO UPDATE SET
          empresa_id = EXCLUDED.empresa_id,
          socio_id = EXCLUDED.socio_id,
          status = EXCLUDED.status,
          completo = EXCLUDED.completo,
          dados_estruturados = EXCLUDED.dados_estruturados,
          pendencias = EXCLUDED.pendencias`,
      [blocoId, s.id, empresaId, completo ? 'validado' : 'pendente', completo, JSON.stringify({ ...dadosSocio, cobertura_documental: { total_regras: regrasObrigatorias.length, total_presentes: regrasObrigatorias.length - pendencias.filter((item) => item.origem === 'documentos_regras_credito').length, documentos: docs.map((doc: any) => ({ id: doc.id, tipo_documento: doc.tipo_documento, status: doc.status, validado: doc.validado })) } }), JSON.stringify(pendencias)]
    );
  }
}

async function vincularDocumentosAutomaticos(empresaId: string) {
  const regras: Array<{ codigo: BlocoCodigo; tipos: string[] }> = [
    { codigo: 'cnpj_receita', tipos: ['cartao_cnpj', 'cnpj_cartao', 'certidao', 'consulta_receita'] },
    { codigo: 'qsa_quadro_societario', tipos: ['qsa'] },
    { codigo: 'atos_junta_comercial', tipos: ['atos_junta_comercial'] },
    { codigo: 'enquadramento_tributario', tipos: ['enquadramento_tributario_cnpj', 'simples_nacional'] },
    { codigo: 'socios_representantes', tipos: ['documento_socio', 'cpf', 'rg', 'cnh', 'comprovante_residencia', 'procuracao'] },
    { codigo: 'contrato_social_alteracoes', tipos: ['contrato_social', 'alteracao_contratual', 'estatuto', 'procuracao'] },
    { codigo: 'faturamento_historico', tipos: ['faturamento_12_meses', 'comprovante_faturamento', 'declaracao_faturamento', 'dre', 'balanco', 'nota_fiscal'] },
    { codigo: 'demonstracoes_contabeis_fiscais', tipos: ['dre', 'balanco', 'balancete', 'imposto_renda', 'ecd', 'ecf'] },
    { codigo: 'extratos_movimentacao_bancaria', tipos: ['extrato_bancario'] },
    { codigo: 'certidoes_regularidade', tipos: ['certidao', 'serasa', 'spc', 'boa_vista', 'cemprot'] },
    { codigo: 'scr_endividamento', tipos: ['rating_scr_bacen', 'relatorio_scr'] },
    { codigo: 'contratos_gerados', tipos: ['contrato_assessoria', 'contrato_gerado', 'contrato_assinado'] },
  ];
  if (!(await tableExists('documentos_arquivos'))) return;
  for (const regra of regras) {
    await pool.query(
      `INSERT INTO public.documentacao_bloco_arquivos (entidade_bloco_id, arquivo_id, tipo_documento, papel_documento, principal, status)
       SELECT deb.id, da.id, da.tipo_documento, da.tipo_documento, false, 'ativo'
         FROM public.documentacao_entidade_blocos deb
         JOIN public.documentacao_blocos b ON b.id = deb.bloco_id AND b.codigo = $2
         JOIN public.documentos_arquivos da ON da.empresa_id = $1 AND da.tipo_documento = ANY($3::text[])
        WHERE deb.entidade_tipo = 'empresa'
          AND deb.entidade_id = $1
          AND (b.codigo <> 'socios_representantes' OR deb.socio_id IS NULL OR da.socio_id = deb.socio_id OR (da.entidade_tipo='socio' AND da.entidade_id=deb.socio_id))
          AND da.excluido_em IS NULL
          AND da.status <> 'excluido'
       ON CONFLICT (entidade_bloco_id, arquivo_id) DO NOTHING`,
      [empresaId, regra.codigo, regra.tipos]
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Prontidão da "Identidade do CNPJ" (3 documentos iniciais: Cartão CNPJ,
// QSA e Enquadramento Tributário). Atos da Junta passam para a Etapa 2.
// só considera "tudo ok, pode avançar" quando:
//   1) situação cadastral ativa;
//   2) nenhuma pendência de severidade alta/crítica nos 3 blocos (CNPJ
//      divergente, sócio não localizado na Receita, capital social
//      incompatível, alteração recente não refletida etc.);
//   4) enquadramento tributário identificado. MEI pode prosseguir na inclusão
//      documental; a ausência de Atos da Junta é tratada na Etapa 2.
// Isso alimenta o botão/CTA "Avançar para a próxima etapa" no relatório.
// ─────────────────────────────────────────────────────────────────────────
async function avaliarProntidaoIdentidadeCnpj(params: {
  empresaId: string;
  empresa: any;
  docsCartao: any[];
  erroProcessamentoCartao?: string | null;
  cnpjPendencias: Pendencia[];
  qsaPendencias: Pendencia[];
  enquadramentoPendencias: Pendencia[];
  qsaDados: Record<string, any>;
  enquadramentoDados: Record<string, any>;
}) {
  const analiseCnpj = await buscarUltimaAnaliseCnpjEmpresa(params.empresaId).catch(() => null);
  const resultadoCnpj = analiseCnpj?.resultado && typeof analiseCnpj.resultado === 'object' ? analiseCnpj.resultado : {};
  const camposReceita = analiseCnpj?.campos_receita && typeof analiseCnpj.campos_receita === 'object' ? analiseCnpj.campos_receita : (resultadoCnpj?.campos_receita || {});
  const camposCartao = analiseCnpj?.campos_cartao && typeof analiseCnpj.campos_cartao === 'object' ? analiseCnpj.campos_cartao : (resultadoCnpj?.campos_cartao || {});
  const idadeMeses: number | null = camposReceita?.idade_meses ?? analiseCnpj?.idade_meses ?? null;

  const bloqueios: string[] = [];
  const avisos: string[] = [];
  const pontosPositivos: string[] = [];
  const addBloqueio = (mensagem: string) => { if (mensagem && !bloqueios.includes(mensagem)) bloqueios.push(mensagem); };
  const addAviso = (mensagem: string) => { if (mensagem && !avisos.includes(mensagem)) avisos.push(mensagem); };
  const primeiraPendencia = (pendencias: Pendencia[]) => pendencias.find((p) => p.severidade === 'alta') || pendencias[0];

  const situacaoAtiva = isSituacaoAtiva(params.empresa.situacao_cadastral);
  if (situacaoAtiva) pontosPositivos.push('Situação cadastral ativa na Receita Federal.');
  else addBloqueio(`Situação cadastral "${params.empresa.situacao_cadastral || 'não informada'}" impede o avanço.`);

  const empresaApta12Meses = idadeMeses === null ? null : idadeMeses >= 12;
  if (empresaApta12Meses === true) pontosPositivos.push(`Empresa com ${idadeMeses} meses de abertura, acima do mínimo operacional de 12 meses.`);
  else if (empresaApta12Meses === false) addAviso(`Empresa com ${idadeMeses} meses de abertura. A comprovação temporal será bloqueada e auditada na Fase 3.`);
  else addAviso('Tempo de abertura ainda não confirmado; a trava temporal será auditada na Fase 3.');

  const alertasCnpj = [
    ...(Array.isArray(analiseCnpj?.alertas) ? analiseCnpj.alertas : []),
    ...(Array.isArray(analiseCnpj?.divergencias) ? analiseCnpj.divergencias : []),
    ...(Array.isArray(resultadoCnpj?.alertas) ? resultadoCnpj.alertas : []),
    ...(Array.isArray(resultadoCnpj?.divergencias) ? resultadoCnpj.divergencias : []),
  ];
  // Alguns códigos de alerta são sinais de risco de negócio (ex.: empresa recém-aberta),
  // não uma divergência entre o Cartão CNPJ anexado e os dados da Receita Federal. Eles já
  // são exibidos corretamente em "avisos estratégicos" (ver empresaApta12Meses acima) e não
  // devem fazer o Cartão CNPJ ser rotulado como "divergente da Receita", que é uma mensagem
  // sobre o documento em si, não sobre o risco cadastral da empresa.
  const CODIGOS_ALERTA_RISCO_NAO_DIVERGENCIA_CARTAO = new Set(['empresa_menos_12_meses']);
  const cnpjTemDivergenciaGrave = alertasCnpj.some((item: any) => (
    !CODIGOS_ALERTA_RISCO_NAO_DIVERGENCIA_CARTAO.has(String(item?.codigo || ''))
    && (['alta', 'critica'].includes(String(item?.severidade || '').toLowerCase()) || item?.divergente === true)
  ));
  const cartaoAnexado = params.docsCartao.length > 0 || analiseCnpj?.cartao_anexado === true;
  const cartaoAnalisado = !!analiseCnpj && analiseCnpj?.cartao_anexado === true && analiseCnpj?.cartao_pendente_ocr !== true;
  const cartaoConsistente = cartaoAnexado && cartaoAnalisado && !cnpjTemDivergenciaGrave;
  const cartaoFalhou = cartaoAnexado && !cartaoAnalisado && !!params.erroProcessamentoCartao;
  if (!cartaoAnexado) addBloqueio('Cartão CNPJ não anexado.');
  else if (cartaoFalhou) addBloqueio(params.erroProcessamentoCartao!);
  else if (!cartaoAnalisado) addBloqueio('Cartão CNPJ anexado, mas a leitura e conferência ainda não foram concluídas.');
  else if (!cartaoConsistente) addBloqueio('Cartão CNPJ possui divergência relevante com os dados da Receita Federal.');
  else pontosPositivos.push('Cartão CNPJ analisado e convergente com a Receita Federal.');

  const qsaAnexado = params.qsaDados?.anexado === true;
  const qsaAnalisado = params.qsaDados?.analisado === true;
  const qsaTemGrave = params.qsaPendencias.some((p) => p.severidade === 'alta');
  const qsaConsistente = qsaAnexado && qsaAnalisado && !qsaTemGrave;
  if (!qsaAnexado) addBloqueio('Documento QSA não anexado.');
  else if (!qsaAnalisado) addBloqueio(params.qsaDados?.erro_processamento || 'QSA anexado, mas a análise documental ainda não foi concluída.');
  else if (qsaTemGrave) addBloqueio('QSA possui divergências societárias relevantes.');
  else pontosPositivos.push('QSA analisado: CNPJ, razão social, capital social, sócios e administrador conferidos.');

  // O Enquadramento Tributário NÃO é um documento físico a ser anexado -- essa
  // informação vem estritamente da consulta pública de CNPJ (Receita Federal),
  // já sincronizada em `empresas.regime_tributario`/`opcao_simples`/`opcao_mei`
  // (ver `montarCnpjDados`). Um documento comprobatório (ex: consulta do Simples
  // Nacional) continua podendo ser anexado como reforço opcional -- e, se for
  // anexado, ainda precisa ser lido e não pode contradizer os dados da Receita --
  // mas a ausência dele nunca bloqueia a Fase 1.
  const enquadramentoAnexado = params.enquadramentoDados?.anexado === true;
  const enquadramentoAnalisado = params.enquadramentoDados?.analisado === true;
  const enquadramentoTemGrave = params.enquadramentoPendencias.some((p) => p.severidade === 'alta');
  const regime = String(params.enquadramentoDados?.regime_tributario || params.empresa?.regime_tributario || '').trim();
  const situacaoSimples = String(params.enquadramentoDados?.situacao_simples || '').trim();
  const enquadramentoIdentificado = !!regime || !!situacaoSimples
    || params.empresa?.opcao_simples != null || params.empresa?.opcao_mei != null;
  const enquadramentoConsistente = enquadramentoIdentificado
    && !enquadramentoTemGrave
    && (!enquadramentoAnexado || enquadramentoAnalisado);
  if (!enquadramentoIdentificado) addBloqueio('Regime tributário não identificado. Sincronize os dados de CNPJ (Receita Federal) da empresa.');
  else if (enquadramentoAnexado && !enquadramentoAnalisado) addBloqueio(params.enquadramentoDados?.erro_processamento || 'Documento de enquadramento anexado, mas a análise ainda não foi concluída.');
  // Uma leitura automática de baixa confiança (ou não totalmente confirmada) do
  // comprovante opcional de enquadramento não é uma divergência de dado -- o regime
  // tributário em si já está identificado pela consulta de CNPJ acima. Por isso vira
  // aviso de revisão (visível na ficha da empresa), não bloqueio da Fase 1: o time
  // consegue revisar o comprovante depois, sem travar o anexo dos demais documentos.
  else if (enquadramentoTemGrave) addAviso('Enquadramento tributário: o comprovante anexado como reforço precisa de revisão humana (divergência ou baixa confiança na leitura automática).');
  else pontosPositivos.push(`Enquadramento tributário identificado via consulta de CNPJ: ${regime || situacaoSimples}.`);

  const textoEnquadramento = [regime, situacaoSimples, params.empresa?.porte, params.empresa?.natureza_juridica].filter(Boolean).join(' ');
  const ehMei = params.enquadramentoDados?.opcao_mei === true || params.empresa?.opcao_mei === true || /\bmei\b|microempreendedor individual|simei/i.test(textoEnquadramento);
  if (ehMei) {
    addAviso('Empresa identificada como MEI: a ausência de Atos da Junta será dispensada na etapa societária, sem impedir a inclusão dos demais documentos.');
  }

  const todasPendencias = [...params.cnpjPendencias, ...params.qsaPendencias];
  for (const pendencia of todasPendencias.filter((p) => p.severidade === 'alta')) addBloqueio(pendencia.mensagem);
  for (const pendencia of todasPendencias.filter((p) => p.severidade === 'media')) addAviso(pendencia.mensagem);
  // Pendências do Enquadramento Tributário nunca bloqueiam a Fase 1 (documento de reforço
  // opcional -- ver comentário acima). Tanto as de severidade alta quanto média viram
  // aviso, para o time continuar vendo o que precisa de revisão sem travar o avanço.
  for (const pendencia of params.enquadramentoPendencias.filter((p) => p.severidade === 'alta' || p.severidade === 'media')) addAviso(pendencia.mensagem);

  const statusDocumento = (anexado: boolean, analisado: boolean, consistente: boolean, falha: boolean) => {
    if (consistente) return 'ok';
    if (!anexado) return 'nao_anexado';
    if (falha) return 'falha_leitura';
    if (!analisado) return 'aguardando_analise';
    return 'divergente';
  };
  const cartaoPendencia = alertasCnpj.find((item: any) => ['critica', 'alta'].includes(String(item?.severidade || '').toLowerCase())) || alertasCnpj[0];
  const qsaPendencia = primeiraPendencia(params.qsaPendencias);
  const enquadramentoPendencia = primeiraPendencia(params.enquadramentoPendencias);

  const documentosIniciais = {
    cartao_cnpj: {
      codigo: 'cartao_cnpj', nome: 'Cartão CNPJ', anexado: cartaoAnexado, analisado: cartaoAnalisado, consistente: cartaoConsistente,
      status: statusDocumento(cartaoAnexado, cartaoAnalisado, cartaoConsistente, cartaoFalhou),
      diagnostico: cartaoConsistente ? 'CNPJ, razão social, CNAE, natureza jurídica, porte e situação cadastral convergem com a Receita Federal.' : params.erroProcessamentoCartao || cartaoPendencia?.mensagem || (cartaoAnexado ? 'Documento anexado; a leitura automática ainda precisa ser concluída.' : 'Documento não anexado.'),
      fonte: camposCartao?.fonte_extracao || analiseCnpj?.fonte_receita || null, confianca: camposCartao?.confianca ?? null,
      campos_principais: { cnpj: camposCartao?.cnpj || camposReceita?.cnpj || params.empresa?.cnpj || null, razao_social: camposCartao?.nome_empresarial || camposReceita?.razao_social || params.empresa?.razao_social || null, cnae: camposCartao?.cnae_principal || camposReceita?.cnae_principal || params.empresa?.cnae_principal || null, situacao_cadastral: camposCartao?.situacao_cadastral || camposReceita?.situacao_cadastral || params.empresa?.situacao_cadastral || null },
    },
    qsa: {
      codigo: 'qsa', nome: 'QSA / Quadro Societário', anexado: qsaAnexado, analisado: qsaAnalisado, consistente: qsaConsistente,
      status: statusDocumento(qsaAnexado, qsaAnalisado, qsaConsistente, params.qsaDados?.status_leitura === 'falha_leitura'),
      tipo_documento: 'qsa',
      tipo_leitura: 'qsa',
      qsa_leitura: true,
      diagnostico: qsaConsistente ? 'CNPJ, razão social, capital social, nomes dos sócios e identificação do Sócio-Administrador foram conferidos.' : params.qsaDados?.diagnostico || qsaPendencia?.mensagem || (qsaAnexado ? 'Documento anexado; a análise societária ainda precisa ser concluída.' : 'Documento não anexado.'),
      fonte: params.qsaDados?.fonte_extracao || params.qsaDados?.modelo || null, confianca: params.qsaDados?.nivel_confianca ?? params.qsaDados?.confianca ?? null,
      socios_lidos: Array.isArray(params.qsaDados?.socios) ? params.qsaDados.socios : [],
      campos_principais: {
        cnpj: params.qsaDados?.cnpj || null,
        razao_social: params.qsaDados?.razao_social || null,
        capital_social: params.qsaDados?.capital_social ?? null,
        socios_identificados: Array.isArray(params.qsaDados?.socios) ? params.qsaDados.socios.length : null,
        administradores: Array.isArray(params.qsaDados?.socios)
          ? params.qsaDados.socios
              .filter((socio: any) => socio?.administrador === true || /administrador|titular|empres[aá]rio individual/i.test(String(socio?.qualificacao || '')))
              .map((socio: any) => socio?.nome)
              .filter(Boolean)
          : [],
      },
    },
    enquadramento_tributario: {
      codigo: 'enquadramento_tributario', nome: 'Enquadramento Tributário', anexado: enquadramentoAnexado, analisado: enquadramentoAnalisado, consistente: enquadramentoConsistente,
      status: statusDocumento(enquadramentoAnexado, enquadramentoAnalisado, enquadramentoConsistente, params.enquadramentoDados?.status_leitura === 'falha_leitura'),
      diagnostico: enquadramentoConsistente ? `Regime tributário confirmado: ${regime || situacaoSimples}.` : params.enquadramentoDados?.diagnostico || enquadramentoPendencia?.mensagem || (enquadramentoAnexado ? 'Documento anexado; o enquadramento ainda precisa ser confirmado.' : 'Documento não anexado.'),
      fonte: params.enquadramentoDados?.fonte_extracao || params.enquadramentoDados?.modelo || null, confianca: params.enquadramentoDados?.nivel_confianca ?? params.enquadramentoDados?.confianca ?? null,
      campos_principais: { cnpj: params.enquadramentoDados?.cnpj || null, regime_tributario: regime || null, situacao_simples: situacaoSimples || null, exclusao_agendada: params.enquadramentoDados?.agendamento_exclusao === true },
    },
  };
  // O Enquadramento Tributário é reforço documental opcional (ver comentário acima) --
  // sua própria consistência fica visível no card dele ("revisão necessária" quando for
  // o caso), mas não integra o portão de avanço da Fase 1, que depende apenas dos dois
  // documentos obrigatórios (Cartão CNPJ e QSA) e da ausência de bloqueios reais.
  const tresDocumentosOk = cartaoConsistente && qsaConsistente;
  const apto = situacaoAtiva && tresDocumentosOk && bloqueios.length === 0;

  return {
    etapa: 'identidade_cnpj', proxima_etapa: 'documentacao_societaria', apto_para_avancar: apto, botao_avancar_disponivel: apto,
    tres_documentos_ok: tresDocumentosOk, quatro_documentos_ok: tresDocumentosOk, documentos_iniciais: documentosIniciais,
    idade_meses: idadeMeses, situacao_cadastral_ativa: situacaoAtiva, empresa_apta_12_meses: empresaApta12Meses,
    enquadramento_tributario: regime || situacaoSimples || null, empresa_mei: ehMei, estrategia_alternativa_disponivel: ehMei,
    score_cnpj: analiseCnpj?.score_cnpj ?? null, motivos_pendentes: bloqueios, avisos_estrategicos: avisos, pontos_positivos: pontosPositivos,
    relatorio: { conclusao: apto ? 'APTO_PARA_AVANCAR' : 'PENDENTE', documentos_conferidos: Object.values(documentosIniciais).filter((item) => item.consistente).length, documentos_analisados: Object.values(documentosIniciais).filter((item) => item.analisado).length, falhas_leitura: Object.values(documentosIniciais).filter((item) => item.status === 'falha_leitura').length, total_documentos_iniciais: 3, bloqueios: bloqueios.length, avisos: avisos.length },
    diagnostico: apto ? 'Identidade empresarial validada pelos documentos obrigatórios (Cartão CNPJ e QSA). A empresa pode avançar para conferir Contrato Social/Alteração e Atos da Junta Comercial.' : Object.values(documentosIniciais).some((item) => item.status === 'falha_leitura') ? 'Um ou mais arquivos apresentaram falha técnica ou baixa legibilidade.' : `A etapa Identidade do CNPJ possui ${bloqueios.length} bloqueio(s). O avanço será liberado quando o Cartão CNPJ e o QSA estiverem consistentes.`,
  };
}

async function montarValidacaoSocietaria(
  empresaId: string,
  processar: boolean,
  contexto: { empresa?: any; enquadramentoDados?: Record<string, any> } = {},
) {
  const [docsContrato, docsAtos] = await Promise.all([
    listarDocumentosEmpresaPorTipos(empresaId, ['alteracao_contratual', 'contrato_social']),
    listarDocumentosEmpresaPorTipos(empresaId, ['atos_junta_comercial']),
  ]);
  const atosAnexado = docsAtos.length > 0;
  const atos = docsAtos.find(arquivoDocumentoTemConteudo) || null;
  const textoEnquadramento = [
    contexto.enquadramentoDados?.regime_tributario,
    contexto.enquadramentoDados?.situacao_simples,
    contexto.empresa?.regime_tributario,
    contexto.empresa?.porte,
    contexto.empresa?.natureza_juridica,
  ].filter(Boolean).join(' ');
  const empresaMei = contexto.enquadramentoDados?.opcao_mei === true
    || contexto.empresa?.opcao_mei === true
    || /\bmei\b|microempreendedor individual|simei/i.test(textoEnquadramento);
  const promptCodigo = 'contrato_junta_crosscheck';
  const atosLeitura = !atos && empresaMei
    ? {
        dados: { anexado: false, analisado: true, dispensado: true, atos_dispensados_por_mei: true, diagnostico: 'Atos da Junta dispensados porque o enquadramento anterior identificou a empresa como MEI.' },
        pendencias: [] as Pendencia[],
      }
    : await montarAtosJuntaDados(empresaId, processar && !!atos);
  const atosDados = atosLeitura.dados || {};
  const atosBloqueios = (atosLeitura.pendencias || []).filter((item) => item.severidade === 'alta');
  const atosAprovados = empresaMei
    ? atosDados?.analisado === true && atosDados?.atos_dispensados_por_mei === true
    : !!atos && atosDados?.analisado === true && atosBloqueios.length === 0;
  const resultados: Array<{ documento: any; analise: AnaliseDocumentalResult | null; erro?: string | null }> = [];

  for (const documento of docsContrato) {
    let analise: AnaliseDocumentalResult | null = null;
    let erro: string | null = null;
    if (atos) {
      const persistido = await buscarAnaliseEspecializadaPersistida(documento.id, promptCodigo);
      const idsAtuais = persistido?.dados_extraidos?.contrato_arquivo_id === documento.id
        && persistido?.dados_extraidos?.atos_arquivo_id === atos.id;
      analise = idsAtuais ? persistido : null;
      if (processar) {
        try {
          analise = await analiseDocumentalService.analisarContratoComAtosJunta(empresaId, documento.id, atos.id);
          await persistirAnaliseEspecializada(documento.id, promptCodigo, analise);
        } catch (error) {
          erro = mensagemSeguraFalhaLeitura('Contrato/Alteração Social', error);
          await persistirFalhaAnaliseEspecializada(documento.id, promptCodigo, error);
          console.warn('[Dossie] Falha controlada em documento societário:', documento.id, (error as any)?.message || error);
        }
      }
    }
    resultados.push({ documento, analise, erro });
  }

  const documentosAnalisados = resultados
    .filter((item) => item.analise)
    .map((item) => {
      const dados = item.analise!.dados_extraidos || {};
      const contrato = dados.contrato || {};
      const bloqueios = (item.analise!.alertas || []).filter((alerta) => alerta.severidade === 'alta' || alerta.severidade === 'critica');
      const resultadoAnalise = montarResultadoDetalhadoRelatorio(
        { ...item.documento, analisado: true, consistente: item.analise!.status === 'concluido' && bloqueios.length === 0 },
        item.analise,
      );
      return {
        arquivo_id: item.documento.id,
        nome: item.documento.nome_original || item.documento.nome_arquivo || 'Contrato/Alteração',
        nire: contrato.nire || null,
        data_registro: contrato.data_registro || null,
        tipo_ato: contrato.tipo_ato || null,
        consistente: item.analise!.status === 'concluido' && bloqueios.length === 0,
        status_analise: item.analise!.status,
        revisao_humana_necessaria: item.analise!.revisao_humana_necessaria === true,
        confianca: item.analise!.nivel_confianca ?? contrato.confianca ?? null,
        diagnostico: contrato.diagnostico_factual || dados.diagnostico_factual || null,
        diagnostico_factual: contrato.diagnostico_factual || dados.diagnostico_factual || null,
        alteracoes_societarias: Array.isArray(contrato.alteracoes_societarias) ? contrato.alteracoes_societarias : [],
        quadro_societario_final: Array.isArray(contrato.quadro_societario_final) ? contrato.quadro_societario_final : [],
        capital_social_anterior: contrato.capital_social_anterior ?? null,
        capital_social_atual: contrato.capital_social_atual ?? null,
        alertas: item.analise!.alertas || [],
        analise_societaria_auditavel: dados.analise_societaria_auditavel || null,
        estado_atual_societario: dados.analise_societaria_auditavel?.estado_atual || null,
        confronto_qsa: dados.analise_societaria_auditavel?.confronto_qsa || null,
        linha_tempo_societaria: Array.isArray(dados.analise_societaria_auditavel?.linha_tempo_societaria) ? dados.analise_societaria_auditavel.linha_tempo_societaria : [],
        qsa_adicional_necessario: dados.analise_societaria_auditavel?.qsa_adicional_necessario === true,
        qsa_adicional_motivo: dados.analise_societaria_auditavel?.qsa_adicional_motivo || null,
        resultado_analise: resultadoAnalise,
      };
    });

  const cadeia = calcularCadeiaComprovacaoSocietaria(
    Array.isArray(atosDados?.historico_arquivamentos) ? atosDados.historico_arquivamentos : [],
    documentosAnalisados,
    new Date(),
    { empresaMei },
  );
  const datasRequeridas = new Set((cadeia.registros_requeridos || []).map((item: any) => item.data));
  const alertasRelevantes = documentosAnalisados
    .filter((item) => !item.data_registro || datasRequeridas.has(item.data_registro))
    .flatMap((item) => item.alertas || []);
  const bloqueios = alertasRelevantes
    .filter((item: any) => item.severidade === 'alta' || item.severidade === 'critica')
    .map((item: any) => item.mensagem);

  if (documentosAnalisados.length > 0 && !empresaMei) {
    try {
      validateTwelveMonthContractHistory(documentosAnalisados.map((item) => ({
        id: item.arquivo_id,
        type: /alterac/i.test(String(item.tipo_ato || item.nome || '')) ? 'alteracao_contratual' : 'contrato_social',
        registrationDate: item.data_registro,
        approved: item.consistente === true,
      })));
    } catch (error) {
      if (error instanceof InsufficientHistoricalPeriodException) bloqueios.push(error.message);
      else throw error;
    }
  }

  if (!docsContrato.length && !empresaMei) bloqueios.unshift('Contrato Social ou Alteração Contratual ainda não anexado.');
  if (!atosAnexado && !empresaMei) bloqueios.unshift('Nenhum Ato da Junta foi localizado. A empresa pode ter registro em outro órgão; a inclusão de documentos permanece liberada, mas a validação exige revisão humana.');
  if (atosAnexado && !atos && !empresaMei) bloqueios.unshift('Os Atos da Junta anexados estão vazios ou sem conteúdo legível; nenhum foi considerado analisado.');
  if (cadeia.possivel_registro_em_outro_orgao && !empresaMei) bloqueios.push('Nenhum ato registrado foi identificado. A empresa pode estar registrada em outro tipo de órgão; mantenha a inclusão documental liberada e encaminhe para revisão humana.');
  if (atos && !atosDados?.analisado) bloqueios.push(atosDados?.diagnostico || 'A leitura dos Atos da Junta ainda não foi concluída.');
  for (const item of cadeia.registros_faltantes || []) {
    bloqueios.push(`Anexar o contrato/alteração registrado em ${item.data}${item.numero ? ` (arquivamento ${item.numero})` : ''} para completar a comprovação mínima de 12 meses.`);
  }
  if (atosDados?.analisado && cadeia.todos_atos_devem_ser_anexados) {
    bloqueios.push('Todos os atos identificados devem ser anexados. A empresa não possui 12 meses de constituição comprovada para operar com crédito.');
  }
  for (const item of resultados.filter((resultado) => resultado.erro)) bloqueios.push(item.erro!);

  const bloqueiosUnicos = Array.from(new Set(bloqueios.filter(Boolean)));
  const avisos = [
    ...(atosLeitura.pendencias || []).filter((item) => item.severidade !== 'alta').map((item) => item.mensagem),
    ...alertasRelevantes.filter((item: any) => item.severidade === 'media' || item.severidade === 'baixa').map((item: any) => item.mensagem),
  ];
  const analisado = empresaMei ? atosDados?.analisado === true : atosDados?.analisado === true && documentosAnalisados.length > 0;
  const consistente = empresaMei
    ? analisado && cadeia.atos_dispensados_por_mei === true && bloqueiosUnicos.length === 0
    : !!atos && docsContrato.length > 0 && analisado
      && cadeia.continuidade_12_meses_comprovada === true
      && bloqueiosUnicos.length === 0;
  const documentoPrincipal = documentosAnalisados.find((item) => item.data_registro === cadeia.ultimo_registro?.data)
    || documentosAnalisados[0]
    || null;
  const resultadoAnaliseAtos = {
    conclusao: atosDados?.diagnostico || (atosAprovados ? 'Leitura concluída; documento considerado consistente.' : 'Leitura concluída com observações ou necessidade de revisão.'),
    diagnostico: atosDados?.diagnostico || null,
    diagnostico_factual: atosDados?.diagnostico || null,
    campos: [
      { label: 'NIRE', valor: atosDados?.nire || null },
      { label: 'Data do último ato', valor: atosDados?.data_registro || cadeia.ultimo_registro?.data || null },
      { label: 'CNPJ informado na Junta', valor: atosDados?.cnpj || null },
      { label: 'Arquivamentos identificados', valor: Array.isArray(atosDados?.historico_arquivamentos) ? atosDados.historico_arquivamentos.length : null },
    ].filter((campo) => campo.valor != null && String(campo.valor).trim() !== ''),
    observacoes: [],
  };

  return {
    etapa: 'documentacao_societaria',
    titulo: 'Etapa 2 — Continuidade societária e Junta Comercial',
    habilitada: true,
    iniciada: empresaMei || docsContrato.length > 0 || atosAnexado || documentosAnalisados.length > 0,
    contrato_anexado: docsContrato.length > 0,
    total_contratos_anexados: docsContrato.length,
    atos_junta_anexados: atosAnexado,
    atos_junta_aprovados: atosAprovados,
    analisado,
    consistente,
    apto_para_avancar: consistente,
    botao_validar_disponivel: empresaMei ? false : atosAnexado && (!atosAprovados || docsContrato.length > 0),
    botao_avancar_disponivel: consistente,
    contrato_arquivo_id: documentoPrincipal?.arquivo_id || docsContrato[0]?.id || null,
    atos_arquivo_id: atos?.id || docsAtos[0]?.id || null,
    nire_contrato: documentoPrincipal?.nire || null,
    nire_junta: atosDados?.nire || null,
    nire_confere: !!documentoPrincipal?.nire && onlyDigits(documentoPrincipal.nire) === onlyDigits(atosDados?.nire),
    data_registro_contrato: documentoPrincipal?.data_registro || null,
    data_ato_junta: cadeia.ultimo_registro?.data || atosDados?.data_registro || null,
    data_confere: !!documentoPrincipal?.data_registro && documentoPrincipal.data_registro === cadeia.ultimo_registro?.data,
    cnpj_junta_informativo: atosDados?.cnpj || null,
    data_corte_12_meses: cadeia.data_corte_12_meses,
    ultimo_registro_junta: cadeia.ultimo_registro,
    registros_requeridos: cadeia.registros_requeridos,
    registros_faltantes: cadeia.registros_faltantes,
    continuidade_12_meses_comprovada: cadeia.continuidade_12_meses_comprovada,
    historico_cobre_12_meses: cadeia.historico_cobre_12_meses,
    sem_ato_registrado: cadeia.sem_ato_registrado,
    atos_dispensados_por_mei: cadeia.atos_dispensados_por_mei,
    possivel_registro_em_outro_orgao: cadeia.possivel_registro_em_outro_orgao,
    permite_seguir_com_inclusao_documental: cadeia.permite_seguir_com_inclusao_documental,
    todos_atos_devem_ser_anexados: cadeia.todos_atos_devem_ser_anexados,
    empresa_sem_tempo_minimo_constituicao: cadeia.empresa_sem_tempo_minimo_constituicao,
    meses_comprovados: cadeia.meses_entre_registros_extremos,
    documentos_analisados: documentosAnalisados,
    resultado_analise_atos: atosDados?.analisado === true ? resultadoAnaliseAtos : null,
    fonte_estado_atual: documentosAnalisados.find((item) => item.estado_atual_societario?.fonte === 'contrato')?.estado_atual_societario?.fonte
      || (documentosAnalisados.some((item) => item.estado_atual_societario?.fonte === 'qsa') ? 'qsa' : 'indeterminado'),
    qsa_adicional_necessario: documentosAnalisados.some((item) => item.qsa_adicional_necessario === true),
    qsa_adicional_motivo: documentosAnalisados.find((item) => item.qsa_adicional_motivo)?.qsa_adicional_motivo || null,
    bloqueios: bloqueiosUnicos,
    avisos: Array.from(new Set(avisos.filter(Boolean))),
    diagnostico: consistente
      ? 'NIRE, datas de registro e cadeia de contratos/alterações comprovam pelo menos 12 meses de continuidade societária. A próxima análise está liberada.'
      : cadeia.atos_dispensados_por_mei
        ? 'Atos da Junta dispensados para MEI. A inclusão documental pode prosseguir normalmente.'
      : !docsContrato.length || !atos
        ? 'Anexe os Atos da Junta e o contrato/alteração correspondente. Se o último registro tiver menos de 12 meses, o sistema solicitará as alterações anteriores necessárias.'
        : analisado
          ? cadeia.diagnostico
          : 'Documentos anexados e prontos para validação de NIRE, datas e continuidade mínima de 12 meses.',
  };
}

async function montarDossieCreditoEmpresa(empresaId: string, options: { processarDocumentos?: boolean; processarSocietario?: boolean; usuarioId?: string | null } = {}) {
  await ensureBlocosCatalogo();
  let erroProcessamentoCartao: string | null = null;
  if (options.processarDocumentos) {
    try {
      await analisarCnpjReceitaCartaoEmpresa(empresaId, options.usuarioId || null);
    } catch (error: any) {
      erroProcessamentoCartao = mensagemSeguraFalhaLeitura('Cartão CNPJ', error);
      console.warn('[Dossie] Análise do Cartão CNPJ não interrompeu o relatório:', error?.message || error);
    }
  }
  const empresa = await getEmpresa(empresaId);
  if (!empresa) return null;
  const socios = await getSociosEmpresa(empresaId);
  const docsCnpj = await listarDocumentosEmpresaPorTipos(empresaId, ['cartao_cnpj', 'cnpj_cartao', 'certidao', 'consulta_receita']);
  const docsCartao = docsCnpj.filter((doc: any) => ['cartao_cnpj', 'cnpj_cartao'].includes(String(doc.tipo_documento || '')));
  if (options.processarDocumentos && docsCartao[0]?.id) {
    if (erroProcessamentoCartao) {
      await pool.query(
        `UPDATE public.documentos_arquivos
            SET resultado_validacao = COALESCE(resultado_validacao, '{}'::jsonb) || $2::jsonb,
                atualizado_em = NOW()
          WHERE id = $1`,
        [docsCartao[0].id, JSON.stringify({ analise_inicial_erro: { mensagem: erroProcessamentoCartao, ocorrido_em: new Date().toISOString() } })],
      ).catch(() => undefined);
    } else {
      await pool.query(
        `UPDATE public.documentos_arquivos
            SET resultado_validacao = COALESCE(resultado_validacao, '{}'::jsonb) - 'analise_inicial_erro',
                atualizado_em = NOW()
          WHERE id = $1`,
        [docsCartao[0].id],
      ).catch(() => undefined);
    }
  }
  const erroCartaoPersistido = options.processarDocumentos && !erroProcessamentoCartao
    ? null
    : (erroProcessamentoCartao || docsCartao[0]?.resultado_validacao?.analise_inicial_erro?.mensagem || null);
  const cnpjPendencias = pendenciasCnpj(empresa, docsCartao);
  // A Etapa 1 processa somente QSA e Enquadramento; o Cartão CNPJ é tratado
  // pelo serviço Receita + Cartão. Atos da Junta pertencem à Etapa 2.
  const [qsaDocumental, enquadramento] = await Promise.all([
    montarQsaDocumentalDados(empresaId, !!options.processarDocumentos),
    montarEnquadramentoDados(empresaId, !!options.processarDocumentos, empresa),
  ]);
  const documentacaoSocietaria = await montarValidacaoSocietaria(empresaId, !!options.processarSocietario, {
    empresa,
    enquadramentoDados: enquadramento.dados,
  });
  // A Etapa 1 considera somente CNPJ, razão social, capital social, nomes dos sócios
  // e identificação do Sócio-Administrador. A qualificação textual pode ser usada
  // internamente apenas como evidência para reconhecer o administrador; não é
  // requisito independente nem gera pendência própria nesta fase. CPF, RG, endereço,
  // estado civil e demais dados pessoais pertencem às próximas etapas.
  const qsaPendenciasIdentidade = filtrarPendenciasQsaFase1(qsaDocumental.pendencias);
  // Pendências pessoais/contratuais dos sócios não pertencem à Fase 1.
  // O bloco QSA desta fase usa exclusivamente CNPJ, razão social, capital social,
  // nomes dos sócios e identificação do Sócio-Administrador.
  const qsaPendencias = qsaPendenciasIdentidade;
  const qsaDadosCompletos = {
    ...dadosQsa(empresa, socios),
    analise_documental: qsaDocumental.dados,
    regra_fase_1: {
      campos_conferidos: ['cnpj', 'razao_social', 'capital_social', 'nomes_socios', 'socio_administrador'],
      dados_pessoais_obrigatorios: false,
      descricao: 'CPF, RG, endereço, estado civil, cônjuge, profissão, contato e documentos pessoais pertencem às etapas posteriores e não bloqueiam a Fase 1.',
    },
  };

  const identidadeCnpjBase = await avaliarProntidaoIdentidadeCnpj({
    empresaId,
    empresa,
    docsCartao,
    erroProcessamentoCartao: erroCartaoPersistido,
    cnpjPendencias,
    qsaPendencias: qsaPendenciasIdentidade,
    enquadramentoPendencias: enquadramento.pendencias,
    qsaDados: qsaDocumental.dados,
    enquadramentoDados: enquadramento.dados,
  });
  const fase1Dto = buildCadastralValidationDTO({
    empresa,
    identidade: identidadeCnpjBase,
    enquadramento: enquadramento.dados,
  });
  const fase1Aprovada = identidadeCnpjBase.apto_para_avancar === true && phase1Approved(fase1Dto);
  const identidadeCnpj = {
    ...identidadeCnpjBase,
    status: fase1Aprovada ? 'PHASE_1_APPROVED' as const : 'PHASE_1_PENDING' as const,
    validation: fase1Dto,
  };
  documentacaoSocietaria.habilitada = identidadeCnpj.apto_para_avancar === true;
  documentacaoSocietaria.botao_validar_disponivel = documentacaoSocietaria.habilitada
    && documentacaoSocietaria.atos_dispensados_por_mei !== true
    && documentacaoSocietaria.atos_junta_anexados;

  // A Etapa 2 fica visível/habilitada depois da aprovação da Etapa 1, mas só
  // passa a gerar pendências globais quando o usuário realmente a inicia
  // anexando Contrato/Alteração ou Atos da Junta, ou quando já existe uma
  // validação societária persistida. Isso preserva cadastro, ficha e consultas.
  const etapaSocietariaAtiva = identidadeCnpj.apto_para_avancar === true && documentacaoSocietaria.iniciada === true;
  const pendenciasValidacaoSocietaria: Pendencia[] = etapaSocietariaAtiva
    ? (documentacaoSocietaria.bloqueios || []).map((mensagem: string, index: number) => ({
        codigo: `documentacao_societaria_bloqueio_${index + 1}`,
        mensagem,
        severidade: 'alta',
        origem: 'documentacao_societaria',
        recomendacao: 'Anexar ou corrigir o Contrato/Alteração e os Atos da Junta correspondentes ao mesmo NIRE e data de registro.',
      }))
    : [];
  const pendenciasAtosAtivas: Pendencia[] = etapaSocietariaAtiva && !documentacaoSocietaria.atos_junta_anexados
    ? [{ codigo: 'atos_junta_nao_anexado', mensagem: 'Atos da Junta Comercial ainda não anexados para a Etapa 2.', severidade: 'alta', origem: 'documentos_arquivos' }]
    : [];

  const cnpjBloco = await ensureEmpresaBloco(empresaId, 'cnpj_receita', montarCnpjDados(empresa), cnpjPendencias, 'receita');
  const qsaBloco = await ensureEmpresaBloco(empresaId, 'qsa_quadro_societario', qsaDadosCompletos, qsaPendencias, socios.length ? 'receita' : 'sistema');

  await ensureEmpresaBloco(empresaId, 'atos_junta_comercial', {
    anexado: documentacaoSocietaria.atos_junta_anexados,
    analisado: documentacaoSocietaria.analisado,
    etapa_habilitada: identidadeCnpj.apto_para_avancar === true,
    etapa_iniciada: etapaSocietariaAtiva,
    documento_id: documentacaoSocietaria.atos_arquivo_id,
    nire: documentacaoSocietaria.nire_junta,
    data_registro: documentacaoSocietaria.data_ato_junta,
    cnpj_informativo: documentacaoSocietaria.cnpj_junta_informativo,
  }, pendenciasAtosAtivas, 'sistema');
  await ensureEmpresaBloco(empresaId, 'enquadramento_tributario', enquadramento.dados, enquadramento.pendencias, 'ia');

  const docsContrato = await listarDocumentosEmpresaPorTipos(empresaId, ['contrato_social', 'alteracao_contratual', 'estatuto', 'procuracao']);
  const contratoSocietarioAnexado = docsContrato.some((d) => ['contrato_social', 'alteracao_contratual'].includes(String(d.tipo_documento)));
  const pendenciasContratoAtivas: Pendencia[] = etapaSocietariaAtiva && !contratoSocietarioAnexado
    ? [{ codigo: 'contrato_social_nao_anexado', mensagem: 'Contrato Social ou Alteração Contratual não anexado para a Etapa 2.', severidade: 'alta', origem: 'documentos_arquivos' }]
    : [];
  await ensureEmpresaBloco(
    empresaId,
    'contrato_social_alteracoes',
    { total_documentos: docsContrato.length, documentos_tipos: docsContrato.map((d) => d.tipo_documento), etapa_habilitada: etapaSocietariaAtiva },
    pendenciasContratoAtivas,
    'sistema'
  );

  const pendenciasEtapaAtual = [
    ...cnpjPendencias,
    ...qsaPendencias,
    ...enquadramento.pendencias,
    ...pendenciasValidacaoSocietaria,
  ];
  await ensureEmpresaBloco(empresaId, 'pendencias_documentais', {
    gerado_em: new Date().toISOString(),
    etapa_atual: etapaSocietariaAtiva ? 'documentacao_societaria' : 'identidade_cnpj',
    pendencias_por_bloco: {
      cnpj_receita: cnpjPendencias.length,
      qsa_quadro_societario: qsaPendencias.length,
      enquadramento_tributario: enquadramento.pendencias.length,
      contrato_social_alteracoes: etapaSocietariaAtiva ? pendenciasContratoAtivas.length : 0,
      atos_junta_comercial: etapaSocietariaAtiva ? pendenciasAtosAtivas.length : 0,
      validacao_contrato_junta: etapaSocietariaAtiva ? pendenciasValidacaoSocietaria.length : 0,
    },
  }, pendenciasEtapaAtual, 'sistema');

  for (const codigo of BLOCO_CODIGOS) {
    if (['cnpj_receita', 'qsa_quadro_societario', 'atos_junta_comercial', 'enquadramento_tributario', 'contrato_social_alteracoes', 'pendencias_documentais'].includes(codigo)) continue;
    await ensureEmpresaBloco(empresaId, codigo, {}, [], 'sistema');
  }
  await ensureSocioBlocos(empresaId, socios);
  await vincularDocumentosAutomaticos(empresaId);

  const { rows: blocos } = await pool.query(
    `SELECT deb.id, deb.entidade_tipo, deb.entidade_id, deb.empresa_id, deb.socio_id, deb.status, deb.completo,
            deb.validado, deb.validado_em, deb.dados_estruturados, deb.pendencias, deb.origem,
            deb.criacao_em, deb.atualizacao_em,
            b.codigo, b.nome_amigavel, b.descricao, b.entidade_principal, b.obrigatorio, b.ordem, b.configuracao,
            COALESCE(jsonb_agg(
              jsonb_build_object(
                'id', da.id,
                'tipo_documento', da.tipo_documento,
                'nome_original', da.nome_original,
                'mime_type', da.mime_type,
                'tamanho_bytes', da.tamanho_bytes,
                'status', da.status,
                'validado', da.validado,
                'exige_revisao_humana', da.exige_revisao_humana,
                'resultado_validacao', da.resultado_validacao,
                'criado_em', da.criado_em,
                'view_url', '/api/documentos/' || da.id::text || '/view',
                'download_url', '/api/documentos/' || da.id::text || '/download',
                'papel_documento', dba.papel_documento,
                'principal', dba.principal
              ) ORDER BY da.criado_em DESC
            ) FILTER (WHERE da.id IS NOT NULL), '[]'::jsonb) AS documentos
       FROM public.documentacao_entidade_blocos deb
       JOIN public.documentacao_blocos b ON b.id = deb.bloco_id
       LEFT JOIN public.documentacao_bloco_arquivos dba ON dba.entidade_bloco_id = deb.id AND dba.status <> 'arquivado'
       LEFT JOIN public.documentos_arquivos da ON da.id = dba.arquivo_id
      WHERE deb.entidade_tipo = 'empresa'
        AND deb.entidade_id = $1
        AND b.ativo = true
      GROUP BY deb.id, b.id
      ORDER BY b.ordem ASC`,
    [empresaId]
  );

  const pendencias = blocos.flatMap((b: any) => Array.isArray(b.pendencias) ? b.pendencias.map((p: any) => ({ ...p, bloco_codigo: b.codigo, bloco_nome: b.nome_amigavel })) : []);
  const tiposAnexados = new Set<string>(
    blocos.flatMap((bloco: any) => Array.isArray(bloco.documentos)
      ? bloco.documentos.map((documento: any) => String(documento?.tipo_documento || '')).filter(Boolean)
      : []),
  );
  const mapaDocumentalCredito = gerarMapaDocumentalCredito({
    empresa,
    enquadramento: enquadramento.dados,
    tiposAnexados,
    etapa1Aprovada: identidadeCnpj.apto_para_avancar === true,
    etapa2Aprovada: documentacaoSocietaria.apto_para_avancar === true,
  });

  return {
    empresa: {
      id: empresa.id,
      razao_social: empresa.razao_social,
      nome_fantasia: empresa.nome_fantasia,
      cnpj: empresa.cnpj,
      situacao_cadastral: empresa.situacao_cadastral,
      ultima_sincronizacao_receita: empresa.ultima_sincronizacao_receita || empresa.atualizado_receita_em || null,
    },
    identidade_cnpj: identidadeCnpj,
    documentacao_societaria: documentacaoSocietaria,
    mapa_documental_credito: mapaDocumentalCredito,
    resumo: {
      total_blocos: blocos.length,
      blocos_completos: blocos.filter((b: any) => b.completo).length,
      pendencias_total: pendencias.length,
      pendencias_altas: pendencias.filter((p: any) => p.severidade === 'alta').length,
      pendencias_medias: pendencias.filter((p: any) => p.severidade === 'media').length,
      pendencias_baixas: pendencias.filter((p: any) => p.severidade === 'baixa').length,
      prioridade_imediata: { cnpj_receita: cnpjBloco.status, qsa_quadro_societario: qsaBloco.status },
    },
    blocos,
    pendencias,
  };
}

router.get('/blocos', auth, async (_req: Request, res: Response) => {
  try {
    await ensureBlocosCatalogo();
    const { rows } = await pool.query(`SELECT * FROM public.documentacao_blocos WHERE ativo = true ORDER BY ordem ASC`);
    res.json(rows);
  } catch (err: any) {
    console.error('[GET /api/documentacao/blocos]', err);
    res.status(500).json({ error: 'Erro ao listar blocos documentais' });
  }
});

// Resumo leve (empresa_id, quantidade de documentos anexados, se já tem
// alguma análise iniciada, e a última movimentação real) pra TODAS as
// empresas de uma vez -- usado pela tela de Empresas pra montar o card
// "Empresas recentes" sem precisar de uma chamada por empresa. O limite de
// quantas mostrar, e a ordenação por `ultima_movimentacao`, ficam a cargo do
// front.
//
// Antes esse endpoint só devolvia empresas com pelo menos 1 documento
// anexado E análise iniciada -- isso deixava "Empresas recentes" travada
// sempre nas mesmas 1-2 empresas (as únicas que já tinham análise de IA
// disparada), mesmo com dezenas de outras sendo ativamente trabalhadas.
// Agora devolve TODAS as empresas: o card mostra as mais recentes de
// verdade, independente de já terem análise de IA ou não.
//
// `ultima_movimentacao`: usar só `empresas.updated_at` também deixava a
// lista praticamente congelada, porque esse campo só muda quando o cadastro
// da empresa em si é editado -- abrir a ficha, anexar documento, gerar ou
// assinar contrato e outros eventos do dia a dia não tocavam nele. Por isso
// o campo aqui é o maior timestamp entre: a própria empresa, a última vez
// que a ficha foi aberta (`empresas.visualizado_em` -- ver
// POST /api/empresas/:id/visualizar), os documentos anexados
// (`documentos_arquivos`), o histórico de eventos da empresa
// (`empresa_historico` -- cobre nota, simulação, sincronização, Nexus,
// contrato editado/assinado) e os contratos gerados/atualizados
// (`contratos_gerados`). É esse campo que o front usa para ordenar "mais
// recentes primeiro" -- reflete tanto "visualizada" quanto "atualizada".
router.get('/empresas/documentos-resumo', auth, async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        e.id AS empresa_id,
        (
          SELECT COUNT(DISTINCT dba.arquivo_id)
          FROM public.documentacao_entidade_blocos deb
          JOIN public.documentacao_bloco_arquivos dba
            ON dba.entidade_bloco_id = deb.id AND dba.status <> 'arquivado'
          WHERE deb.entidade_tipo = 'empresa' AND deb.empresa_id = e.id
        ) AS documentos_count,
        EXISTS (
          SELECT 1 FROM public.documentacao_analises_ia dai WHERE dai.empresa_id = e.id
        ) AS analise_iniciada,
        GREATEST(
          COALESCE(e.updated_at, e.created_at),
          e.visualizado_em,
          (SELECT MAX(da.criado_em) FROM public.documentos_arquivos da WHERE da.empresa_id = e.id),
          (SELECT MAX(eh.created_at) FROM public.empresa_historico eh WHERE eh.empresa_id = e.id),
          (SELECT MAX(cg.updated_at) FROM public.contratos_gerados cg WHERE cg.empresa_id = e.id)
        ) AS ultima_movimentacao
      FROM public.empresas e
    `);
    const resumo = rows.map((r: any) => ({
      empresa_id: r.empresa_id,
      documentos_count: Number(r.documentos_count) || 0,
      analise_iniciada: Boolean(r.analise_iniciada),
      ultima_movimentacao: r.ultima_movimentacao || null,
    }));
    res.json(resumo);
  } catch (err: any) {
    console.error('[GET /api/documentacao/empresas/documentos-resumo]', err);
    res.status(500).json({ error: 'Erro ao carregar resumo documental das empresas' });
  }
});


router.get('/empresa/:empresaId/analise-cnpj', auth, async (req: Request, res: Response) => {
  try {
    const analise = await buscarUltimaAnaliseCnpjEmpresa(req.params.empresaId);
    res.json(analise || null);
  } catch (err: any) {
    console.error('[GET /api/documentacao/empresa/:empresaId/analise-cnpj]', err);
    res.status(500).json({ error: 'Erro ao buscar análise CNPJ' });
  }
});

router.post('/empresa/:empresaId/analise-cnpj', auth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).colaborador || (req as any).user;
    const analise = await analisarCnpjReceitaCartaoEmpresa(req.params.empresaId, user?.id || null);
    if (!analise) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    res.json({ message: 'Análise CNPJ gerada com base na Receita Federal e no Cartão CNPJ anexado.', analise });
  } catch (err: any) {
    console.error('[POST /api/documentacao/empresa/:empresaId/analise-cnpj]', err);
    res.status(500).json({ error: err?.message || 'Erro ao gerar análise CNPJ' });
  }
});

// Limpa o histórico de análises de IA (laudo/dossiê CNPJ) de uma empresa, permitindo
// gerar um laudo novo do zero. Não afeta documentos anexados nem dados cadastrais.
router.delete('/empresa/:empresaId/analise-cnpj', auth, async (req: Request, res: Response) => {
  try {
    const removidas = await limparAnalisesCnpjEmpresa(req.params.empresaId);
    res.json({ success: true, removidas, message: removidas > 0 ? `${removidas} análise(s) removida(s). Gere um novo laudo quando quiser.` : 'Nenhuma análise encontrada para esta empresa.' });
  } catch (err: any) {
    console.error('[DELETE /api/documentacao/empresa/:empresaId/analise-cnpj]', err);
    res.status(500).json({ error: 'Erro ao limpar análise de CNPJ' });
  }
});

router.get('/empresa/:empresaId/dossie', auth, async (req: Request, res: Response) => {
  try {
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    res.json(dossie);
  } catch (err: any) {
    console.error('[GET /api/documentacao/empresa/:empresaId/dossie]', err);
    res.status(500).json({ error: 'Erro ao montar dossiê de crédito' });
  }
});

router.get('/empresa/:empresaId/relatorio', auth, async (req: Request, res: Response) => {
  try {
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    res.json(await montarRelatorioDocumental(dossie));
  } catch (err: any) {
    console.error('[GET /api/documentacao/empresa/:empresaId/relatorio]', err);
    res.status(500).json({ error: 'Erro ao montar relatório documental' });
  }
});

router.get('/empresa/:empresaId/relatorio/pdf', auth, async (req: Request, res: Response) => {
  try {
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    const relatorio = await montarRelatorioDocumental(dossie);
    const pdf = await generateBrandedPdfBuffer(gerarHtmlRelatorioDocumental(relatorio), { brand: 'destrava', topMargin: '38mm' });
    const nomeEmpresa = String(relatorio.empresa?.razao_social || relatorio.empresa?.nome_fantasia || 'empresa')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'empresa';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-documental-${nomeEmpresa}.pdf"`);
    res.send(pdf);
  } catch (err: any) {
    console.error('[GET /api/documentacao/empresa/:empresaId/relatorio/pdf]', err);
    res.status(500).json({ error: 'Erro ao gerar relatório documental em PDF' });
  }
});

router.get('/empresa/:empresaId/mapa-documental', auth, async (req: Request, res: Response) => {
  try {
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    res.json(dossie.mapa_documental_credito);
  } catch (err: any) {
    console.error('[GET /api/documentacao/empresa/:empresaId/mapa-documental]', err);
    res.status(500).json({ error: 'Erro ao montar mapa documental de crédito' });
  }
});

router.get('/empresa/:empresaId/qsa', auth, async (req: Request, res: Response) => {
  try {
    const empresa = await getEmpresa(req.params.empresaId);
    if (!empresa) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    const socios = await getSociosEmpresa(req.params.empresaId);
    const dados = dadosQsa(empresa, socios);
    const pendencias = pendenciasQsa(socios, empresa);
    res.json({ empresa_id: req.params.empresaId, dados_estruturados: dados, pendencias });
  } catch (err: any) {
    console.error('[GET /api/documentacao/empresa/:empresaId/qsa]', err);
    res.status(500).json({ error: 'Erro ao carregar QSA da empresa' });
  }
});

router.get('/empresa/:empresaId/pendencias', auth, async (req: Request, res: Response) => {
  try {
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    res.json({ resumo: dossie.resumo, pendencias: dossie.pendencias });
  } catch (err: any) {
    console.error('[GET /api/documentacao/empresa/:empresaId/pendencias]', err);
    res.status(500).json({ error: 'Erro ao calcular pendências do dossiê' });
  }
});

function iniciarAnaliseInicialEmSegundoPlano(empresaId: string, usuarioId: string | null): boolean {
  if (analisesIniciaisEmAndamento.has(empresaId)) return false;
  const trabalho = (async () => {
    try {
      await montarDossieCreditoEmpresa(empresaId, { processarDocumentos: true, usuarioId });
      console.info('[Análise inicial] Processamento concluído:', empresaId);
    } catch (error: any) {
      console.error('[Análise inicial] Processamento em segundo plano falhou:', empresaId, error?.message || error);
    }
  })().finally(() => {
    analisesIniciaisEmAndamento.delete(empresaId);
  });
  analisesIniciaisEmAndamento.set(empresaId, trabalho);
  return true;
}

router.post('/empresa/:empresaId/analise-inicial/iniciar', auth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).colaborador || (req as any).user;
    await ensureBlocosCatalogo();
    const empresa = await getEmpresa(req.params.empresaId);
    if (!empresa) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }

    // O início da análise não depende da montagem completa do dossiê. Assim,
    // uma inconsistência de bloco antigo não impede o processamento dos três
    // documentos que já estão corretamente anexados no Acervo.
    const [cartao, qsa, enquadramento] = await Promise.all([
      listarDocumentosEmpresaPorTipos(req.params.empresaId, ['cartao_cnpj', 'cnpj_cartao']),
      listarDocumentosEmpresaPorTipos(req.params.empresaId, ['qsa']),
      listarDocumentosEmpresaPorTipos(req.params.empresaId, ['enquadramento_tributario_cnpj', 'simples_nacional']),
    ]);
    const ausentes = [
      !cartao.length ? 'Cartão CNPJ' : null,
      !qsa.length ? 'QSA' : null,
      !enquadramento.length ? 'Enquadramento Tributário' : null,
    ].filter(Boolean);
    if (ausentes.length) {
      res.status(422).json({
        error: `Anexe ${ausentes.join(', ')} antes de iniciar a análise documental.`,
        processando: false,
        documentos_ausentes: ausentes,
      });
      return;
    }

    const iniciado = iniciarAnaliseInicialEmSegundoPlano(req.params.empresaId, user?.id || null);
    let dossie: any = null;
    try {
      dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    } catch (error: any) {
      // O job já foi aceito. A resposta não deve voltar 500 somente porque um
      // bloco auxiliar do dossiê ainda precisa ser reparado/sincronizado.
      console.warn('[POST análise inicial/iniciar] Dossiê provisório indisponível:', error?.message || error);
    }

    res.status(iniciado || analisesIniciaisEmAndamento.has(req.params.empresaId) ? 202 : 200).json({
      aceito: true,
      iniciado,
      processando: analisesIniciaisEmAndamento.has(req.params.empresaId),
      dossie,
      status: dossie?.identidade_cnpj?.status || 'PHASE_1_PROCESSING',
      phase1: dossie?.identidade_cnpj?.validation || null,
    });
  } catch (err: any) {
    const erroId = `ADI-${Date.now().toString(36).toUpperCase()}`;
    console.error(`[POST análise inicial/iniciar][${erroId}]`, err);
    res.status(500).json({ error: `Não foi possível iniciar o relatório inicial. Referência: ${erroId}` });
  }
});

router.get('/empresa/:empresaId/analise-inicial/status', auth, async (req: Request, res: Response) => {
  try {
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    const documentos = Object.values(dossie.identidade_cnpj?.documentos_iniciais || {}) as Array<any>;
    res.json({
      processando: analisesIniciaisEmAndamento.has(req.params.empresaId),
      analisados: documentos.filter((item) => item?.analisado).length,
      consistentes: documentos.filter((item) => item?.consistente).length,
      falhas: documentos.filter((item) => item?.status === 'falha_leitura').map((item) => ({ codigo: item?.codigo, documento: item?.nome, mensagem: item?.diagnostico })),
      dossie,
      status: dossie.identidade_cnpj?.status || 'PHASE_1_PENDING',
      phase1: dossie.identidade_cnpj?.validation || null,
    });
  } catch (err: any) {
    console.error('[GET análise inicial/status]', err);
    res.status(500).json({ error: 'Não foi possível consultar o status do relatório inicial.' });
  }
});

async function analisarDocumentosIniciaisHandler(req: Request, res: Response) {
  try {
    const user = (req as any).colaborador || (req as any).user;
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId, {
      processarDocumentos: true,
      usuarioId: user?.id || null,
    });
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }

    const documentos = Object.values(dossie.identidade_cnpj?.documentos_iniciais || {}) as Array<any>;
    const analisados = documentos.filter((item) => item?.analisado).length;
    const consistentes = documentos.filter((item) => item?.consistente).length;
    const falhas = documentos
      .filter((item) => item?.status === 'falha_leitura')
      .map((item) => ({ codigo: item?.codigo, documento: item?.nome, mensagem: item?.diagnostico || 'Falha de leitura não detalhada.' }));
    res.json({
      ...dossie,
      status: dossie.identidade_cnpj?.status || 'PHASE_1_PENDING',
      phase1: dossie.identidade_cnpj?.validation || null,
      processamento_inicial: {
        executado: true,
        analisados,
        consistentes,
        falhas,
        total: 3,
        apto_para_avancar: dossie.identidade_cnpj?.apto_para_avancar === true,
        executado_em: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('[Análise inicial dos documentos]', err);
    res.status(500).json({ error: err?.message || 'Erro ao analisar os três documentos iniciais' });
  }
}

// Nome explícito para a ação principal da Etapa 1. A rota antiga permanece como
// alias para não quebrar integrações, favoritos ou versões anteriores do frontend.
router.post('/empresa/:empresaId/analise-inicial', auth, analisarDocumentosIniciaisHandler);
router.post('/empresa/:empresaId/recalcular', auth, analisarDocumentosIniciaisHandler);


function iniciarAnaliseSocietariaEmSegundoPlano(empresaId: string, usuarioId: string | null): boolean {
  if (analisesSocietariasEmAndamento.has(empresaId)) return false;
  const trabalho = (async () => {
    try {
      await montarDossieCreditoEmpresa(empresaId, { processarSocietario: true, usuarioId });
      console.info('[Análise societária] Processamento concluído:', empresaId);
    } catch (error: any) {
      console.error('[Análise societária] Processamento em segundo plano falhou:', empresaId, error?.message || error);
    }
  })().finally(() => analisesSocietariasEmAndamento.delete(empresaId));
  analisesSocietariasEmAndamento.set(empresaId, trabalho);
  return true;
}

router.post('/empresa/:empresaId/analise-societaria/iniciar', auth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).colaborador || (req as any).user;
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    if (dossie.identidade_cnpj?.apto_para_avancar !== true) {
      res.status(422).json({ error: 'Conclua primeiro a Etapa 1: Cartão CNPJ, QSA e Enquadramento Tributário.', processando: false, dossie });
      return;
    }
    const societaria = dossie.documentacao_societaria;
    if (societaria?.atos_dispensados_por_mei !== true && !societaria?.atos_junta_anexados) {
      res.status(422).json({ error: 'Anexe e valide primeiro os Atos da Junta Comercial.', processando: false, dossie });
      return;
    }
    const iniciado = iniciarAnaliseSocietariaEmSegundoPlano(req.params.empresaId, user?.id || null);
    res.status(iniciado || analisesSocietariasEmAndamento.has(req.params.empresaId) ? 202 : 200).json({
      aceito: true,
      iniciado,
      processando: analisesSocietariasEmAndamento.has(req.params.empresaId),
      dossie,
    });
  } catch (err: any) {
    console.error('[POST análise societária/iniciar]', err);
    res.status(500).json({ error: err?.message || 'Não foi possível iniciar a validação societária.' });
  }
});

router.get('/empresa/:empresaId/analise-societaria/status', auth, async (req: Request, res: Response) => {
  try {
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    res.json({ processando: analisesSocietariasEmAndamento.has(req.params.empresaId), documentacao_societaria: dossie.documentacao_societaria, dossie });
  } catch (err: any) {
    console.error('[GET análise societária/status]', err);
    res.status(500).json({ error: 'Não foi possível consultar a validação societária.' });
  }
});

router.get('/empresa/:empresaId/pipeline/status', auth, async (req: Request, res: Response) => {
  try {
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    const fase1Aprovada = dossie.identidade_cnpj?.apto_para_avancar === true;
    const atosAprovados = dossie.documentacao_societaria?.atos_junta_aprovados === true
      || dossie.documentacao_societaria?.atos_dispensados_por_mei === true;
    const fase3Aprovada = dossie.documentacao_societaria?.apto_para_avancar === true;
    res.json({
      empresa_id: req.params.empresaId,
      fase_1: { aprovada: fase1Aprovada, bloqueada: false },
      fase_2: {
        aprovada: atosAprovados,
        bloqueada: !fase1Aprovada,
        anexado: dossie.documentacao_societaria?.atos_junta_anexados === true,
      },
      fase_3: {
        aprovada: fase3Aprovada,
        bloqueada: !atosAprovados,
        meses_comprovados: dossie.documentacao_societaria?.meses_comprovados ?? 0,
        registros_faltantes: dossie.documentacao_societaria?.registros_faltantes || [],
      },
    });
  } catch (err: any) {
    console.error('[GET pipeline/status]', err);
    res.status(500).json({ error: 'Não foi possível consultar o pipeline documental.' });
  }
});

router.patch('/blocos/:blocoEntidadeId', auth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).colaborador || (req as any).user;
    const allowedStatus = ['nao_iniciado','pendente','em_preenchimento','em_validacao','validado','recusado','desatualizado','inconclusivo'];
    const { dados_estruturados, pendencias, status, validado } = req.body || {};
    const antes = await pool.query(`SELECT * FROM public.documentacao_entidade_blocos WHERE id = $1 LIMIT 1`, [req.params.blocoEntidadeId]);
    if (!antes.rows.length) { res.status(404).json({ error: 'Bloco da entidade não encontrado' }); return; }
    const proximoStatus = allowedStatus.includes(String(status)) ? String(status) : antes.rows[0].status;
    const proximoValidado = typeof validado === 'boolean' ? validado : antes.rows[0].validado;
    const { rows } = await pool.query(
      `UPDATE public.documentacao_entidade_blocos
          SET dados_estruturados = COALESCE($2::jsonb, dados_estruturados),
              pendencias = COALESCE($3::jsonb, pendencias),
              status = $4,
              validado = $5,
              validado_por = CASE WHEN $5 = true THEN $6 ELSE validado_por END,
              validado_em = CASE WHEN $5 = true THEN NOW() ELSE validado_em END,
              atualizado_por = $6
        WHERE id = $1
        RETURNING *`,
      [req.params.blocoEntidadeId, dados_estruturados ? JSON.stringify(dados_estruturados) : null, Array.isArray(pendencias) ? JSON.stringify(pendencias) : null, proximoStatus, proximoValidado, user?.id || null]
    );
    await pool.query(
      `INSERT INTO public.auditoria_documentacao (entidade_bloco_id, acao, antes, depois, usuario_id)
       VALUES ($1, 'atualizar_bloco', $2::jsonb, $3::jsonb, $4)`,
      [req.params.blocoEntidadeId, JSON.stringify(antes.rows[0]), JSON.stringify(rows[0]), user?.id || null]
    ).catch(() => undefined);
    res.json(rows[0]);
  } catch (err: any) {
    console.error('[PATCH /api/documentacao/blocos/:id]', err);
    res.status(500).json({ error: 'Erro ao atualizar bloco documental' });
  }
});

router.post('/blocos/:blocoEntidadeId/anexar-documento', auth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).colaborador || (req as any).user;
    const { arquivo_id, tipo_documento, papel_documento, principal, observacoes } = req.body || {};
    if (!arquivo_id) { res.status(400).json({ error: 'arquivo_id é obrigatório' }); return; }
    const { rows } = await pool.query(
      `INSERT INTO public.documentacao_bloco_arquivos (entidade_bloco_id, arquivo_id, tipo_documento, papel_documento, principal, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (entidade_bloco_id, arquivo_id) DO UPDATE SET
         tipo_documento = EXCLUDED.tipo_documento,
         papel_documento = EXCLUDED.papel_documento,
         principal = EXCLUDED.principal,
         observacoes = EXCLUDED.observacoes,
         status = 'ativo'
       RETURNING *`,
      [req.params.blocoEntidadeId, arquivo_id, tipo_documento || null, papel_documento || tipo_documento || null, !!principal, observacoes || null]
    );
    await pool.query(
      `INSERT INTO public.auditoria_documentacao (entidade_bloco_id, arquivo_id, acao, depois, usuario_id)
       VALUES ($1,$2,'anexar_documento_bloco',$3::jsonb,$4)`,
      [req.params.blocoEntidadeId, arquivo_id, JSON.stringify(rows[0]), user?.id || null]
    ).catch(() => undefined);
    res.status(201).json(rows[0]);
  } catch (err: any) {
    console.error('[POST /api/documentacao/blocos/:id/anexar-documento]', err);
    res.status(500).json({ error: 'Erro ao anexar documento ao bloco' });
  }
});

router.delete('/blocos/:blocoEntidadeId/documentos/:documentoId', auth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).colaborador || (req as any).user;
    const { rows } = await pool.query(
      `UPDATE public.documentacao_bloco_arquivos
          SET status = 'arquivado'
        WHERE entidade_bloco_id = $1 AND arquivo_id = $2
        RETURNING *`,
      [req.params.blocoEntidadeId, req.params.documentoId]
    );
    if (!rows.length) { res.status(404).json({ error: 'Vínculo não encontrado' }); return; }
    await pool.query(
      `INSERT INTO public.auditoria_documentacao (entidade_bloco_id, arquivo_id, acao, depois, usuario_id)
       VALUES ($1,$2,'arquivar_vinculo_documento_bloco',$3::jsonb,$4)`,
      [req.params.blocoEntidadeId, req.params.documentoId, JSON.stringify(rows[0]), user?.id || null]
    ).catch(() => undefined);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[DELETE /api/documentacao/blocos/:id/documentos/:documentoId]', err);
    res.status(500).json({ error: 'Erro ao remover vínculo do documento' });
  }
});

const ANALISE_ESPECIALIZADA_POR_TIPO: Partial<Record<string, { tipo: TipoAnaliseDocumental; promptCodigo: string }>> = {
  qsa: { tipo: 'qsa', promptCodigo: 'qsa_extract' },
  simples_nacional: { tipo: 'simples_nacional', promptCodigo: 'simples_extract' },
  enquadramento_tributario_cnpj: { tipo: 'simples_nacional', promptCodigo: 'simples_extract' },
  atos_junta_comercial: { tipo: 'atos_junta_comercial', promptCodigo: 'atos_junta_extract' },
  faturamento_12_meses: { tipo: 'faturamento_12_meses', promptCodigo: 'faturamento_12m_extract' },
  comprovante_faturamento: { tipo: 'faturamento_12_meses', promptCodigo: 'faturamento_12m_extract' },
  declaracao_faturamento: { tipo: 'faturamento_12_meses', promptCodigo: 'faturamento_12m_extract' },
  comprovante_residencia: { tipo: 'comprovante_residencia', promptCodigo: 'comprovante_residencia_extract' },
};

async function executarAnaliseDocumentalEspecializada(params: {
  extracaoId: string;
  empresaId: string;
  arquivoId: string;
  tipo: TipoAnaliseDocumental;
}) {
  const { extracaoId, empresaId, arquivoId, tipo } = params;
  try {
    await pool.query(
      `UPDATE public.documentos_extracoes_ia
          SET status = 'processando', erros = '[]'::jsonb
        WHERE id = $1`,
      [extracaoId],
    );

    const resultado = tipo === 'qsa'
      ? await analiseDocumentalService.analisarQSA(empresaId, arquivoId)
      : tipo === 'simples_nacional'
        ? await analiseDocumentalService.analisarSimplesNacional(empresaId, arquivoId)
        : tipo === 'atos_junta_comercial'
          ? await analiseDocumentalService.analisarAtosJuntaComercial(empresaId, arquivoId)
          : tipo === 'faturamento_12_meses'
            ? await analiseDocumentalService.analisarFaturamento(empresaId, arquivoId)
            : await analiseDocumentalService.analisarComprovanteResidencia(empresaId, arquivoId);

    await pool.query(
      `UPDATE public.documentos_extracoes_ia
          SET status = $2,
              modelo = $3,
              campos_extraidos = $4::jsonb,
              resultado = $5::jsonb,
              nivel_confianca = $6,
              pendencias = $7::jsonb,
              erros = '[]'::jsonb,
              processado_em = NOW()
        WHERE id = $1`,
      [
        extracaoId,
        resultado.status,
        resultado.modelo_ia,
        JSON.stringify(resultado.dados_extraidos || {}),
        JSON.stringify(resultado),
        resultado.nivel_confianca,
        JSON.stringify(resultado.alertas || []),
      ],
    );
  } catch (error: any) {
    console.warn('[AnaliseDocumentalEspecializada] Falha controlada na análise:', tipo, arquivoId, error?.message || error);
    await pool.query(
      `UPDATE public.documentos_extracoes_ia
          SET status = 'falhou',
              resultado = $2::jsonb,
              erros = $3::jsonb,
              processado_em = NOW()
        WHERE id = $1`,
      [
        extracaoId,
        JSON.stringify({ tipo_analise: tipo, empresa_id: empresaId, arquivo_id: arquivoId, status: 'falhou' }),
        JSON.stringify([{ codigo: 'analise_documental_falhou', mensagem: String(error?.message || 'Falha não identificada') }]),
      ],
    ).catch((updateError: any) => {
      console.warn('[AnaliseDocumentalEspecializada] Não foi possível registrar a falha da extração:', updateError?.message || updateError);
    });
  }
}

async function registrarExtracaoEspecializada(params: {
  arquivoId: string;
  blocoEntidadeId: string | null;
  promptCodigo: string;
  promptVersao?: string;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`documento-ia:${params.arquivoId}:${params.promptCodigo}`]);
    const existente = await client.query(
      `SELECT *
         FROM public.documentos_extracoes_ia
        WHERE arquivo_id = $1 AND prompt_codigo = $2
        ORDER BY atualizado_em DESC, criado_em DESC
        LIMIT 1`,
      [params.arquivoId, params.promptCodigo],
    );

    let extracao: any;
    let deveProcessar = true;
    if (existente.rows[0]) {
      const statusAtual = String(existente.rows[0].status || '');
      const atualizadoEm = new Date(existente.rows[0].atualizado_em || existente.rows[0].criado_em || 0).getTime();
      const versaoEsperada = params.promptVersao || versaoPromptDocumental(params.promptCodigo);
      const versaoAtual = String(existente.rows[0].prompt_versao || '');
      const mesmaVersao = versaoAtual === versaoEsperada;
      const pendenteRecente = statusAtual === 'pendente'
        && Number.isFinite(atualizadoEm)
        && Date.now() - atualizadoEm < 5 * 60 * 1000;
      const emAndamento = mesmaVersao && (statusAtual === 'processando' || pendenteRecente);
      deveProcessar = !emAndamento;

      if (emAndamento) {
        // Não toca no timestamp nem limpa resultado enquanto outra execução está em andamento.
        extracao = existente.rows[0];
      } else {
        const atualizada = await client.query(
          `UPDATE public.documentos_extracoes_ia
              SET entidade_bloco_id = COALESCE($2, entidade_bloco_id),
                  status = 'pendente',
                  prompt_versao = $3,
                  resultado = '{}'::jsonb,
                  campos_extraidos = '{}'::jsonb,
                  pendencias = '[]'::jsonb,
                  erros = '[]'::jsonb,
                  processado_em = NULL
            WHERE id = $1
            RETURNING *`,
          [existente.rows[0].id, params.blocoEntidadeId, params.promptVersao || versaoPromptDocumental(params.promptCodigo)],
        );
        extracao = atualizada.rows[0];
      }
    } else {
      const inserida = await client.query(
        `INSERT INTO public.documentos_extracoes_ia
          (arquivo_id, entidade_bloco_id, status, prompt_codigo, prompt_versao, resultado, campos_extraidos, pendencias, erros)
         VALUES ($1,$2,'pendente',$3,$4,'{}'::jsonb,'{}'::jsonb,'[]'::jsonb,'[]'::jsonb)
         RETURNING *`,
        [params.arquivoId, params.blocoEntidadeId, params.promptCodigo, params.promptVersao || versaoPromptDocumental(params.promptCodigo)],
      );
      extracao = inserida.rows[0];
    }
    await client.query('COMMIT');
    return { extracao, deveProcessar };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

router.post('/ia/documentos/:documentoId/extrair', auth, async (req: Request, res: Response) => {
  try {
    await ensureDocumentacaoSchema(pool);
    const { bloco_entidade_id, prompt_codigo } = req.body || {};
    const arquivoId = req.params.documentoId;
    const documentoResult = await pool.query(
      `SELECT id, empresa_id, entidade_id, entidade_tipo, tipo_documento
         FROM public.documentos_arquivos
        WHERE id = $1
          AND excluido_em IS NULL
          AND COALESCE(status, 'ativo') <> 'excluido'
        LIMIT 1`,
      [arquivoId],
    );
    const documento = documentoResult.rows[0];
    if (!documento) { res.status(404).json({ error: 'Documento não encontrado' }); return; }

    const configuracao = ANALISE_ESPECIALIZADA_POR_TIPO[String(documento.tipo_documento || '')];
    if (!configuracao) {
      res.status(501).json({ error: 'Processamento assíncrono genérico ainda não implementado. Use os endpoints especializados por tipo de documento.' });
      return;
    }

    const empresaId = documento.empresa_id || (documento.entidade_tipo === 'empresa' ? documento.entidade_id : null);
    if (!empresaId) { res.status(422).json({ error: 'Documento especializado sem vínculo válido com uma empresa.' }); return; }

    const { extracao, deveProcessar } = await registrarExtracaoEspecializada({
      arquivoId,
      blocoEntidadeId: bloco_entidade_id || null,
      promptCodigo: configuracao.promptCodigo,
    });

    if (deveProcessar) {
      setImmediate(() => {
        void executarAnaliseDocumentalEspecializada({
          extracaoId: extracao.id,
          empresaId,
          arquivoId,
          tipo: configuracao.tipo,
        });
      });
    }

    res.status(202).json({
      message: deveProcessar ? 'Processamento especializado registrado como pendente.' : 'Documento já está em processamento.',
      extracao,
      tipo_analise: configuracao.tipo,
    });
  } catch (err: any) {
    console.error('[POST /api/documentacao/ia/documentos/:documentoId/extrair]', err);
    res.status(500).json({ error: 'Erro ao registrar processamento do documento' });
  }
});

router.post('/ia/empresa/:empresaId/analisar', auth, async (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Processamento assíncrono genérico ainda não implementado. Use os endpoints especializados por tipo de documento.' });
});

router.get('/ia/analises/:analiseId', auth, async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM public.documentacao_analises_ia WHERE id = $1 LIMIT 1`, [req.params.analiseId]);
    if (!rows.length) { res.status(404).json({ error: 'Análise não encontrada' }); return; }
    res.json(rows[0]);
  } catch (err: any) {
    console.error('[GET /api/documentacao/ia/analises/:analiseId]', err);
    res.status(500).json({ error: 'Erro ao buscar parecer' });
  }
});

router.get('/ia/empresa/:empresaId/historico', auth, async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM public.documentacao_analises_ia WHERE empresa_id = $1 ORDER BY criado_em DESC LIMIT 50`, [req.params.empresaId]);
    res.json(rows);
  } catch (err: any) {
    console.error('[GET /api/documentacao/ia/empresa/:empresaId/historico]', err);
    res.status(500).json({ error: 'Erro ao listar histórico de pareceres' });
  }
});

export default router;

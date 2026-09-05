import { isSituacaoAtiva } from '../utils/situacaoCadastral';
import { normalizeText, onlyDigits } from '../utils/helpers';
import { Router, Request, Response } from 'express';
import pkg from 'pg';
import { auth } from '../middleware/auth';
import { analisarCnpjReceitaCartaoEmpresa, buscarUltimaAnaliseCnpjEmpresa, limparAnalisesCnpjEmpresa } from '../services/analiseCnpjReceitaCartao';
import { deveReprocessarCartaoCnpjAutomaticamente, cooldownRetentativaAutomaticaMinutos } from '../utils/retentativaAutomaticaAnaliseDocumental';
import { analiseDocumentalService, type AnaliseDocumentalResult, type TipoAnaliseDocumental } from '../services/analiseDocumentalEspecializada';
import { calcularCadeiaComprovacaoSocietaria } from '../services/cadeiaSocietariaService';
import { InsufficientHistoricalPeriodException, validateTwelveMonthContractHistory } from '../services/documentPipelineService';
import { buildCadastralValidationDTO, phase1Approved } from '../services/phase1AnalysisService';
import { ensureDocumentacaoSchema } from '../services/documentacaoSchema';
import { gerarMapaDocumentalCredito, identificarRegimeCredito, montarHistoricoRegimeTributarioParaMapa, ROTULO_REGIME_CREDITO } from '../services/mapaDocumentalCreditoService';
import { DOCUMENT_TYPE_CATALOG, canonicalizeDocumentType, documentAnalysisConfig, documentLabel } from '../../shared/documentTypes';
import { resolverRegrasDocumentais, type RegraResolvida } from '../services/regrasDocumentaisCredito';
import { upsertSocioEmpresa } from './socios_documentos';
import { generateBrandedPdfBuffer } from '../services/brandedPdfLayout';
import {
  construirSecoesAnaliseDocumento,
  estadoVisualDocumento,
  rotuloEstadoDocumento,
} from '../../shared/documentalPresentation';
import {
  CLASSIFIER_VERSION,
  EXTRACTOR_VERSION,
  RULE_VERSION,
  SCHEMA_VERSION,
  PROMPT_VERSION,
  calcularAssinaturaAnalise,
  decidirVersaoLaudo,
  laudoConcluidoPodePermanecerAtivo,
  versaoPromptDocumental,
  type AnalysisLifecycleStatus,
} from '../services/documentalLaudoVersioning';
import { obterLinhaDoTempoRegime, obterRegimeVigenteEm } from '../services/regimeTributarioTemporalService';
import { obterFaturamentoRolling12Meses, type CompetenciaMensal } from '../services/faturamentoRolling12MesesService';
import { obterCoberturaPorEmpresa } from '../services/coberturaEvidenciaBureauService';

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

// CORREÇÃO (2026-08-31, bug real reportado em produção -- "Enquadramento
// Tributário" aparecia duas vezes, com os mesmos dados, no relatório
// consolidado): o catálogo documental (`shared/documentTypes.ts`) e a regra
// de vínculo automático a blocos (`vincularDocumentosAutomaticos`, mais
// abaixo) tratam `enquadramento_tributario_cnpj` E `simples_nacional` como o
// MESMO documento/família ("bloco: enquadramento_tributario"; mesma análise
// especializada, `simples_extract`) -- uma empresa pode ter o arquivo
// catalogado com qualquer um dos dois `tipo_documento`. Mas esta função só
// reconhecia a variante com ESPAÇO ("simples nacional"); o valor real
// gravado no banco é `simples_nacional`, com underscore -- então um arquivo
// com esse tipo nunca batia no regex, caía na chave genérica
// `${codigo}:${nome}` (diferente da chave 'enquadramento_tributario' do
// outro tipo) e sobrevivia à deduplicação como um SEGUNDO card, mostrando a
// mesma leitura (mesmo motor de análise) do card já existente. Corrigido
// aceitando os dois separadores; reproduzido e coberto por teste dedicado
// (ver tests/relatorioDocumentalEnquadramentoTributarioDuplicado.test.ts).
function chaveDocumentoRelatorio(documento: any): string {
  const codigoOriginal = normalizeText(String(documento?.codigo || documento?.tipo_documento || 'documento'));
  const nome = normalizeText(String(documento?.nome || documento?.nome_original || documento?.nome_arquivo || 'documento'));
  const tipo = normalizeText(String(documento?.tipo_documento || ''));
  const texto = `${codigoOriginal} ${tipo} ${nome}`;
  const inicial = /cartao|cnpj|qsa|quadro societ|enquadramento|simples[ _]nacional|optante/.test(texto);
  if (/atos junta|junta comercial/.test(texto)) return 'atos_junta_comercial';
  if (inicial && /qsa|quadro societ/.test(texto)) return 'qsa';
  if (inicial && /enquadramento|simples[ _]nacional|optante/.test(texto)) return 'enquadramento_tributario';
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

// A confiança da leitura é calculada em fração (0 a 1) e vinha para a tela com
// o resíduo do ponto flutuante ("0.8999999999999999"). Num relatório de
// crédito isso passa impressão de dado sujo -- vira percentual inteiro.
function formatarConfiancaRelatorio(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const numero = Number(value);
  if (!Number.isFinite(numero)) return null;
  const fracao = numero > 1 ? numero / 100 : numero;
  return `${Math.round(Math.max(0, Math.min(1, fracao)) * 100)}%`;
}

// CORREÇÃO (2026-08-31, pedido explícito do usuário -- print real mostrando
// "Fonte da leitura: local:tesseract-v1-parcial" na tela, um código interno do
// motor de extração, não uma informação que ajuda o usuário a decidir nada):
// o valor bruto vem de `analise?.modelo_ia`/`fonte_extracao` internos (ver
// `ultimoModeloUsado`/`ultimaFonteExtracao` em analiseDocumentalEspecializada.ts)
// e nunca foi pensado para aparecer na tela -- é um detalhe de implementação
// (qual motor OCR/IA leu o arquivo). Esta função traduz os códigos conhecidos
// para uma frase curta em português; um valor desconhecido continua sendo
// mostrado (nunca esconde a informação), só que sem o prefixo/sufixo técnico
// quando reconhecível.
function formatarFonteLeituraAmigavel(valorBruto: unknown): string | null {
  const valor = valorResultadoRelatorio(valorBruto);
  if (!valor) return null;
  const normalizado = valor.toLowerCase();
  if (/^local:.*-parcial$/.test(normalizado)) return 'Leitura automática local (parcial) — recomenda-se revisão';
  if (normalizado.startsWith('local:') || normalizado === 'local_deterministica' || normalizado.includes('tesseract') || normalizado.includes('ocr_local')) {
    return 'Leitura automática local (OCR)';
  }
  if (normalizado.includes('gemini') || normalizado === 'gemini_document_ocr') return 'Leitura automática por IA';
  if (normalizado === 'documento_comprobatorio_regime') return 'Documento anexado pelo usuário';
  if (normalizado === 'consulta_cnpj_receita') return 'Consulta à Receita Federal';
  return valor;
}

function valorResultadoRelatorio(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => typeof item === 'object' ? item.nome || item.label || item.valor || null : String(item)).filter(Boolean).join(', ') || null;
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'object') return null;
  return String(value);
}

// Exportada (2026-08-31) apenas para permitir teste unitário direto e
// determinístico da conclusão/propagação de identidade documental -- ver
// tests/documentacaoConclusaoIncompatibilidade.test.ts. A função continua
// sendo uma função pura (sem acesso a banco), então exportá-la não expõe
// nenhum estado nem muda seu comportamento para os chamadores existentes.
export function montarResultadoDetalhadoRelatorio(documento: any, analiseEspecializada: any = null) {
  const laudo = documento?.resultado_validacao?.analise_regra_documental;
  const laudoErro = documento?.resultado_validacao?.analise_regra_documental_erro;
  // CORREÇÃO (31/08/2026, pedido explícito do usuário -- card mostrando ao
  // mesmo tempo "Resultado da análise: Aguardando análise" / "ainda não
  // existe laudo concluído" E "Amostra objetiva dos dados lidos > Status da
  // leitura: validado", uma contradição): `documento?.status` é um campo
  // administrativo genérico da linha do arquivo (inclui o "✓ Validar" manual
  // do Acervo Documental, um sinalizador de um analista humano, não uma
  // confirmação de que a leitura automática rodou). Sem nenhum laudo real
  // (nem `laudo` nem `analiseEspecializada`), esse campo não pode ser exibido
  // sob o rótulo "Status da leitura" -- ele nunca representou o resultado de
  // uma leitura. Sem esta checagem, um documento marcado manualmente como
  // validado sem nunca ter sido lido pela IA aparecia, neste campo, como se a
  // leitura tivesse confirmado "validado".
  const temLeituraAutomatica = Boolean(laudo) || Boolean(analiseEspecializada);
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

  // Cada bloco abaixo pertence a um tipo de documento. Antes todos eram
  // aplicados a qualquer documento, e por isso o comprovante de enquadramento
  // aparecia com o CNPJ rotulado como "CNPJ do QSA". O rótulo tem que
  // corresponder ao documento que está sendo lido -- num laudo de crédito, um
  // campo com o nome errado é pior do que campo nenhum.
  const tipoDoDocumento = String(documento?.tipo_documento || documento?.codigo || documento?.tipo_leitura || '').toLowerCase();
  const ehQsa = tipoDoDocumento.includes('qsa') || documento?.qsa_leitura === true || sociosLidos.length > 0;
  const ehSocietario = ehQsa
    || /contrato_social|alteracao_contratual|atos_junta|junta_comercial/.test(tipoDoDocumento)
    || Boolean(contratoDados?.cnpj || contratoDados?.numero_arquivamento || documento?.nire || dados?.nire);
  // Mesmo defeito do QSA/societário, mas no Enquadramento Tributário/Simples
  // Nacional: o card não tinha NENHUM campo próprio, então mesmo quando a
  // leitura (local ou IA) já identificava situação no Simples/regime/CNPJ em
  // `dados_extraidos`, o relatório mostrava só metadados de OCR (fonte,
  // confiança, status) -- nunca a resposta em si. `situacao_simples` sempre
  // vem preenchido pela leitura (mesmo "Não Optante"); `regime_tributario` só
  // vem preenchido quando o documento afirma um regime (ver
  // detectarRegimeTributarioDeclarado/normalizarDadosSimples) -- não exibir o
  // campo quando nulo é o comportamento correto, não um bug.
  const ehEnquadramentoOuSimples = /simples_nacional|enquadramento_tributario|^darf$/.test(tipoDoDocumento)
    || Boolean(dados?.situacao_simples || dados?.regime_tributario || dados?.opcao_mei !== undefined && dados?.opcao_mei !== null);

  if (ehQsa) {
    adicionarCampo('CNPJ do QSA', dados?.cnpj);
    adicionarCampo('Razão social do QSA', dados?.razao_social);
    adicionarCampo('Capital social do QSA', dados?.capital_social);
    adicionarCampo('Sócios lidos no QSA', sociosLidos.length || null);
  }
  if (ehSocietario) {
    adicionarCampo('NIRE', documento?.nire || dados?.nire || dados?.contrato?.nire);
    adicionarCampo('Data de registro', documento?.data_registro || dados?.data_registro || dados?.contrato?.data_registro);
    adicionarCampo('Tipo do ato', documento?.tipo_ato || dados?.tipo_ato || dados?.contrato?.tipo_ato);
    adicionarCampo('Sócios identificados', sociosLidos.length || (Array.isArray(documento?.socios) ? documento.socios.length : null));
  }
  if (ehEnquadramentoOuSimples) {
    adicionarCampo('CNPJ do documento fiscal', dados?.cnpj);
    adicionarCampo('Situação no Simples Nacional', dados?.situacao_simples);
    adicionarCampo('Regime tributário declarado no documento', dados?.regime_tributario);
    adicionarCampo('Optante MEI/SIMEI', dados?.opcao_mei);
    adicionarCampo('Data de opção pelo Simples', dados?.data_opcao_simples);
    adicionarCampo('Data de exclusão do Simples', dados?.data_exclusao_simples);
    adicionarCampo('Motivo da exclusão do Simples', dados?.motivo_exclusao);
  }
  adicionarCampo('Fonte da leitura', formatarFonteLeituraAmigavel(documento?.fonte || documento?.fonte_extracao || documento?.origem || analise?.modelo_ia));
  adicionarCampo('Confiança da leitura', formatarConfiancaRelatorio(documento?.confianca ?? documento?.nivel_confianca ?? analise?.nivel_confianca));
  adicionarCampo('Status da leitura', documento?.status_leitura || analise?.status || (temLeituraAutomatica ? documento?.status : null));
  if (dados?.periodo_analisado) adicionarCampo('Período analisado', dados.periodo_analisado);
  if (dados?.titular_identificado) adicionarCampo('Titular identificado', dados.titular_identificado);
  if (ehSocietario) {
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
  }

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
  // CORREÇÃO (2026-08-31, "não é mais aceitável que um documento fique no
  // local de outro documento... como um documento validado, como lido"): até
  // aqui, um documento incompatível com o slot (ex.: PGDAS-D no lugar do ECF)
  // recebia a mesma conclusão genérica de "necessidade de revisão" que
  // qualquer outro motivo de revisão (baixa confiança, campo ambíguo, etc.) --
  // nunca dizia que o arquivo NÃO é o documento esperado nem que não foi
  // validado para este campo. `dados` já traz `documento_compativel` e
  // `identidade_status` (calculados em `normalizarDocumentoCatalogado`,
  // server/services/analiseDocumentalEspecializada.ts); agora a conclusão
  // deste campo passa a dizer isso explicitamente, sem ambiguidade.
  //
  // ATUALIZAÇÃO (2026-08-31, "não é pra ele ler o que está nesse documento do
  // simples, pra ele ler só se for o s f"): a conclusão agora nomeia o
  // documento esperado (ex.: "Anexe o documento correto: ECF") -- e esta é a
  // ÚNICA informação exibida para um documento incompatível: nenhum dado lido
  // do arquivo errado aparece na tela (ver o corte em
  // `construirSecoesAnaliseDocumento`, shared/documentalPresentation.ts, que
  // usa exatamente esta mesma condição de incompatibilidade).
  const identidadeIncompativel = dados?.documento_compativel === false || dados?.identidade_status === 'INCOMPATIVEL';
  const resultado = documento?.analisado === false || !temEvidenciaDeAnalise
    ? 'Aguardando leitura documental.'
    : identidadeIncompativel
      ? `Documento inválido para este campo. Anexe o documento correto: ${documentLabel(documento?.tipo_documento)}.`
      : documento?.consistente === true
        ? 'Leitura concluída; documento considerado consistente.'
        : 'Leitura concluída com observações ou necessidade de revisão.';

  return {
    conclusao: resultado,
    // Propaga a identidade/compatibilidade calculada pelo serviço de análise
    // para a camada visual (`estadoVisualDocumento`, shared/documentalPresentation.ts),
    // que já sabia checar estes campos mas nunca os recebia daqui -- por isso
    // o selo ficava em "Revisão necessária" (genérico) em vez de "Documento
    // incompatível" mesmo com o laudo já sinalizando a incompatibilidade.
    dados_extraidos: dados,
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

// Exportada (2026-08-31) apenas para permitir teste unitário direto do
// diagnóstico de falha real vs. "ainda não processado" -- ver
// tests/acervoDocumentalFalhaRealVsAguardando.test.ts. Continua sendo
// chamada internamente do mesmo jeito; exportar não muda seu comportamento
// para os chamadores existentes.
export async function enriquecerDocumentosAcervoComAnalise(blocos: any[]): Promise<any[]> {
  const documentos = blocos.flatMap((bloco: any) => (Array.isArray(bloco.documentos) ? bloco.documentos : []).map((documento: any) => ({
    ...documento,
    bloco_codigo: bloco.codigo,
    bloco_nome: bloco.nome_amigavel,
    bloco_status: bloco.status,
  })));
  const resultados = await Promise.all(documentos.map(async (documento: any) => {
    const tipo = String(documento?.tipo_documento || '');
    const configuracao = ANALISE_ESPECIALIZADA_POR_TIPO[tipo];
    let analiseEspecializada: any = null;
    if (configuracao && documento?.id) {
      try {
        analiseEspecializada = await buscarAnaliseEspecializadaPersistida(String(documento.id), configuracao.promptCodigo);
      } catch (error) {
        console.warn('[Acervo] Falha ao buscar análise persistida:', documento.id, configuracao.promptCodigo, (error as any)?.message || error);
      }
    }
    const laudo = documento?.resultado_validacao?.analise_regra_documental;
    const laudoErro = documento?.resultado_validacao?.analise_regra_documental_erro;
    const conteudoValido = arquivoDocumentoTemConteudo(documento);
    const lifecycleStatus = String(analiseEspecializada?.analysis_status || '').toUpperCase();
    const laudoStale = ['STALE', 'SUPERSEDED', 'REANALISE_NECESSARIA'].includes(lifecycleStatus)
      || analiseEspecializada?.reprocessamento_necessario === true;
    const possuiLaudo = !laudoStale && (Boolean(laudo) || Boolean(laudoErro) || Boolean(analiseEspecializada));
    const analisado = conteudoValido && possuiLaudo;
    const especializadaConsistente = !laudoStale && (Boolean(analiseEspecializada?.consistente)
      || analiseEspecializada?.status === 'concluido');
    const consistente = analiseEspecializada
      ? especializadaConsistente
      : !laudoStale && Boolean(laudo) && documento?.exige_revisao_humana !== true && documento?.consistente !== false;
    const resultadoAnalise = montarResultadoDetalhadoRelatorio({
      ...documento,
      analisado,
      consistente,
    }, analiseEspecializada);
    if (analiseEspecializada && !laudoStale) {
      // Rodada 36: o Acervo também precisa carregar o estado de ciclo de vida
      // do laudo que buscarAnaliseEspecializadaPersistida já decidiu manter
      // ATIVO durante uma atualização de motor. Sem esta propagação, a
      // validação permanecia correta no backend, mas o DTO visual perdia
      // analysis_status/atualizacao_em_segundo_plano_pendente e podia voltar a
      // parecer "aguardando" em consumidores que leem resultado_analise.
      (resultadoAnalise as any).analysis_status = analiseEspecializada.analysis_status || 'ATIVO';
      (resultadoAnalise as any).satisfaz_requisito = analiseEspecializada.satisfaz_requisito;
      (resultadoAnalise as any).atualizacao_em_segundo_plano_pendente = analiseEspecializada.atualizacao_em_segundo_plano_pendente === true;
      (resultadoAnalise as any).analysis_signature = analiseEspecializada.analysis_signature || null;
      (resultadoAnalise as any).classifier_version = analiseEspecializada.classifier_version || null;
      (resultadoAnalise as any).extractor_version = analiseEspecializada.extractor_version || null;
      (resultadoAnalise as any).rule_version = analiseEspecializada.rule_version || null;
      (resultadoAnalise as any).schema_version = analiseEspecializada.schema_version || null;
    }
    if (laudoStale) {
      (resultadoAnalise as any).status = 'REANALISE_NECESSARIA';
      // CORREÇÃO (2026-09-05, diagnóstico do estado "Aguardando análise"/
      // "Documento incompatível" mostrado incorretamente para laudos apenas
      // desatualizados após a correção do GPT): `estadoVisualDocumento`
      // (shared/documentalPresentation.ts) é a ÚNICA fonte de verdade para o
      // selo visual e lê `resultado.analysis_status` -- não `resultado.status`
      // -- para decidir o estado "reanalisar" (ver seu próprio teste em
      // tests/documentalPresentation.test.ts: `analysis_status:
      // "REANALISE_NECESSARIA"` -> `"reanalisar"`). Sem popular este campo
      // aqui, o guard de "reanalisar" (que tem que rodar ANTES de qualquer
      // checagem de incompatibilidade, para nunca confundir "laudo antigo,
      // precisa reler" com "documento errado para este campo") nunca disparava
      // para nenhum laudo marcado como stale/superseded neste endpoint (o que
      // alimenta o Acervo Documental) -- o documento caía em "aguardando" (se
      // os dados antigos não tinham sinal de incompatibilidade) ou, pior, em
      // "incompativel" (se os dados antigos do laudo desatualizado carregavam
      // tipo/identidade que não batem mais com o catálogo atual), mostrando o
      // selo enganoso "Documento incompatível" para um documento que só
      // precisa ser relido -- exatamente o sintoma relatado pelo usuário para
      // QSA, Enquadramento Tributário e CCMEI de uma empresa MEI logo após a
      // correção do GPT (que renumerou/expandiu as versões de classificação e
      // por isso marcou laudos antigos como stale em todo o sistema, por
      // design -- ver CLASSIFIER_VERSION/RULE_VERSION em
      // documentalLaudoVersioning.ts). Regra geral, sem exceção por tipo de
      // documento/empresa/regime: qualquer laudo marcado stale/superseded por
      // este mecanismo passa a ser identificado corretamente como
      // "Reanálise necessária" pelo selo visual, em vez de cair em outro
      // estado por acidente de nome de campo.
      (resultadoAnalise as any).analysis_status = lifecycleStatus || 'REANALISE_NECESSARIA';
      resultadoAnalise.conclusao = 'Laudo antigo ou superseded; reanálise necessária antes de considerar o documento válido.';
      resultadoAnalise.diagnostico = analiseEspecializada?.mensagem_status || 'A versão do motor mudou ou a assinatura do arquivo não confere. O laudo histórico foi preservado e não satisfaz o requisito atual.';
    } else if (!analisado) {
      // CORREÇÃO (31/08/2026, pedido explícito do usuário -- "quero saber o
      // motivo por que que está dando pendência"): antes desta checagem, um
      // documento cuja análise automática JÁ TINHA FALHADO (status 'falhou'
      // em documentos_extracoes_ia, ver executarAnaliseDocumentalEspecializada)
      // ficava indistinguível de um documento que simplesmente ainda não
      // tinha sido processado -- os dois mostravam a mesma mensagem genérica
      // "aguardando análise documental". O motivo real da falha já era
      // persistido (e já era usado em outras telas via
      // buscarFalhaAnaliseEspecializada); só faltava consultá-lo aqui também.
      let falhaPersistida: { mensagem: string; processado_em: string | null } | null = null;
      if (configuracao && documento?.id) {
        try {
          falhaPersistida = await buscarFalhaAnaliseEspecializada(String(documento.id), configuracao.promptCodigo);
        } catch (error) {
          console.warn('[Acervo] Falha ao buscar motivo de falha da análise:', documento.id, configuracao.promptCodigo, (error as any)?.message || error);
        }
      }
      if (falhaPersistida) {
        // CORREÇÃO (2026-09-02, Rodada 18, pedido explícito do usuário -- print
        // anotado "não precisa desse tanto de texto, deixar menos poluido e sem
        // repetição" apontando para o card de falha do Cartão CNPJ): antes desta
        // correção, `conclusao` recebia um texto genérico ("Falha na análise
        // automática deste documento.") e `diagnostico` recebia o motivo real e
        // específico (via mensagemSeguraFalhaLeitura) -- como os dois textos são
        // sempre diferentes, `construirSecoesAnaliseDocumento` (shared/documentalPresentation.ts)
        // renderizava DUAS caixas de texto para a mesma falha, uma repetindo a
        // outra sem acrescentar informação. Agora os dois campos recebem a MESMA
        // mensagem (a específica), então só uma caixa aparece -- vale para
        // qualquer tipo de documento que caia neste ramo, não é específico de
        // Cartão CNPJ.
        const mensagem = mensagemSeguraFalhaLeitura(documentLabel(tipo) || 'Documento', falhaPersistida.mensagem);
        resultadoAnalise.conclusao = mensagem;
        resultadoAnalise.diagnostico = mensagem;
      } else {
        resultadoAnalise.conclusao = 'Anexo recebido, aguardando análise documental.';
        if (!resultadoAnalise.diagnostico) {
          resultadoAnalise.diagnostico = 'O arquivo foi anexado, mas ainda não existe laudo concluído para este documento.';
        }
      }
    }
    return {
      ...documento,
      analisado,
      consistente,
      laudo_stale: laudoStale,
      resultado_analise: resultadoAnalise,
    };
  }));
  const porId = new Map(resultados.filter((documento: any) => documento?.id).map((documento: any) => [String(documento.id), documento]));
  return blocos.map((bloco: any) => ({
    ...bloco,
    documentos: (Array.isArray(bloco.documentos) ? bloco.documentos : []).map((documento: any) => porId.get(String(documento?.id)) || documento),
  }));
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
    const dadosEspecializados = analiseEspecializada?.dados_extraidos && typeof analiseEspecializada.dados_extraidos === 'object'
      ? analiseEspecializada.dados_extraidos
      : {};
    const classificacaoEspecializada = analiseEspecializada?.classificacao || dadosEspecializados?.classificacao || {};
    const classificacaoNegativa = analiseEspecializada?.documento_compativel === false
      || dadosEspecializados?.documento_compativel === false
      || analiseEspecializada?.satisfaz_requisito === false
      || dadosEspecializados?.satisfaz_requisito === false
      || analiseEspecializada?.identidade_status === 'INCOMPATIVEL'
      || dadosEspecializados?.identidade_status === 'INCOMPATIVEL'
      || classificacaoEspecializada?.identidade_status === 'INCOMPATIVEL';
    const analiseEspecializadaIndicaConsistente = !classificacaoNegativa
      && (Boolean(analiseEspecializada?.consistente) || analiseEspecializada?.status === 'concluido');
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
  const secoesAnaliseHtml = (resultado: any, documento: any) => {
    const estado = estadoVisualDocumento(resultado, documento);
    return construirSecoesAnaliseDocumento(resultado, documento).filter((secao: any) => !secao.colapsavel).map((secao: any) => {
    const classe = secao.id === 'resultado'
      ? estado === 'aprovado' ? 'result' : estado === 'incompativel' || estado === 'reanalisar' ? 'alerts' : 'notes'
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
  };
  const analisadosHtml = analisados.length ? analisados.map((documento: any) => {
    const resultado = documento.resultado_analise || {};
    const estado = estadoVisualDocumento(resultado, documento);
    const aprovado = estado === 'aprovado';
    const bloqueado = estado === 'incompativel' || estado === 'reanalisar';
    const classeDocumento = aprovado ? 'analyzed' : bloqueado ? 'blocked' : 'needs-review';
    const classePill = aprovado ? 'green' : bloqueado ? 'red' : 'orange';
    return `<article class="doc ${classeDocumento}"><div class="doc-head"><div><strong>${escapeHtmlRelatorio(documento.nome)}</strong><small>${escapeHtmlRelatorio(documento.bloco)}${documento.criado_em ? ` · ${escapeHtmlRelatorio(dataRelatorio(documento.criado_em))}` : ''}</small></div><span class="pill ${classePill}">${escapeHtmlRelatorio(rotuloEstadoDocumento(estado))}</span></div>${secoesAnaliseHtml(resultado, documento)}</article>`;
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
  @page { size: A4; margin: 38mm 22mm 28mm; } * { box-sizing: border-box; } body { margin: 0; font-family: Arial, sans-serif; color: #172033; font-size: 9pt; line-height: 1.4; } h1 { color: #123b78; font-size: 20pt; margin: 0 0 4px; } h2 { color: #123b78; font-size: 13pt; margin: 22px 0 9px; border-bottom: 1px solid #d9e2ef; padding-bottom: 5px; page-break-after: avoid; } p { margin: 5px 0; } .subtitle { color: #64748b; font-size: 9pt; } .identity { background: #f1f7ff; border: 1px solid #cbdcf4; border-radius: 8px; padding: 12px; margin: 15px 0; } .meta { display: grid; grid-template-columns: 1.6fr 1fr 1fr; gap: 10px; margin-top: 8px; } .meta span, .card span, .field span { display: block; color: #64748b; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .04em; } .meta strong { display: block; margin-top: 2px; } .cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px; margin: 12px 0 15px; } .card { border: 1px solid #d9e2ef; border-radius: 7px; padding: 8px; min-height: 53px; } .card strong { display: block; margin-top: 4px; font-size: 9.2pt; color: #123b78; } .legend { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin: 10px 0 15px; } .legend div { border: 1px solid #d9e2ef; border-radius: 7px; padding: 8px; font-size: 8pt; } .green { color: #047857; } .orange { color: #c2410c; } .amber { color: #b45309; } table { width: 100%; border-collapse: collapse; margin: 5px 0 12px; page-break-inside: auto; } th { background: #123b78; color: #fff; text-align: left; font-size: 7.8pt; padding: 6px; } td { border-bottom: 1px solid #e5eaf1; vertical-align: top; padding: 6px; font-size: 8pt; } tr:nth-child(even) td { background: #f8fafc; } small { display: block; color: #64748b; font-size: 7.5pt; margin-top: 3px; } .doc, .stage { border: 1px solid #d9e2ef; border-radius: 8px; padding: 9px; margin: 7px 0; page-break-inside: auto; } .doc.compact { padding: 6px 10px; margin: 4px 0; page-break-inside: avoid; } .analyzed { border-left: 4px solid #10b981; } .needs-review { border-left: 4px solid #f59e0b; } .blocked { border-left: 4px solid #dc2626; } .waiting { border-left: 4px solid #f97316; } .missing { border-left: 4px solid #f59e0b; } .doc-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; } .doc-head > div { flex: 1; } .pill { display: inline-block; border-radius: 999px; padding: 3px 7px; font-size: 7.5pt; font-weight: bold; white-space: nowrap; } .pill.green { background: #d1fae5; } .pill.orange { background: #ffedd5; } .pill.red { background: #fee2e2; color: #991b1b; } .pill.amber { background: #fef3c7; } .pill.purple { background: #ede9fe; color: #6d28d9; } .result, .positive, .notes, .alerts, .facts { margin-top: 7px; padding: 7px; border-radius: 6px; } .result { background: #ecfdf5; border: 1px solid #bbf7d0; } .positive { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; } .notes { background: #f8fafc; border: 1px solid #e2e8f0; } .facts { background: #eff6ff; border: 1px solid #bfdbfe; } .alerts { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; } .fields { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 7px; } .field { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 5px; padding: 6px; } .field strong { display: block; margin-top: 2px; overflow-wrap: anywhere; } ul { margin: 5px 0 3px; padding-left: 17px; } li { margin: 3px 0; } .success { background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; padding: 10px; border-radius: 7px; } .empty { color: #64748b; font-style: italic; padding: 4px 0; } .footer-note { margin-top: 18px; color: #64748b; font-size: 7.5pt; border-top: 1px solid #e5eaf1; padding-top: 8px; }
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

// CORRE\u00c7\u00c3O (Rodada 29, 02/09/2026, auditoria pr\u00f3pria de consist\u00eancia entre
// tipos de empresa, pedido expl\u00edcito do usu\u00e1rio: garantir que o sistema
// "saiba entender e separar e analisar... corretamente" cada tipo de
// empresa): esta fun\u00e7\u00e3o decidia se uma empresa \u00e9 Empres\u00e1rio Individual/MEI
// (para inferir um "s\u00f3cio" \u00fanico a partir do respons\u00e1vel/nome da empresa,
// s\u00f3 usado quando nenhum s\u00f3cio real foi encontrado -- ver `montarProprietarioInferido`
// e `sociosCadastro.length === 0 && sociosReceitaMapeados.length === 0` mais
// abaixo) varrendo um texto que inclu\u00eda `razao_social`/`nome_fantasia` -- ou
// seja, o NOME DA EMPRESA, texto livre escolhido pelo pr\u00f3prio empreendedor,
// n\u00e3o um campo estruturado da Receita. Um `.includes('individual')` solto
// tamb\u00e9m casava qualquer substring (ex.: uma raz\u00e3o social contendo a palavra
// "individualizado"), n\u00e3o s\u00f3 a frase "empres\u00e1rio individual". Isso \u00e9
// exatamente o tipo de decis\u00e3o condicionada ao nome espec\u00edfico de uma
// empresa que este projeto tem a regra expl\u00edcita de nunca fazer -- qualquer
// empresa (de qualquer natureza jur\u00eddica) cujo nome fantasia ou raz\u00e3o social
// contivesse coincidentemente esse texto seria classificada incorretamente.
// Corrigido para usar s\u00f3 campos estruturados vindos da Receita/cadastro
// (`natureza_juridica`, `porte`, `porte_receita`, `opcao_mei`) e limites de
// palavra nas frases reconhecidas, nunca o nome da empresa.
export function isEmpresaIndividual(empresa: any): boolean {
  const texto = [empresa?.natureza_juridica, empresa?.porte, empresa?.porte_receita]
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return !!empresa?.opcao_mei || /\bmicroempreendedor individual\b|\bmei\b|\bsimei\b|\bempresario individual\b/.test(texto);
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

function montarTitularEmpresaIndividual(empresa: any) {
  if (!isEmpresaIndividual(empresa)) return null;
  // Nome fantasia e razão social são dados da pessoa jurídica, não prova da
  // identidade civil do titular. O titular só é exposto quando já existe em
  // campo estruturado do cadastro; caso contrário permanece não verificado.
  const nome = String(empresa?.responsavel_nome || '').trim() || null;
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
    fonte_dados: 'cadastro_responsavel_empresa_individual',
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
        AND COALESCE(metadados->>'coleta_status', '') <> 'staging'
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

export function dadosQsa(empresa: any, socios: any[]) {
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

  const empresaIndividual = isEmpresaIndividual(empresa);
  const titularCadastrado = empresaIndividual
    ? (sociosCadastro.find((item) => item.administrador) || sociosCadastro[0]
      || sociosReceitaMapeados.find((item) => item.administrador) || sociosReceitaMapeados[0]
      || montarTitularEmpresaIndividual(empresa))
    : null;
  // EI/MEI têm titular, não quadro de sócios. Mesmo que um cadastro legado
  // tenha gravado o responsável em socios_empresa, ele é apresentado no campo
  // próprio e nunca contado como sociedade fictícia.
  let sociosConsolidados: any[] = empresaIndividual
    ? []
    : sociosCadastro.length
      ? sociosCadastro
      : sociosReceitaMapeados;

  if (sociosConsolidados.length === 1 && !sociosConsolidados[0].administrador) {
    sociosConsolidados = [{ ...sociosConsolidados[0], administrador: true }];
  }

  return {
    total_socios_cadastrados: sociosCadastro.length,
    total_socios_receita_json: sociosReceitaMapeados.length,
    total_socios_consolidados: sociosConsolidados.length,
    empresa_individual_detectada: empresaIndividual,
    proprietario_inferido: false,
    titular_individual: titularCadastrado ? {
      nome: titularCadastrado.nome,
      qualificacao: titularCadastrado.qualificacao || (empresa?.opcao_mei ? 'Titular / Administrador (MEI)' : 'Titular / Administrador (EI)'),
      administrador: true,
      fonte_dados: titularCadastrado.fonte_dados || 'cadastro_estruturado',
    } : null,
    origem_qsa_exibido: empresaIndividual
      ? (titularCadastrado ? 'titular_estruturado_empresa_individual' : 'qsa_nao_aplicavel')
      : sociosCadastro.length > 0 ? 'socios_empresa' : sociosReceitaMapeados.length > 0 ? 'receita_json' : 'nao_disponivel',
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
  'qsa_nao_aplicavel_divergente_natureza',
  'qsa_integrantes_indevidos_empresa_individual',
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
  const versaoPrompt = versaoPromptDocumental(promptCodigo);
  const temVersionamento = await columnExists('documentos_extracoes_ia', 'analysis_signature');
  const selectVersionado = temVersionamento
    ? ', e.id, e.analysis_signature, e.classifier_version, e.extractor_version, e.rule_version, e.schema_version, e.analysis_status, e.stale_at, e.satisfaz_requisito'
    : ', e.id';
  const { rows } = await pool.query(
    `SELECT e.resultado, e.status, e.prompt_versao${selectVersionado}, d.hash_arquivo
       FROM public.documentos_extracoes_ia e
       LEFT JOIN public.documentos_arquivos d ON d.id = e.arquivo_id
      WHERE e.arquivo_id = $1
        AND e.prompt_codigo = $2
        AND e.status IN ('concluido', 'revisao_humana')
      ORDER BY e.processado_em DESC NULLS LAST, e.atualizado_em DESC, e.criado_em DESC
      LIMIT 1`,
    [arquivoId, promptCodigo],
  );
  const row = rows[0];
  const resultado = row?.resultado;
  if (!resultado || typeof resultado !== 'object' || !resultado.tipo_analise) return null;

  const assinaturaEsperada = calcularAssinaturaAnalise({
    arquivoId,
    arquivoHash: row?.hash_arquivo || null,
    promptCodigo,
    promptVersao: versaoPrompt,
    classifierVersion: CLASSIFIER_VERSION,
    extractorVersion: EXTRACTOR_VERSION,
    ruleVersion: RULE_VERSION,
    schemaVersion: SCHEMA_VERSION,
  });
  // A assinatura continua indicando se o motor mudou, mas um deploy/restart
  // não pode apagar uma validação documental já concluída. Quando a versão do
  // motor diverge, o último laudo concluído permanece utilizável enquanto a
  // releitura automática produz uma substituição. Só STALE/SUPERSEDED
  // explícitos deixam de satisfazer o requisito imediatamente. Em bases sem
  // as colunas de versionamento, preservamos o laudo concluído legado em vez
  // de transformar todo o acervo em "Reanálise necessária" apenas pela
  // ausência da migration.
  const decision = temVersionamento
    ? decidirVersaoLaudo(row, {
        arquivoId,
        arquivoHash: row?.hash_arquivo || null,
        promptCodigo,
        promptVersao: versaoPrompt,
        classifierVersion: CLASSIFIER_VERSION,
        extractorVersion: EXTRACTOR_VERSION,
        ruleVersion: RULE_VERSION,
        schemaVersion: SCHEMA_VERSION,
      })
    : { expectedSignature: assinaturaEsperada, isCurrent: false, lifecycleStatus: 'REANALISE_NECESSARIA' as AnalysisLifecycleStatus, shouldReprocess: true };

  const podeManterValidacaoDuranteAtualizacao = laudoConcluidoPodePermanecerAtivo(row);

  if (!decision.isCurrent && podeManterValidacaoDuranteAtualizacao) {
    // Versões anteriores zeravam `satisfaz_requisito` na coluna de ciclo de
    // vida assim que detectavam um bump global, antes de existir uma nova
    // leitura. Para não transformar esse efeito colateral em perda permanente
    // de validação, a verdade documental original do próprio laudo tem
    // precedência quando ela estiver explicitamente registrada. Um documento
    // realmente incompatível continua trazendo `false` no resultado e nunca é
    // promovido por esta compatibilidade.
    const satisfazPersistidoNoLaudo = typeof (resultado as any)?.dados_extraidos?.satisfaz_requisito === 'boolean'
      ? (resultado as any).dados_extraidos.satisfaz_requisito
      : typeof (resultado as any)?.satisfaz_requisito === 'boolean'
        ? (resultado as any).satisfaz_requisito
        : row?.satisfaz_requisito;
    return {
      ...(resultado as AnaliseDocumentalResult),
      analysis_status: 'ATIVO',
      analysis_signature: row?.analysis_signature || null,
      classifier_version: row?.classifier_version || null,
      extractor_version: row?.extractor_version || null,
      rule_version: row?.rule_version || null,
      schema_version: row?.schema_version || null,
      satisfaz_requisito: satisfazPersistidoNoLaudo,
      atualizacao_em_segundo_plano_pendente: temVersionamento === true && decision.shouldReprocess === true,
      versao_legada_sem_assinatura: temVersionamento !== true,
    } as AnaliseDocumentalResult;
  }

  if (!decision.isCurrent) {
    if (temVersionamento && row?.id) {
      void pool.query(
        `UPDATE public.documentos_extracoes_ia
            SET analysis_status = 'REANALISE_NECESSARIA',
                stale_at = COALESCE(stale_at, NOW()),
                satisfaz_requisito = FALSE
          WHERE id = $1`,
        [row.id],
      ).catch((error: any) => console.warn('[Dossiê] Não foi possível marcar laudo stale:', error?.message || error));
    }
    return {
      ...(resultado as AnaliseDocumentalResult),
      status: 'revisao_humana',
      analysis_status: 'REANALISE_NECESSARIA',
      analysis_signature: row?.analysis_signature || null,
      classifier_version: row?.classifier_version || null,
      extractor_version: row?.extractor_version || null,
      rule_version: row?.rule_version || null,
      schema_version: row?.schema_version || null,
      stale_at: row?.stale_at || new Date().toISOString(),
      satisfaz_requisito: false,
      reprocessamento_necessario: true,
      mensagem_status: 'Laudo antigo ou sem assinatura atual; não satisfaz requisito até o reprocessamento.',
    } as AnaliseDocumentalResult;
  }

  return {
    ...(resultado as AnaliseDocumentalResult),
    analysis_status: 'ATIVO',
    analysis_signature: row?.analysis_signature || decision.expectedSignature,
    classifier_version: row?.classifier_version || CLASSIFIER_VERSION,
    extractor_version: row?.extractor_version || EXTRACTOR_VERSION,
    rule_version: row?.rule_version || RULE_VERSION,
    schema_version: row?.schema_version || SCHEMA_VERSION,
    satisfaz_requisito: row?.satisfaz_requisito ?? (resultado as any).satisfaz_requisito,
  } as AnaliseDocumentalResult;
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

// CORREÇÃO (2026-09-02, Rodada 17 -- pedido explícito do usuário -- "eu quero
// que... as confirmações já apareçam sem precisar iniciar a análise
// documental"): exportada para que a leitura automática disparada no upload
// (`agendarAnaliseRegraDocumental`, server/routes/documentos.ts) grave o
// resultado no MESMO lugar (`documentos_extracoes_ia`) que a Etapa 1
// (`montarQsaDocumentalDados`/`montarEnquadramentoDados`, via
// `obterAnaliseEspecializada` acima) já consulta em toda carga de página --
// ver comentário completo na chamada em documentos.ts.
export async function persistirAnaliseEspecializada(
  arquivoId: string,
  promptCodigo: string,
  resultado: AnaliseDocumentalResult,
): Promise<void> {
  const { extracao } = await registrarExtracaoEspecializada({
    arquivoId,
    blocoEntidadeId: null,
    promptCodigo,
  });
  const versionado = await columnExists('documentos_extracoes_ia', 'analysis_signature');
  const satisfazRequisito = resultado?.dados_extraidos?.satisfaz_requisito === true;
  await pool.query(
    versionado
      ? `UPDATE public.documentos_extracoes_ia
          SET status = $2, modelo = $3, campos_extraidos = $4::jsonb,
              resultado = $5::jsonb, nivel_confianca = $6, pendencias = $7::jsonb,
              erros = '[]'::jsonb, processado_em = NOW(), analysis_status = 'ATIVO',
              tipo_esperado = $8, tipo_detectado = $9, identidade_status = $10,
              temporalidade_status = $11, cobertura_status = $12, satisfaz_requisito = $13,
              stale_at = NULL, superseded_at = NULL, last_error_at = NULL, next_retry_at = NULL
        WHERE id = $1`
      : `UPDATE public.documentos_extracoes_ia
        SET status = $2,
            modelo = $3,
            campos_extraidos = $4::jsonb,
            resultado = $5::jsonb,
            nivel_confianca = $6,
            pendencias = $7::jsonb,
            erros = '[]'::jsonb,
            processado_em = NOW()
      WHERE id = $1`,
    versionado
      ? [
          extracao.id, resultado.status, resultado.modelo_ia,
          JSON.stringify(resultado.dados_extraidos || {}), JSON.stringify(resultado),
          resultado.nivel_confianca, JSON.stringify(resultado.alertas || []),
          resultado.dados_extraidos?.tipo_esperado || null,
          resultado.dados_extraidos?.tipo_detectado || null,
          resultado.dados_extraidos?.identidade_status || null,
          resultado.dados_extraidos?.temporalidade_status || null,
          resultado.dados_extraidos?.cobertura_status || null,
          satisfazRequisito,
        ]
      : [
          extracao.id, resultado.status, resultado.modelo_ia,
          JSON.stringify(resultado.dados_extraidos || {}), JSON.stringify(resultado),
          resultado.nivel_confianca, JSON.stringify(resultado.alertas || []),
        ],
  );
  await persistirMetadadosExtracaoCatalogada(extracao.id, resultado);
  if (versionado) {
    // Só depois de a nova leitura ter sido persistida como ATIVO aposentamos
    // as conclusões anteriores. Falha de releitura nunca apaga a última
    // validação bem-sucedida.
    await pool.query(
      `UPDATE public.documentos_extracoes_ia
          SET analysis_status = 'SUPERSEDED',
              superseded_at = COALESCE(superseded_at, NOW()),
              satisfaz_requisito = FALSE
        WHERE arquivo_id = $1
          AND prompt_codigo = $2
          AND id <> $3
          AND status IN ('concluido', 'revisao_humana')
          AND COALESCE(analysis_status, 'ATIVO') NOT IN ('SUPERSEDED', 'STALE')`,
      [arquivoId, promptCodigo, extracao.id],
    ).catch((error: any) => {
      console.warn('[Dossiê] Nova análise foi persistida, mas não foi possível superseder laudos anteriores:', error?.message || error);
    });
  }
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

// CORREÇÃO (2026-08-31, Rodada 15 -- causa raiz de "continua com erro" no QSA
// de uma empresa Empresário Individual mesmo depois da correção de regra da
// Rodada 13): `buscarAnaliseEspecializadaPersistida` (via `decidirVersaoLaudo`,
// `documentalLaudoVersioning.ts`) já marca um laudo persistido com assinatura
// antiga como precisando de reanálise -- mas, antes desta correção, só
// `enriquecerDocumentosAcervoComAnalise` (o card por documento do Acervo
// Documental) checava essa marcação. Os agregadores de etapa (QSA e
// Enquadramento Tributário, usados no banner "Etapa 1"/"Ação necessária")
// usavam `analise.alertas` direto, sem checar se esses alertas vinham de um
// laudo já marcado como desatualizado -- então, mesmo depois de um bump de
// `RULE_VERSION` (necessário sempre que uma regra de validação muda), o
// banner continuava mostrando a pendência calculada pela regra ANTIGA até
// alguém clicar manualmente em "Forçar nova leitura". Esta função dá aos
// agregadores de etapa a MESMA checagem de obsolescência que o card por
// documento já tinha.
function analiseDesatualizada(analise: AnaliseDocumentalResult | null | undefined): boolean {
  if (!analise) return false;
  const status = String((analise as any)?.analysis_status || '').toUpperCase();
  return (analise as any)?.reprocessamento_necessario === true
    || ['STALE', 'SUPERSEDED', 'REANALISE_NECESSARIA'].includes(status);
}

// Exportada (2026-08-31, Rodada 15) apenas para permitir teste unitário
// direto da checagem de obsolescência (`analiseDesatualizada`) -- ver
// tests/analiseQsaDesatualizadaNaoRepeteErroAntigo.test.ts. Continua sendo
// chamada internamente do mesmo jeito; exportar não muda seu comportamento
// para os chamadores existentes.
export async function montarQsaDocumentalDados(
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
    // Ver comentário de `analiseDesatualizada` acima: um laudo de QSA já
    // persistido, mas calculado por uma regra de validação anterior (ex.: a
    // correção da Rodada 13 para "natureza jurídica não permite QSA"), não
    // pode continuar sendo mostrado como se a pendência antiga ainda fosse
    // válida -- isso é exatamente o que causou o usuário ver "continua com
    // erro" mesmo depois da correção estar no código. Sem pendência nova
    // adicionada aqui (o bloqueio "QSA anexado; leitura pendente" abaixo, em
    // `avaliarProntidaoIdentidadeCnpj`, já cobre a situação de forma honesta,
    // sem repetir a mesma informação em dois lugares).
    if (analiseDesatualizada(analise)) {
      return {
        dados: {
          anexado: true,
          analisado: false,
          tentativa_realizada: true,
          documento_id: docMaisRecente.id,
          status_leitura: 'reanalise_necessaria',
          diagnostico: 'O motor de leitura do QSA foi atualizado desde a última análise. Uma nova leitura é necessária para confirmar o resultado -- clique em "Forçar nova leitura" no Acervo Documental.',
        },
        pendencias: [],
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

const TIPOS_COMPROVACAO_REGIME = ['ecf', 'recibo_ecf', 'dctf', 'dctfweb', 'mit', 'darf', 'livro_caixa'];
const REGIMES_COMPROVAVEIS = new Set(['lucro presumido', 'lucro real', 'lucro arbitrado']);

function extrairRegimeComprovadoDoLaudo(analise: any): string | null {
  const dados = analise?.dados_extraidos && typeof analise.dados_extraidos === 'object' ? analise.dados_extraidos : {};
  const comprovados = dados.campos_comprovados && typeof dados.campos_comprovados === 'object' ? dados.campos_comprovados : {};
  const candidatos = [dados.regime_tributario, comprovados.regime_tributario, dados.regime, comprovados.regime]
    .map((valor) => String(valor || '').trim().toLowerCase())
    .filter(Boolean);
  return candidatos.find((valor) => REGIMES_COMPROVAVEIS.has(valor)) || null;
}

async function resolverComprovacaoRegime(empresaId: string, processar: boolean): Promise<{ dados: Record<string, any>; pendencias: Pendencia[] } | null> {
  const documentos = await listarDocumentosEmpresaPorTipos(empresaId, TIPOS_COMPROVACAO_REGIME);
  if (!documentos.length) return null;

  const pendencias: Pendencia[] = [];
  let ultimoLaudo: any = null;
  for (const documento of documentos) {
    const tipoDocumento = String(documento.tipo_documento || '');
    const configuracao = documentAnalysisConfig(tipoDocumento);
    const promptCodigo = configuracao?.promptCodigo || (tipoDocumento === 'darf' ? 'simples_extract' : `${tipoDocumento}_extract`);
    let analise = await buscarAnaliseEspecializadaPersistida(String(documento.id), promptCodigo);
    // Compatibilidade com DARF analisado pelo executor legado antes do catálogo
    // generico: o laudo antigo continua sendo aproveitado se já declarar o regime.
    if (!analise && tipoDocumento === 'darf') analise = await buscarAnaliseEspecializadaPersistida(String(documento.id), 'simples_extract');
    if (!analise && processar) {
      try {
        analise = await analiseDocumentalService.analisarDocumentoCatalogado(empresaId, String(documento.id), tipoDocumento);
        await persistirAnaliseEspecializada(String(documento.id), promptCodigo, analise);
      } catch (error: any) {
        pendencias.push({ codigo: 'comprovacao_regime_falha_leitura', mensagem: mensagemSeguraFalhaLeitura(`${tipoDocumento.toUpperCase()} de confirmação de regime`, error), severidade: 'alta', origem: tipoDocumento, recomendacao: 'Verificar o arquivo e executar novamente a análise documental.' });
        continue;
      }
    }
    if (!analise) {
      pendencias.push({ codigo: 'comprovacao_regime_aguardando_analise', mensagem: `${tipoDocumento.toUpperCase()} anexado; aguardando leitura para confirmar o regime tributário.`, severidade: 'alta', origem: tipoDocumento, recomendacao: 'Executar a análise documental do arquivo anexado.' });
      continue;
    }
    ultimoLaudo = { analise, documento };
    const regime = extrairRegimeComprovadoDoLaudo(analise);
    if (regime) {
      const nomeDocumento = String(documento.nome_original || tipoDocumento).trim();
      return {
        dados: {
          anexado: true,
          analisado: true,
          tentativa_realizada: processar,
          documento_id: documento.id,
          documento_comprobatorio_id: documento.id,
          tipo_documento_comprobatorio: tipoDocumento,
          status_leitura: analise.status,
          lido_em: analise.analisado_em,
          modelo: analise.modelo_ia,
          nivel_confianca: analise.nivel_confianca,
          fonte_extracao: 'documento_comprobatorio_regime',
          ...analise.dados_extraidos,
          regime_tributario: regime.replace(/\b\w/g, (letra) => letra.toUpperCase()),
          regime_confirmado: true,
          regime_a_confirmar: false,
          situacao_simples: 'Não Optante',
          diagnostico: `Regime tributário confirmado por leitura de ${nomeDocumento}: ${regime.replace(/\b\w/g, (letra) => letra.toUpperCase())}.`,
        },
        pendencias: [],
      };
    }
    const alerta = Array.isArray(analise.alertas) ? analise.alertas.find((item: any) => item.severidade === 'alta' || item.severidade === 'critica') || analise.alertas[0] : null;
    pendencias.push({ codigo: alerta?.codigo || 'comprovacao_regime_nao_identificado', mensagem: alerta?.mensagem || `${tipoDocumento.toUpperCase()} foi lido, mas não declarou de forma inequívoca Lucro Presumido, Lucro Real ou Lucro Arbitrado.`, severidade: 'alta', origem: tipoDocumento, recomendacao: alerta?.recomendacao || 'Anexar comprovante legível que declare o regime tributário efetivo.' });
  }

  return {
    dados: {
      anexado: true,
      analisado: Boolean(ultimoLaudo),
      tentativa_realizada: processar,
      documento_id: ultimoLaudo?.documento?.id || documentos[0]?.id || null,
      regime_confirmado: false,
      regime_a_confirmar: true,
      status_leitura: ultimoLaudo?.analise?.status || 'aguardando_analise',
      fonte_extracao: ultimoLaudo?.analise?.dados_extraidos?.fonte_extracao || null,
      diagnostico: 'Há comprovante fiscal anexado, mas a leitura ainda não confirmou Lucro Presumido, Lucro Real ou Lucro Arbitrado.',
    },
    pendencias: pendencias.length ? pendencias : [{ codigo: 'comprovacao_regime_nao_identificado', mensagem: 'Comprovante fiscal anexado sem regime tributário efetivo identificado.', severidade: 'alta', origem: 'documentos_fiscais', recomendacao: 'Anexar ECF, DCTF/DCTFWeb, DARF ou Livro Caixa com evidência legível do regime.' }],
  };
}

export async function montarEnquadramentoDados(
  empresaId: string,
  processar: boolean,
  empresa: any = null,
): Promise<{ dados: Record<string, any>; pendencias: Pendencia[] }> {
  // Consulta primeiro o comprovante fiscal somente quando a Receita deixou a
  // empresa não optante/sem regime efetivo. Optantes do Simples e MEI mantêm o
  // caminho legado e não ganham uma exigência física indevida.
  const regimePelaReceita = identificarRegimeCredito(empresa, {
    regime_tributario: empresa?.regime_tributario,
    opcao_simples: empresa?.opcao_simples,
    opcao_mei: empresa?.opcao_mei,
  });
  if (regimePelaReceita === 'nao_optante_regime_a_confirmar' || regimePelaReceita === 'nao_identificado') {
    const comprovacao = await resolverComprovacaoRegime(empresaId, processar);
    if (comprovacao) return comprovacao;
  }
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
    // Ver comentário de `analiseDesatualizada` (acima de `montarQsaDocumentalDados`):
    // mesma checagem, para o Enquadramento Tributário nunca voltar a exibir uma
    // pendência calculada por uma regra de validação já substituída.
    if (analiseDesatualizada(analise)) {
      return {
        dados: {
          anexado: true,
          analisado: false,
          tentativa_realizada: true,
          documento_id: docMaisRecente.id,
          status_leitura: 'reanalise_necessaria',
          diagnostico: 'O motor de leitura do Enquadramento Tributário foi atualizado desde a última análise. Uma nova leitura é necessária para confirmar o resultado -- clique em "Forçar nova leitura" no Acervo Documental.',
        },
        pendencias: [],
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
    if (qsa.empresa_individual_detectada) {
      if (!qsa.titular_individual) {
        pendencias.push({ codigo: 'titular_empresa_individual_nao_identificado', mensagem: 'O QSA não se aplica a esta empresa individual; o titular ainda não está identificado no cadastro estruturado.', severidade: 'media', origem: 'empresas.responsavel_nome', recomendacao: 'Confirmar o titular no cadastro da empresa sem criar sócio fictício.' });
      }
      return pendencias;
    }
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
          AND COALESCE(da.metadados->>'coleta_status', '') <> 'staging'
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
// Exportada (2026-08-31) apenas para permitir teste unitário direto da
// deduplicação de avisos do Enquadramento Tributário -- ver
// tests/avisosEnquadramentoTributarioSemDuplicidade.test.ts. Continua sendo
// chamada internamente do mesmo jeito; exportar não muda seu comportamento
// para os chamadores existentes.
export async function avaliarProntidaoIdentidadeCnpj(params: {
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
  else if (empresaApta12Meses === false) addAviso(`Empresa com ${idadeMeses} meses. A comprovação de 12 meses será feita na Fase 3.`);
  else addAviso('Tempo de abertura pendente; será confirmado na Fase 3.');

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
  else if (!cartaoAnalisado) addBloqueio('Cartão CNPJ anexado; leitura pendente.');
  else if (!cartaoConsistente) addBloqueio('Cartão CNPJ diverge dos dados da Receita Federal.');
  else pontosPositivos.push('Cartão CNPJ conferido com a Receita Federal.');

  const qsaAnexado = params.qsaDados?.anexado === true;
  const qsaAnalisado = params.qsaDados?.analisado === true;
  const qsaTemGrave = params.qsaPendencias.some((p) => p.severidade === 'alta');
  const qsaConsistente = qsaAnexado && qsaAnalisado && !qsaTemGrave;
  if (!qsaAnexado) addBloqueio('Documento QSA não anexado.');
  else if (!qsaAnalisado) addBloqueio(params.qsaDados?.erro_processamento || 'QSA anexado; leitura pendente.');
  else if (qsaTemGrave) {
    // CORREÇÃO (2026-08-31, Rodada 15, pedido explícito do usuário -- "tire
    // esse monte de poluição visual e diagnósticos errados"): mesmo problema
    // estrutural já corrigido para o Enquadramento Tributário na Rodada 14.
    // `qsaTemGrave` já significa que existe uma pendência de severidade alta
    // em `params.qsaPendencias`, e essa MESMA pendência (com sua mensagem
    // específica e real, ex.: "Não foi possível identificar os nomes dos
    // sócios no QSA") é adicionada separadamente pelo loop de
    // `todasPendencias` logo abaixo -- as duas sempre coexistiam, duplicando
    // o mesmo problema com dois textos diferentes ("Ação necessária" mostrava
    // os dois ao mesmo tempo). O resumo genérico só volta a aparecer no caso
    // defensivo de uma pendência grave sem mensagem própria.
    const temPendenciaQsaGraveComMensagem = params.qsaPendencias.some((p) => p.severidade === 'alta' && p.mensagem);
    if (!temPendenciaQsaGraveComMensagem) {
      addBloqueio('QSA tem divergências societárias relevantes.');
    }
  }
  else pontosPositivos.push('QSA conferido: vínculo com o CNPJ, integrantes e administrador/titular.');

  // A consulta da Receita identifica a situação no Simples, mas "não optante"
  // não identifica sozinha se o regime efetivo é Presumido, Real ou Arbitrado.
  // Para esse caso a confirmação documental é pré-requisito de fluxo: ECF,
  // DCTF/DCTFWeb, DARF pelo código de receita ou Livro Caixa precisa ser anexado
  // e lido com sucesso antes de liberar Atos da Junta Comercial.
  const enquadramentoAnexado = params.enquadramentoDados?.anexado === true;
  const enquadramentoAnalisado = params.enquadramentoDados?.analisado === true;
  const enquadramentoTemGrave = params.enquadramentoPendencias.some((p) => p.severidade === 'alta');
  const regime = String(params.enquadramentoDados?.regime_tributario || params.empresa?.regime_tributario || '').trim();
  const situacaoSimples = String(params.enquadramentoDados?.situacao_simples || '').trim();
  // Reutilizar o mesmo código do mapa documental evita que a ficha libere a
  // etapa societária com uma classificação diferente da trilha documental.
  const regimeCodigo = identificarRegimeCredito(params.empresa, params.enquadramentoDados);
  const regimeRotulo = ROTULO_REGIME_CREDITO[regimeCodigo] || 'Regime ainda não identificado';
  const regimeAConfirmar = regimeCodigo === 'nao_optante_regime_a_confirmar' || regimeCodigo === 'nao_identificado';
  const enquadramentoIdentificado = !!regime || !!situacaoSimples
    || params.empresa?.opcao_simples != null || params.empresa?.opcao_mei != null;
  const enquadramentoConsistente = enquadramentoIdentificado
    && !enquadramentoTemGrave
    && (!enquadramentoAnexado || enquadramentoAnalisado);
  if (!enquadramentoIdentificado) addBloqueio('Regime tributário não identificado. Sincronize os dados de CNPJ (Receita Federal) da empresa.');
  else if (enquadramentoAnexado && !enquadramentoAnalisado) addBloqueio(params.enquadramentoDados?.erro_processamento || 'Documento de enquadramento anexado, mas a análise ainda não foi concluída.');
  else if (regimeCodigo === 'nao_optante_regime_a_confirmar') addBloqueio('Regime tributário a confirmar: anexe ECF, DCTF/DCTFWeb, DARF ou Livro Caixa ou, caso não tenha nenhum desses, outro documento que comprove o regime tributário da empresa, para identificar se a empresa é Lucro Presumido, Lucro Real ou Arbitrado. Os Atos da Junta Comercial só serão solicitados depois dessa confirmação.');
  else if (enquadramentoTemGrave) {
    // CORREÇÃO (2026-08-31, pedido explícito do usuário -- print real
    // mostrando "Etapa 1 validada... 4 avisos", quase todos sobre o mesmo
    // Enquadramento Tributário, "tire esse monte de texto e informação
    // desnecessária"): este resumo genérico ("precisa de revisão humana", sem
    // dizer o motivo) não acrescentava nenhuma informação nova -- toda
    // pendência de severidade alta do Enquadramento também é adicionada, com
    // a mensagem ESPECÍFICA e real do motivo (o que efetivamente diverge ou
    // qual a causa da baixa confiança), pelo loop de
    // `params.enquadramentoPendencias` logo abaixo. As duas coexistiam sempre
    // que havia uma pendência grave, duplicando o mesmo aviso com textos
    // diferentes. O resumo genérico só volta a aparecer no caso defensivo
    // (não observado em produção) de uma pendência grave sem mensagem própria
    // -- para nunca deixar o usuário sem nenhum aviso quando algo está
    // pendente.
    const temPendenciaGraveComMensagem = params.enquadramentoPendencias.some((p) => p.severidade === 'alta' && p.mensagem);
    if (!temPendenciaGraveComMensagem) {
      addAviso('Enquadramento tributário: o comprovante anexado como reforço precisa de revisão humana (divergência ou baixa confiança na leitura automática).');
    }
  }
  else if (!regimeAConfirmar) pontosPositivos.push(`Enquadramento tributário identificado: ${regimeRotulo}.`);

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

  // CORREÇÃO (2026-09-05, Rodada 32 -- print real da tela em produção, empresa
  // MEI "VILSON MARCIO DE LIMA 70010668187", pedido explícito do usuário
  // depois de já ter recebido a Rodada 31: "continua com a mesma mensagem no
  // QSA... que não existia antes, que já identificava corretamente quando é
  // MEI"): `montarQsaDocumentalDados`/`montarEnquadramentoDados` (mais acima
  // neste arquivo) já calculam corretamente `status_leitura:
  // 'reanalise_necessaria'` para um laudo marcado desatualizado pelo
  // versionamento (`analiseDesatualizada`, também neste arquivo) -- mas esta
  // função, que monta o card "Identidade do CNPJ" (StatusAnaliseSlot,
  // DocumentosEntidade.tsx), jogava esse sinal fora: só verificava
  // `status_leitura === 'falha_leitura'` explicitamente, e qualquer outro
  // valor de `analisado === false` (incluindo `reanalise_necessaria`) caía no
  // mesmo `'aguardando_analise'` genérico usado para um documento que nunca
  // foi lido -- gerando o selo errado "Aguardando análise" ao lado do texto
  // certo ("O motor de leitura foi atualizado... clique em Reler"), a mesma
  // classe de inconsistência selo/texto já corrigida na Rodada 31 para o
  // Acervo Documental (`estadoVisualDocumento`), só que num componente
  // diferente que aquela correção não tocava. Corrigido acrescentando um
  // parâmetro explícito para o valor de `status_leitura`, checado ANTES da
  // falha/aguardando -- regra geral, vale para qualquer documento que passe
  // pelo mesmo mecanismo de versionamento (hoje QSA e Enquadramento
  // Tributário/Simples Nacional, os dois únicos que chamam esta função com um
  // `statusLeitura` que pode valer `reanalise_necessaria`).
  const statusDocumento = (anexado: boolean, analisado: boolean, consistente: boolean, falha: boolean, statusLeitura?: string | null) => {
    if (consistente) return 'ok';
    if (!anexado) return 'nao_anexado';
    if (statusLeitura === 'reanalise_necessaria') return 'reanalise_necessaria';
    if (falha) return 'falha_leitura';
    if (!analisado) return 'aguardando_analise';
    return 'divergente';
  };
  const cartaoPendencia = alertasCnpj.find((item: any) => ['critica', 'alta'].includes(String(item?.severidade || '').toLowerCase())) || alertasCnpj[0];
  const qsaPendencia = primeiraPendencia(params.qsaPendencias);
  const enquadramentoPendencia = primeiraPendencia(params.enquadramentoPendencias);
  const qsaSocios = Array.isArray(params.qsaDados?.socios) ? params.qsaDados.socios : [];
  const qsaAdministradores = qsaSocios
    .filter((socio: any) => socio?.administrador === true || /administrador|diretor|presidente|titular/i.test(String(socio?.qualificacao || '')))
    .map((socio: any) => socio?.nome)
    .filter(Boolean);
  const qsaTitularCadastro = isEmpresaIndividual(params.empresa)
    ? String(params.empresa?.responsavel_nome || '').trim() || null
    : null;
  const cnpjQsa = somenteDigitos(params.qsaDados?.cnpj);
  const cnpjEmpresa = somenteDigitos(params.empresa?.cnpj);
  const vinculoCnpjQsa = cnpjQsa && cnpjEmpresa
    ? (cnpjQsa === cnpjEmpresa ? 'CONFIRMADO' : 'DIVERGENTE')
    : 'NÃO VERIFICADO';

  const documentosIniciais = {
    cartao_cnpj: {
      codigo: 'cartao_cnpj', nome: 'Cartão CNPJ', anexado: cartaoAnexado, analisado: cartaoAnalisado, consistente: cartaoConsistente,
      status: statusDocumento(cartaoAnexado, cartaoAnalisado, cartaoConsistente, cartaoFalhou),
      diagnostico: cartaoConsistente ? 'CNPJ validado: situação cadastral, unidade e localização conferidas.' : params.erroProcessamentoCartao || cartaoPendencia?.mensagem || (cartaoAnexado ? 'Documento anexado; a leitura automática ainda precisa ser concluída.' : 'Documento não anexado.'),
      fonte: camposCartao?.fonte_extracao || analiseCnpj?.fonte_receita || null, confianca: camposCartao?.confianca ?? null,
      campos_principais: {
        cnpj: camposCartao?.cnpj || camposReceita?.cnpj || params.empresa?.cnpj || null,
        situacao_cadastral: camposCartao?.situacao_cadastral || camposReceita?.situacao_cadastral || params.empresa?.situacao_cadastral || null,
        matriz_filial: camposCartao?.matriz_filial || null,
        localizacao: [camposCartao?.municipio, camposCartao?.uf].filter(Boolean).join(' / ') || null,
      },
    },
    qsa: {
      codigo: 'qsa', nome: 'QSA / Quadro Societário', anexado: qsaAnexado, analisado: qsaAnalisado, consistente: qsaConsistente,
      status: statusDocumento(qsaAnexado, qsaAnalisado, qsaConsistente, params.qsaDados?.status_leitura === 'falha_leitura', params.qsaDados?.status_leitura),
      tipo_documento: 'qsa',
      tipo_leitura: 'qsa',
      qsa_leitura: true,
      diagnostico: qsaConsistente ? 'QSA validado: vínculo com o CNPJ, quadro societário e administração conferidos.' : params.qsaDados?.diagnostico || qsaPendencia?.mensagem || (qsaAnexado ? 'Documento anexado; a análise societária ainda precisa ser concluída.' : 'Documento não anexado.'),
      fonte: params.qsaDados?.fonte_extracao || params.qsaDados?.modelo || null, confianca: params.qsaDados?.nivel_confianca ?? params.qsaDados?.confianca ?? null,
      socios_lidos: Array.isArray(params.qsaDados?.socios) ? params.qsaDados.socios : [],
      campos_principais: {
        cnpj: params.qsaDados?.cnpj || null,
        vinculo_cnpj: vinculoCnpjQsa,
        quantidade_integrantes: params.qsaDados?.qsa_nao_aplicavel === true ? 0 : qsaSocios.length,
        administrador_titular: qsaAdministradores.length ? qsaAdministradores : qsaTitularCadastro,
        resultado_qsa: qsaConsistente ? 'QSA validado' : null,
      },
    },
    enquadramento_tributario: {
      codigo: 'enquadramento_tributario', nome: 'Enquadramento Tributário', anexado: enquadramentoAnexado, analisado: enquadramentoAnalisado, consistente: enquadramentoConsistente,
      status: statusDocumento(enquadramentoAnexado, enquadramentoAnalisado, enquadramentoConsistente, params.enquadramentoDados?.status_leitura === 'falha_leitura', params.enquadramentoDados?.status_leitura),
      // O enquadramento existe para dizer QUAL regime a empresa usa, porque é o
      // regime que define o restante da documentação exigida. Quando a empresa
      // está fora do Simples, a Consulta de Optantes não responde isso sozinha:
      // Lucro Presumido, Real e Arbitrado são todos "não optante" e pedem
      // documentos diferentes. O diagnóstico registra esse fato -- mas sem
      // instruir a anexar ECF/DCTF/Livro Caixa aqui: este card é da Etapa 1
      // (Identidade do CNPJ) e é opcional; esses documentos são anexados bem
      // mais adiante, no checklist de Documentação da Empresa, então pedir por
      // eles nesta etapa só cria a falsa impressão de que algo já está faltando.
      diagnostico: regimeAConfirmar
        ? (situacaoSimples
            ? `Não optante do Simples Nacional — regime efetivo (Presumido, Real ou Arbitrado) a confirmar.`
            : 'Regime tributário ainda não identificado. Sincronize o CNPJ na Receita Federal ou anexe o comprovante de enquadramento.')
        : enquadramentoConsistente
          ? `Regime tributário confirmado: ${regimeRotulo}.`
          : params.enquadramentoDados?.diagnostico || enquadramentoPendencia?.mensagem || (enquadramentoAnexado ? 'Documento anexado; o enquadramento ainda precisa ser confirmado.' : 'Documento não anexado.'),
      fonte: params.enquadramentoDados?.fonte_extracao || params.enquadramentoDados?.modelo || null, confianca: params.enquadramentoDados?.nivel_confianca ?? params.enquadramentoDados?.confianca ?? null,
      regime_codigo: regimeCodigo,
      regime_a_confirmar: regimeAConfirmar,
      campos_principais: {
        regime_tributario: regimeRotulo,
        situacao_simples: situacaoSimples || null,
        cnpj: params.enquadramentoDados?.cnpj || null,
        data_opcao_simples: params.enquadramentoDados?.data_opcao_simples || null,
        exclusao_agendada: params.enquadramentoDados?.agendamento_exclusao === true,
      },
    },
  };
  // Optantes do Simples e MEI seguem o caminho legado. Para uma empresa
  // identificada como não optante, porém, Atos da Junta só pode ser liberado
  // após a leitura bem-sucedida de um comprovante que declare o regime efetivo.
  const regimeConfirmadoOuNaoAplicavel = regimeCodigo !== 'nao_optante_regime_a_confirmar';
  const tresDocumentosOk = cartaoConsistente && qsaConsistente;
  const apto = situacaoAtiva && tresDocumentosOk && bloqueios.length === 0 && regimeConfirmadoOuNaoAplicavel;

  return {
    etapa: 'identidade_cnpj', proxima_etapa: 'documentacao_societaria', apto_para_avancar: apto, botao_avancar_disponivel: apto,
    tres_documentos_ok: tresDocumentosOk, quatro_documentos_ok: tresDocumentosOk, documentos_iniciais: documentosIniciais,
    idade_meses: idadeMeses, situacao_cadastral_ativa: situacaoAtiva, empresa_apta_12_meses: empresaApta12Meses,
    enquadramento_tributario: regime || situacaoSimples || null, empresa_mei: ehMei, estrategia_alternativa_disponivel: ehMei,
    score_cnpj: analiseCnpj?.score_cnpj ?? null, motivos_pendentes: bloqueios, avisos_estrategicos: avisos, pontos_positivos: pontosPositivos,
    relatorio: { conclusao: apto ? 'APTO_PARA_AVANCAR' : 'PENDENTE', documentos_conferidos: Object.values(documentosIniciais).filter((item) => item.consistente).length, documentos_analisados: Object.values(documentosIniciais).filter((item) => item.analisado).length, falhas_leitura: Object.values(documentosIniciais).filter((item) => item.status === 'falha_leitura').length, total_documentos_iniciais: 3, bloqueios: bloqueios.length, avisos: avisos.length },
    diagnostico: apto ? 'Cartão CNPJ e QSA conferidos. Próxima etapa: documentação societária.' : Object.values(documentosIniciais).some((item) => item.status === 'falha_leitura') ? 'Há arquivo com falha técnica ou baixa legibilidade.' : `Identidade do CNPJ com ${bloqueios.length} bloqueio(s). O avanço depende de Cartão CNPJ e QSA consistentes.`,
  };
}

// Exportada (2026-08-31) apenas para permitir teste unitário direto da
// deduplicação de bloqueios do Atos da Junta -- ver
// tests/validacaoSocietariaBloqueiosSemDuplicidade.test.ts. Continua sendo
// chamada internamente do mesmo jeito; exportar não muda seu comportamento
// para os chamadores existentes.
export async function montarValidacaoSocietaria(
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
        numero_arquivamento: contrato.numero_arquivamento || null,
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
  // CORREÇÃO (2026-08-31, pedido explícito do usuário -- print real mostrando
  // dois avisos quase idênticos sobre Atos da Junta ao mesmo tempo, "tire esse
  // monte de texto e informação desnecessária"): `cadeia.possivel_registro_em_
  // outro_orgao` (calcularCadeiaComprovacaoSocietaria) é `true` sempre que o
  // histórico está vazio -- inclusive quando isso só significa "nada foi
  // anexado ainda", o mesmo caso já coberto, com o mesmo texto, pelo aviso
  // `!atosAnexado` duas linhas acima. Sem a checagem `atosAnexado` abaixo, os
  // dois avisos apareciam juntos para TODA empresa nesta etapa de onboarding,
  // sempre que nada tivesse sido anexado ainda -- uma duplicação universal, não
  // um caso específico. Este aviso agora só aparece como um sinal ADICIONAL e
  // genuinamente diferente: algo FOI anexado e analisado, mas mesmo assim
  // nenhum registro histórico foi identificado (o cenário real da Rodada 13,
  // de um documento "Esta empresa não possui documentos registrados").
  if (atosAnexado && cadeia.possivel_registro_em_outro_orgao && !empresaMei) bloqueios.push('Nenhum ato registrado foi identificado. A empresa pode estar registrada em outro tipo de órgão; mantenha a inclusão documental liberada e encaminhe para revisão humana.');
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

export async function montarDossieCreditoEmpresa(empresaId: string, options: { processarDocumentos?: boolean; processarSocietario?: boolean; usuarioId?: string | null } = {}) {
  await ensureBlocosCatalogo();

  // CORREÇÃO (Rodada 21, 02/09/2026 -- pedido explícito do usuário: "eu quero
  // que os dados do cartão cnpj [...] já apareça aqui validado [...] sem
  // precisar clicar em botão de análise"): as rotas de simples visualização da
  // tela chamam esta função SEM `processarDocumentos: true`, então uma falha
  // de leitura antiga (persistida em `analise_inicial_erro`) ficava sendo
  // reexibida para sempre -- a leitura só era tentada de novo com um clique
  // manual em "Analisar documentos"/"Forçar nova leitura". Regra geral (não
  // depende de nenhuma empresa específica): quando existe uma falha
  // persistida e nenhuma leitura bem-sucedida aconteceu depois dela, a leitura
  // é tentada de novo automaticamente na próxima visualização -- respeitando
  // um intervalo mínimo (`deveRetentarAnaliseFalhaAutomaticamente`) desde a
  // última tentativa, para não repetir chamadas ao OCR local/IA externa a cada
  // carregamento de tela quando o documento é genuinamente ilegível.
  let deveReprocessarCartaoAutomaticamente = false;
  if (!options.processarDocumentos) {
    const docsCartaoAntesDoProcessamento = await listarDocumentosEmpresaPorTipos(empresaId, ['cartao_cnpj', 'cnpj_cartao']).catch(() => []);
    const falhaCartaoPersistidaAntes = docsCartaoAntesDoProcessamento[0]?.resultado_validacao?.analise_inicial_erro || null;
    const analiseCartaoAntesDoProcessamento = falhaCartaoPersistidaAntes?.mensagem
      ? await buscarUltimaAnaliseCnpjEmpresa(empresaId).catch(() => null)
      : null;
    deveReprocessarCartaoAutomaticamente = deveReprocessarCartaoCnpjAutomaticamente({
      falhaPersistida: falhaCartaoPersistidaAntes,
      analiseAtual: analiseCartaoAntesDoProcessamento,
      cooldownMinutos: cooldownRetentativaAutomaticaMinutos(),
    });
  }
  const processarCartaoNestaExecucao = !!options.processarDocumentos || deveReprocessarCartaoAutomaticamente;

  let erroProcessamentoCartao: string | null = null;
  if (processarCartaoNestaExecucao) {
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
  if (processarCartaoNestaExecucao && docsCartao[0]?.id) {
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
  const erroCartaoPersistido = processarCartaoNestaExecucao && !erroProcessamentoCartao
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
      campos_conferidos: ['cnpj', 'nomes_integrantes', 'administrador_titular'],
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

  const { rows: blocosBrutos } = await pool.query(
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

  const blocos = await enriquecerDocumentosAcervoComAnalise(blocosBrutos);
  const pendencias = blocos.flatMap((b: any) => Array.isArray(b.pendencias) ? b.pendencias.map((p: any) => ({ ...p, bloco_codigo: b.codigo, bloco_nome: b.nome_amigavel })) : []);
  const tiposAnexados = new Set<string>(
    blocos.flatMap((bloco: any) => Array.isArray(bloco.documentos)
      ? bloco.documentos.map((documento: any) => String(documento?.tipo_documento || '')).filter(Boolean)
      : []),
  );
  // Rodada 12: 'comprovante_regime_outro' é o terceiro botão de upload rápido
  // ("Outro") da pendência de regime tributário, ao lado de ECF e DCTF -- ver
  // blocoPendenciaRegime em DocumentosEntidade.tsx e o mesmo conjunto em
  // analiseDocumentalEspecializada.ts.
  const tiposComprovacaoRegime = new Set(['ecf', 'recibo_ecf', 'dctf', 'dctfweb', 'mit', 'darf', 'livro_caixa', 'comprovante_regime_outro']);
  const regimesDeclarados = new Set(['lucro presumido', 'lucro real', 'lucro arbitrado']);
  const regimeDeclaradoEmDocumento = blocos
    .flatMap((bloco: any) => Array.isArray(bloco.documentos) ? bloco.documentos : [])
    .filter((documento: any) => tiposComprovacaoRegime.has(String(documento?.tipo_documento || '')) && arquivoDocumentoTemConteudo(documento) && documento?.analisado === true && documento?.consistente === true)
    .flatMap((documento: any) => {
      const resultado = documento?.resultado_analise || {};
      const dados = resultado?.dados_extraidos && typeof resultado.dados_extraidos === 'object' ? resultado.dados_extraidos : {};
      const comprovados = dados?.campos_comprovados && typeof dados.campos_comprovados === 'object' ? dados.campos_comprovados : {};
      const evidencias = Array.isArray(resultado?.evidencias) ? resultado.evidencias : [];
      return [dados.regime_tributario, comprovados.regime_tributario, resultado.regime_tributario, ...evidencias.filter((item: any) => item?.campo === 'regime_tributario').map((item: any) => item?.valor)];
    })
    .map((valor: any) => String(valor || '').trim().toLowerCase())
    .find((valor: string) => regimesDeclarados.has(valor));
  const regimeComprovado = Boolean(regimeDeclaradoEmDocumento);
  const enquadramentoParaMapa = regimeDeclaradoEmDocumento
    ? { ...enquadramento.dados, regime_tributario: regimeDeclaradoEmDocumento, situacao_simples: 'Não Optante', analisado: true, fonte_extracao: 'documento_comprobatorio_regime' }
    : enquadramento.dados;
  const mapaDocumentalCredito = gerarMapaDocumentalCredito({
    empresa,
    enquadramento: enquadramentoParaMapa,
    tiposAnexados,
    regimeComprovado,
    etapa1Aprovada: identidadeCnpj.apto_para_avancar === true,
    etapa2Aprovada: documentacaoSocietaria.apto_para_avancar === true,
  });
  // CORREÇÃO (2026-08-31, "se ela era optante do simples ... vai precisar
  // anexar os documentos do simples também. Mas, com a ressalva de que agora
  // ela é de outro regime"): anexa ao mapa documental a linha do tempo de
  // regime tributário já existente (regimeTributarioTemporalService.ts,
  // populada a cada documento lido com regime confirmado -- ver
  // `persistirEvidenciasP0` em analiseDocumentalEspecializada.ts), para a
  // tela de documentos decidir se os slots do Simples e do ECF/DCTF devem
  // ficar visíveis ao mesmo tempo. Aditivo e best-effort: qualquer falha aqui
  // (ex.: tabela ainda vazia ou indisponível) não pode derrubar o dossiê
  // inteiro -- o mapa documental segue funcionando com o regime atual apenas,
  // exatamente como antes desta correção.
  try {
    const linhaDoTempoRegime = await obterLinhaDoTempoRegime(pool, empresaId);
    mapaDocumentalCredito.historico_regime_tributario = montarHistoricoRegimeTributarioParaMapa(linhaDoTempoRegime);
  } catch (error: any) {
    console.warn('[Dossiê] Histórico de regime tributário indisponível; mapa documental segue com o regime atual apenas:', error?.message || error);
  }
  const modoMotorRegras = String(process.env.DOCUMENTAL_RULE_ENGINE_MODE || 'shadow').toLowerCase() === 'active' ? 'active' : 'shadow';
  const regrasResolvidas = await resolverRegrasDocumentais({
    db: pool,
    contexto: {
      regime: mapaDocumentalCredito.regime_identificado,
      natureza_juridica: empresa.natureza_juridica,
      porte: empresa.porte,
      cnae: empresa.cnae_principal,
      atividade: empresa.segmento,
      possui_inscricao_estadual: Boolean(empresa.inscricao_estadual),
      possui_inscricao_municipal: Boolean(empresa.inscricao_municipal),
      possui_empregados: Number(empresa.numero_funcionarios || 0) > 0 || empresa.possui_empregados === true,
      atividade_regulada: empresa.atividade_regulada === true,
      etapa_atual: mapaDocumentalCredito.etapa_atual,
    },
  });
  if (modoMotorRegras === 'shadow') {
    const divergencias = regrasResolvidas.filter((regra) => regra.aplicabilidade === 'nao_aplicavel').map((regra) => ({
      codigo: regra.codigo,
      tipo_documento: regra.tipo_documento,
      motivo: regra.motivo_aplicabilidade,
    }));
    await pool.query(
      `INSERT INTO public.documentos_regras_shadow_log
        (empresa_id, contexto, motor_legado, motor_novo, divergencias, modo)
       VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, 'shadow')`,
      [
        empresa.id,
        JSON.stringify({ regime: mapaDocumentalCredito.regime_identificado, etapa_atual: mapaDocumentalCredito.etapa_atual }),
        JSON.stringify({ etapas: mapaDocumentalCredito.etapas.map((etapa) => ({ numero: etapa.numero, documentos: etapa.documentos.map((documento) => ({ codigo: documento.codigo, obrigatorio: documento.obrigatorio })) })) }),
        JSON.stringify(regrasResolvidas),
        JSON.stringify(divergencias),
      ],
    ).catch((error: any) => console.warn('[Dossiê] Telemetria shadow indisponível; mapa legado preservado:', error?.message || error));
  }
  const regraPorTipo = new Map<string, RegraResolvida>();
  for (const regra of regrasResolvidas) {
    regraPorTipo.set(regra.tipo_documento, regra);
    regraPorTipo.set(canonicalizeDocumentType(regra.tipo_documento), regra);
  }
  for (const etapa of mapaDocumentalCredito.etapas) {
    for (const documento of etapa.documentos) {
      const regra = documento.tipos_arquivo
        .map((tipo) => regraPorTipo.get(tipo) || regraPorTipo.get(canonicalizeDocumentType(tipo)))
        .find(Boolean);
      if (!regra) continue;
      documento.tipo_exigencia = regra.tipo_exigencia || documento.tipo_exigencia;
      documento.vigencia_inicio = regra.vigencia_inicio || null;
      documento.vigencia_fim = regra.vigencia_fim || null;
      if (modoMotorRegras === 'active' && regra.aplicabilidade === 'nao_aplicavel') {
        documento.obrigatorio = false;
        documento.aplicabilidade = 'nao_aplicavel';
        documento.status = 'nao_aplicavel';
        documento.motivo = regra.motivo_aplicabilidade;
      }
    }
  }
  mapaDocumentalCredito.motor_regras = {
    modo: modoMotorRegras,
    fonte: regrasResolvidas.some((regra) => regra.fonte_resolucao === 'banco') ? 'banco' : 'fallback',
    total_regras: regrasResolvidas.length,
    divergencias_shadow: modoMotorRegras === 'shadow' ? regrasResolvidas.filter((regra) => regra.aplicabilidade === 'nao_aplicavel').length : 0,
  };

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

// Linha do tempo do regime tributário (Missão de evolução do Acervo
// Documental, seção 11): endpoint novo, só leitura, ADITIVO -- não substitui
// nem altera o campo `empresas.regime_tributario` que o restante do sistema já
// usa como "regime vigente". Devolve lista vazia quando nada foi registrado
// ainda na tabela nova (empresas_regime_tributario_historico); nenhum erro é
// esperado nesse caso, é apenas o estado inicial antes de qualquer gravação.
router.get('/empresa/:empresaId/regime-tributario/linha-do-tempo', auth, async (req: Request, res: Response) => {
  try {
    const empresa = await getEmpresa(req.params.empresaId);
    if (!empresa) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    const linhaDoTempo = await obterLinhaDoTempoRegime(pool, req.params.empresaId);
    const vigente = await obterRegimeVigenteEm(pool, req.params.empresaId);
    res.json({
      empresa_id: req.params.empresaId,
      regime_atual_cadastrado: empresa.regime_tributario || null,
      regime_vigente_na_linha_do_tempo: vigente,
      linha_do_tempo: linhaDoTempo,
    });
  } catch (err: any) {
    console.error('[GET /api/documentacao/empresa/:empresaId/regime-tributario/linha-do-tempo]', err);
    res.status(500).json({ error: 'Erro ao carregar a linha do tempo do regime tributário' });
  }
});

// Faturamento em janela móvel de 12 meses, por competência (Missão de
// evolução do Acervo Documental): endpoint novo, só leitura, ADITIVO -- não
// substitui nem altera nenhum campo/metadado já existente sobre o documento
// `faturamento_12_meses`. A janela é calculada a partir do último mês
// fechado por padrão, mas aceita `?ano=YYYY&mes=MM` para consultar a janela
// terminando em outra competência (ex.: auditoria de um mês passado).
router.get('/empresa/:empresaId/faturamento/rolling-12-meses', auth, async (req: Request, res: Response) => {
  try {
    const empresa = await getEmpresa(req.params.empresaId);
    if (!empresa) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }

    let referencia: CompetenciaMensal | undefined;
    const anoQuery = req.query.ano != null ? Number(req.query.ano) : null;
    const mesQuery = req.query.mes != null ? Number(req.query.mes) : null;
    if (anoQuery && mesQuery && Number.isInteger(anoQuery) && Number.isInteger(mesQuery) && mesQuery >= 1 && mesQuery <= 12) {
      referencia = { ano: anoQuery, mes: mesQuery };
    }

    const rolling = await obterFaturamentoRolling12Meses(pool, req.params.empresaId, referencia);
    res.json({ empresa_id: req.params.empresaId, ...rolling });
  } catch (err: any) {
    console.error('[GET /api/documentacao/empresa/:empresaId/faturamento/rolling-12-meses]', err);
    res.status(500).json({ error: 'Erro ao carregar o faturamento em janela móvel de 12 meses' });
  }
});

// Cobertura de evidência entre bureaus (Missão de evolução do Acervo
// Documental): endpoint novo, só leitura, ADITIVO -- não substitui nem altera
// o upload por slot já existente (scr_cnpj, ccs_cnpj, ccf_cnpj etc.). Mostra,
// por requisito (SCR/CCS/CCF/CENPROT/CADIN/PGFN/CND/CNDT/Situação
// Fiscal/Serasa), a MELHOR evidência já registrada entre todos os documentos
// não excluídos/recusados da empresa -- um único documento consolidado pode
// aparecer respondendo por vários requisitos ao mesmo tempo.
router.get('/empresa/:empresaId/cobertura-bureau', auth, async (req: Request, res: Response) => {
  try {
    const empresa = await getEmpresa(req.params.empresaId);
    if (!empresa) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    const cobertura = await obterCoberturaPorEmpresa(pool, req.params.empresaId);
    res.json({ empresa_id: req.params.empresaId, cobertura });
  } catch (err: any) {
    console.error('[GET /api/documentacao/empresa/:empresaId/cobertura-bureau]', err);
    res.status(500).json({ error: 'Erro ao carregar a cobertura de evidência entre bureaus' });
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

// CORREÇÃO (Rodada 27, 02/09/2026, pedido explícito do usuário -- depois de
// confirmar que a correção automática do nome empresarial funcionou: "quero
// que coloque, pode ser em cada modal mesmo, um botão pra reler... pra
// reanalisar os dados. Caso não atualize automaticamente e também pra não
// precisar ficar trocando toda a documentação"): até esta rodada, uma vez que
// a Etapa 1 (Cartão CNPJ/QSA/Enquadramento Tributário) já tinha alguma
// análise registrada, não existia mais nenhum botão para forçar uma releitura
// -- o botão "Analisar documentos" só aparece ANTES da primeira análise
// (`!identidadeCnpj`, ver client/src/components/documentos/DocumentosEntidade.tsx).
// A única forma de forçar uma nova leitura era excluir e reanexar o mesmo
// arquivo (o que já dispara a releitura automática desde a Rodada 23) -- só
// que trocar a documentação inteira não deveria ser necessário só para pedir
// uma nova leitura do MESMO documento já anexado.
//
// Esta rota permite reler, isoladamente, UM dos três tipos da Etapa 1 por vez
// (sem depender dos outros dois estarem corretos/anexados) -- ao contrário de
// "Analisar documentos"/`iniciarAnaliseInicialEmSegundoPlano`, que sempre força
// os três juntos e exige os três anexados. Reaproveita 100% das funções de
// análise já existentes e já testadas (`analisarCnpjReceitaCartaoEmpresa` para
// o Cartão CNPJ -- mesma função usada por `montarDossieCreditoEmpresa` quando
// `processarDocumentos: true`; `montarQsaDocumentalDados`/`montarEnquadramentoDados`
// com `processar: true` para QSA/Enquadramento, que já fazem a leitura forçada
// via `obterAnaliseEspecializada({ reprocessar: true })`) -- nenhuma lógica de
// leitura nova foi criada aqui, só um ponto de entrada que aciona a função
// certa para o tipo pedido e depois remonta o dossiê para refletir o
// resultado fresco na mesma resposta.
//
// Regra geral, válida para qualquer empresa/regime/porte -- nunca condicionada
// a um CNPJ específico: os três tipos aceitos (`cartao_cnpj`, `qsa`,
// `enquadramento_tributario_cnpj`) são sempre os mesmos, independentemente de
// qual documentação aquela empresa específica precisa anexar (o conjunto de
// documentos exigidos por regime/porte, calculado em outro lugar, não muda
// nesta rodada) -- esta rota só oferece uma releitura manual de um documento
// do MESMO tipo que já poderia ser lido automaticamente.
const TIPOS_RELEITURA_MANUAL_IDENTIDADE = new Set(['cartao_cnpj', 'qsa', 'enquadramento_tributario_cnpj']);

// Extraída como função pura só para permitir teste unitário direto do gate
// (sem precisar montar toda a infraestrutura de mock de banco necessária para
// testar a rota HTTP inteira) -- ver tests/releituraManualIdentidadeEtapa1.test.ts.
// Continua chamada normalmente pela rota abaixo; exportar não muda o
// comportamento para quem já usa a rota.
export function tipoIdentidadeTemReleituraManual(tipo: string): boolean {
  return TIPOS_RELEITURA_MANUAL_IDENTIDADE.has(tipo);
}

router.post('/empresa/:empresaId/identidade/:tipo/reler', auth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).colaborador || (req as any).user;
    const { empresaId, tipo } = req.params;

    if (!tipoIdentidadeTemReleituraManual(tipo)) {
      res.status(422).json({ error: 'Este tipo de documento não tem releitura manual disponível por aqui.' });
      return;
    }

    const empresa = await getEmpresa(empresaId);
    if (!empresa) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }

    // Evita uma releitura manual pisar em cima de um processamento em massa
    // (o botão "Analisar documentos") já em andamento para a mesma empresa --
    // ambos escrevem no mesmo lugar; esperar o que já está rodando terminar é
    // mais seguro do que disparar dois processamentos concorrentes.
    if (analisesIniciaisEmAndamento.has(empresaId)) {
      res.status(409).json({ error: 'Já existe uma análise em andamento para esta empresa. Aguarde alguns segundos e tente novamente.' });
      return;
    }

    if (tipo === 'cartao_cnpj') {
      const docsCartao = await listarDocumentosEmpresaPorTipos(empresaId, ['cartao_cnpj', 'cnpj_cartao']);
      if (!docsCartao.length) { res.status(422).json({ error: 'Anexe o Cartão CNPJ antes de solicitar uma nova leitura.' }); return; }
      try {
        await analisarCnpjReceitaCartaoEmpresa(empresaId, user?.id || null);
        await pool.query(
          `UPDATE public.documentos_arquivos
              SET resultado_validacao = COALESCE(resultado_validacao, '{}'::jsonb) - 'analise_inicial_erro',
                  atualizado_em = NOW()
            WHERE id = $1`,
          [docsCartao[0].id],
        ).catch(() => undefined);
      } catch (error: any) {
        const mensagem = mensagemSeguraFalhaLeitura('Cartão CNPJ', error);
        await pool.query(
          `UPDATE public.documentos_arquivos
              SET resultado_validacao = COALESCE(resultado_validacao, '{}'::jsonb) || $2::jsonb,
                  atualizado_em = NOW()
            WHERE id = $1`,
          [docsCartao[0].id, JSON.stringify({ analise_inicial_erro: { mensagem, ocorrido_em: new Date().toISOString() } })],
        ).catch(() => undefined);
        console.warn('[Identidade][reler cartao_cnpj] Falha controlada (não interrompe a resposta):', error?.message || error);
      }
    } else if (tipo === 'qsa') {
      const docsQsa = await listarDocumentosEmpresaPorTipos(empresaId, ['qsa']);
      if (!docsQsa.length) { res.status(422).json({ error: 'Anexe o QSA antes de solicitar uma nova leitura.' }); return; }
      await montarQsaDocumentalDados(empresaId, true).catch((error: any) => {
        console.warn('[Identidade][reler qsa] Falha controlada (não interrompe a resposta):', error?.message || error);
      });
    } else {
      const docsEnquadramento = await listarDocumentosEmpresaPorTipos(empresaId, ['enquadramento_tributario_cnpj', 'simples_nacional']);
      if (!docsEnquadramento.length) { res.status(422).json({ error: 'Anexe o Enquadramento Tributário antes de solicitar uma nova leitura.' }); return; }
      await montarEnquadramentoDados(empresaId, true, empresa).catch((error: any) => {
        console.warn('[Identidade][reler enquadramento_tributario_cnpj] Falha controlada (não interrompe a resposta):', error?.message || error);
      });
    }

    // Remonta o dossiê SEM forçar nada de novo -- o tipo pedido acabou de ser
    // reprocessado e persistido acima; esta chamada só lê o resultado fresco
    // (e os outros dois tipos continuam vindo do que já estava persistido,
    // sem gastar uma nova chamada de OCR/IA para quem não foi pedido).
    const dossie = await montarDossieCreditoEmpresa(empresaId);
    res.json({
      dossie,
      identidade_cnpj: dossie?.identidade_cnpj || null,
      status: dossie?.identidade_cnpj?.status || 'PHASE_1_PENDING',
    });
  } catch (err: any) {
    console.error('[POST identidade/:tipo/reler]', err);
    res.status(500).json({ error: 'Não foi possível solicitar a nova leitura deste documento.' });
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
  // DARF de IRPJ: o código de receita denuncia Presumido (2089), Real
  // (5993/3373) ou Arbitrado (5625) -- catálogo corrigido em
  // extracaoDocumentalLocal.ts (2026-08-30: 5993 estava classificado como
  // Presumido por engano). O código 8998 NÃO é confirmado na tabela oficial
  // da RFB para IRPJ e nunca infere regime sozinho (2026-08-30, reversão de
  // decisão anterior que o mantinha mapeado para Real "por compatibilidade")
  // -- fica sinalizado para revisão humana. O analisador catalogado preserva
  // a evidência do código e aplica a mesma detecção conservadora usada nos
  // demais comprovantes.
  darf: { tipo: 'documento_generico', promptCodigo: 'darf_extract' },
  atos_junta_comercial: { tipo: 'atos_junta_comercial', promptCodigo: 'atos_junta_extract' },
  faturamento_12_meses: { tipo: 'faturamento_12_meses', promptCodigo: 'faturamento_12m_extract' },
  comprovante_faturamento: { tipo: 'faturamento_12_meses', promptCodigo: 'faturamento_12m_extract' },
  declaracao_faturamento: { tipo: 'faturamento_12_meses', promptCodigo: 'faturamento_12m_extract' },
  comprovante_residencia: { tipo: 'comprovante_residencia', promptCodigo: 'comprovante_residencia_extract' },
};
for (const item of DOCUMENT_TYPE_CATALOG) {
  const config = documentAnalysisConfig(item.tipo);
  if (config && !ANALISE_ESPECIALIZADA_POR_TIPO[item.tipo]) {
    ANALISE_ESPECIALIZADA_POR_TIPO[item.tipo] = { tipo: 'documento_generico', promptCodigo: config.promptCodigo };
  }
}

async function persistirMetadadosExtracaoCatalogada(extracaoId: string, resultado: any): Promise<void> {
  if (resultado?.tipo_analise !== 'documento_generico') return;
  await pool.query(
    `UPDATE public.documentos_extracoes_ia
        SET evidencias = $2::jsonb,
            campos_inferidos = $3::jsonb,
            competencia_inicio = $4,
            competencia_fim = $5,
            validade_inicio = $6,
            validade_fim = $7,
            fonte_extracao = $8,
            regra_versao = $9,
            extractor_version = $10,
            rule_version = $11,
            schema_version = $12
      WHERE id = $1`,
    [
      extracaoId,
      JSON.stringify(resultado.evidencias || resultado.dados_extraidos?.evidencias || []),
      JSON.stringify(resultado.campos_inferidos || resultado.dados_extraidos?.campos_inferidos || {}),
      resultado.competencia?.inicio || null,
      resultado.competencia?.fim || null,
      resultado.validade?.inicio || null,
      resultado.validade?.fim || null,
      resultado.dados_extraidos?.fonte_extracao || null,
      RULE_VERSION,
      EXTRACTOR_VERSION,
      RULE_VERSION,
      SCHEMA_VERSION,
    ],
  ).catch((error: any) => console.warn('[AnaliseDocumentalEspecializada] Metadados 098 indisponíveis; resultado legado preservado:', error?.message || error));
}

async function assinaturaAtualDoArquivo(arquivoId: string, promptCodigo: string, promptVersao: string): Promise<string> {
  let hashArquivo: string | null = null;
  try {
    const { rows } = await pool.query('SELECT hash_arquivo FROM public.documentos_arquivos WHERE id = $1 LIMIT 1', [arquivoId]);
    hashArquivo = rows[0]?.hash_arquivo || null;
  } catch {
    // Bases antigas ou fixtures sem a coluna continuam usando o fallback estável do ID.
  }
  return calcularAssinaturaAnalise({
    arquivoId,
    arquivoHash: hashArquivo,
    promptCodigo,
    promptVersao: promptVersao || PROMPT_VERSION,
    classifierVersion: CLASSIFIER_VERSION,
    extractorVersion: EXTRACTOR_VERSION,
    ruleVersion: RULE_VERSION,
    schemaVersion: SCHEMA_VERSION,
  });
}

async function executarAnaliseDocumentalEspecializada(params: {
  extracaoId: string;
  empresaId: string;
  arquivoId: string;
  tipo: TipoAnaliseDocumental;
  tipoDocumento?: string;
}) {
  const { extracaoId, empresaId, arquivoId, tipo, tipoDocumento } = params;
  try {
    const versionado = await columnExists('documentos_extracoes_ia', 'analysis_signature');
    const metadataResult = await pool.query(
      'SELECT prompt_codigo, prompt_versao FROM public.documentos_extracoes_ia WHERE id = $1 LIMIT 1',
      [extracaoId],
    );
    const promptCodigoAtual = String(metadataResult.rows[0]?.prompt_codigo || tipoDocumento || tipo);
    const promptVersaoAtual = String(metadataResult.rows[0]?.prompt_versao || versaoPromptDocumental(promptCodigoAtual));
    await pool.query(
      versionado
        ? `UPDATE public.documentos_extracoes_ia
              SET status = 'processando', analysis_status = 'REANALISE_NECESSARIA', erros = '[]'::jsonb
            WHERE id = $1`
        : `UPDATE public.documentos_extracoes_ia
              SET status = 'processando', erros = '[]'::jsonb
            WHERE id = $1`,
      [extracaoId],
    );

    const tipoParaDespacho = tipoDocumento || tipo;
    if (tipo === 'documento_generico' && !tipoDocumento) throw new Error('Análise genérica sem tipo documental catalogado.');
    const resultado: any = await analiseDocumentalService.analisarDocumentoAutomatico(empresaId, arquivoId, tipoParaDespacho);

    const satisfazRequisito = resultado?.dados_extraidos?.satisfaz_requisito === true;
    const assinatura = versionado
      ? await assinaturaAtualDoArquivo(arquivoId, promptCodigoAtual, promptVersaoAtual)
      : null;
    await pool.query(
      versionado
        ? `UPDATE public.documentos_extracoes_ia
              SET status = $2,
                  modelo = $3,
                  campos_extraidos = $4::jsonb,
                  resultado = $5::jsonb,
                  nivel_confianca = $6,
                  pendencias = $7::jsonb,
                  erros = '[]'::jsonb,
                  processado_em = NOW(),
                  analysis_signature = $8,
                  classifier_version = $9,
                  extractor_version = $10,
                  rule_version = $11,
                  schema_version = $12,
                  analysis_status = 'ATIVO',
                  tipo_esperado = $13,
                  tipo_detectado = $14,
                  identidade_status = $15,
                  temporalidade_status = $16,
                  cobertura_status = $17,
                  satisfaz_requisito = $18,
                  stale_at = NULL,
                  superseded_at = NULL,
                  last_error_at = NULL,
                  next_retry_at = NULL
            WHERE id = $1`
        : `UPDATE public.documentos_extracoes_ia
              SET status = $2,
                  modelo = $3,
                  campos_extraidos = $4::jsonb,
                  resultado = $5::jsonb,
                  nivel_confianca = $6,
                  pendencias = $7::jsonb,
                  erros = '[]'::jsonb,
                  processado_em = NOW()
            WHERE id = $1`,
      versionado
        ? [
            extracaoId,
            resultado.status,
            resultado.modelo_ia,
            JSON.stringify(resultado.dados_extraidos || {}),
            JSON.stringify(resultado),
            resultado.nivel_confianca,
            JSON.stringify(resultado.alertas || []),
            assinatura,
            CLASSIFIER_VERSION,
            EXTRACTOR_VERSION,
            RULE_VERSION,
            SCHEMA_VERSION,
            resultado.dados_extraidos?.tipo_esperado || tipoDocumento || tipo,
            resultado.dados_extraidos?.tipo_detectado || null,
            resultado.dados_extraidos?.identidade_status || null,
            resultado.dados_extraidos?.temporalidade_status || null,
            resultado.dados_extraidos?.cobertura_status || null,
            satisfazRequisito,
          ]
        : [
            extracaoId,
            resultado.status,
            resultado.modelo_ia,
            JSON.stringify(resultado.dados_extraidos || {}),
            JSON.stringify(resultado),
            resultado.nivel_confianca,
            JSON.stringify(resultado.alertas || []),
          ],
    );
    await persistirMetadadosExtracaoCatalogada(extracaoId, resultado);
  } catch (error: any) {
    console.warn('[AnaliseDocumentalEspecializada] Falha controlada na análise:', tipo, arquivoId, error?.message || error);
    const mensagemFalha = String(error?.message || 'Falha não identificada').slice(0, 1200);
    const versionadoFalha = await columnExists('documentos_extracoes_ia', 'analysis_signature').catch(() => false);
    await pool.query(
      versionadoFalha
        ? `UPDATE public.documentos_extracoes_ia
              SET status = 'falhou',
                  analysis_status = 'REANALISE_NECESSARIA',
                  satisfaz_requisito = FALSE,
                  resultado = $2::jsonb,
                  erros = $3::jsonb,
                  last_error_at = NOW(),
                  retry_count = COALESCE(retry_count, 0) + 1,
                  next_retry_at = NOW() + INTERVAL '5 minutes',
                  processado_em = NOW()
            WHERE id = $1`
        : `UPDATE public.documentos_extracoes_ia
              SET status = 'falhou',
                  resultado = $2::jsonb,
                  erros = $3::jsonb,
                  processado_em = NOW()
            WHERE id = $1`,
      [
        extracaoId,
        JSON.stringify({ tipo_analise: tipo, empresa_id: empresaId, arquivo_id: arquivoId, status: 'falhou', analysis_status: 'REANALISE_NECESSARIA' }),
        JSON.stringify([{ codigo: 'analise_documental_falhou', mensagem: mensagemFalha }]),
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
  forcar?: boolean;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`documento-ia:${params.arquivoId}:${params.promptCodigo}`]);
    const versaoEsperada = params.promptVersao || versaoPromptDocumental(params.promptCodigo);
    const versionado = await columnExists('documentos_extracoes_ia', 'analysis_signature');
    let hashArquivo: string | null = null;
    try {
      const documentoHash = await client.query(
        'SELECT hash_arquivo FROM public.documentos_arquivos WHERE id = $1 LIMIT 1',
        [params.arquivoId],
      );
      hashArquivo = documentoHash.rows[0]?.hash_arquivo || null;
    } catch {
      // Compatibilidade com bases anteriores à coluna hash_arquivo.
    }
    const expectedSignature = calcularAssinaturaAnalise({
      arquivoId: params.arquivoId,
      arquivoHash: hashArquivo,
      promptCodigo: params.promptCodigo,
      promptVersao: versaoEsperada || PROMPT_VERSION,
      classifierVersion: CLASSIFIER_VERSION,
      extractorVersion: EXTRACTOR_VERSION,
      ruleVersion: RULE_VERSION,
      schemaVersion: SCHEMA_VERSION,
    });
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
      const atual = existente.rows[0];
      const statusAtual = String(atual.status || '');
      const atualizadoEm = new Date(atual.atualizado_em || atual.criado_em || 0).getTime();
      const mesmaVersao = String(atual.prompt_versao || '') === versaoEsperada;
      const pendenteRecente = statusAtual === 'pendente'
        && Number.isFinite(atualizadoEm)
        && Date.now() - atualizadoEm < 5 * 60 * 1000;
      const emAndamento = mesmaVersao && (statusAtual === 'processando' || pendenteRecente);
      const tentativaMesmaAssinatura = versionado
        && mesmaVersao
        && String(atual.analysis_signature || '') === expectedSignature
        && ['pendente', 'processando', 'falhou'].includes(statusAtual);
      const laudoAtual = !params.forcar
        && versionado
        && mesmaVersao
        && ['concluido', 'revisao_humana'].includes(statusAtual)
        && atual.analysis_status === 'ATIVO'
        && atual.analysis_signature === expectedSignature;
      // `forcar=true` é exclusivo do clique manual "Reler": uma conclusão
      // atual não bloqueia uma nova leitura real. Ainda preservamos o guard de
      // processamento em andamento para impedir duas OCRs simultâneas do mesmo
      // arquivo/prompt.
      deveProcessar = !(emAndamento || laudoAtual);

      if (emAndamento || laudoAtual || tentativaMesmaAssinatura) {
        extracao = atual;
      } else if (versionado) {
        // A versão nova nasce em paralelo. A conclusão anterior só é
        // superseded depois que esta tentativa finalizar com sucesso.
        const inserida = await client.query(
          `INSERT INTO public.documentos_extracoes_ia
            (arquivo_id, entidade_bloco_id, status, prompt_codigo, prompt_versao, resultado, campos_extraidos, pendencias, erros, analysis_signature, classifier_version, extractor_version, rule_version, schema_version, analysis_status, satisfaz_requisito)
           VALUES ($1,$2,'pendente',$3,$4,'{}'::jsonb,'{}'::jsonb,'[]'::jsonb,'[]'::jsonb,$5,$6,$7,$8,$9,'REANALISE_NECESSARIA',FALSE)
           RETURNING *`,
          [params.arquivoId, params.blocoEntidadeId, params.promptCodigo, versaoEsperada, expectedSignature, CLASSIFIER_VERSION, EXTRACTOR_VERSION, RULE_VERSION, SCHEMA_VERSION],
        );
        extracao = inserida.rows[0];
      } else {
        if (['concluido', 'revisao_humana'].includes(statusAtual)) {
          // Banco legado sem colunas de versionamento: não zerar a única
          // conclusão existente. A releitura usa nova linha.
          const inserida = await client.query(
            `INSERT INTO public.documentos_extracoes_ia
              (arquivo_id, entidade_bloco_id, status, prompt_codigo, prompt_versao, resultado, campos_extraidos, pendencias, erros)
             VALUES ($1,$2,'pendente',$3,$4,'{}'::jsonb,'{}'::jsonb,'[]'::jsonb,'[]'::jsonb)
             RETURNING *`,
            [params.arquivoId, params.blocoEntidadeId, params.promptCodigo, versaoEsperada],
          );
          extracao = inserida.rows[0];
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
            [atual.id, params.blocoEntidadeId, versaoEsperada],
          );
          extracao = atualizada.rows[0] || { ...atual, status: 'pendente', prompt_versao: versaoEsperada };
        }
      }
    } else {
      const insertVersioned = versionado ? `, analysis_signature, classifier_version, extractor_version, rule_version, schema_version, analysis_status, satisfaz_requisito` : '';
      const valuesVersioned = versionado ? `, $5, $6, $7, $8, $9, 'REANALISE_NECESSARIA', FALSE` : '';
      const paramsInsert = versionado
        ? [params.arquivoId, params.blocoEntidadeId, params.promptCodigo, versaoEsperada, expectedSignature, CLASSIFIER_VERSION, EXTRACTOR_VERSION, RULE_VERSION, SCHEMA_VERSION]
        : [params.arquivoId, params.blocoEntidadeId, params.promptCodigo, versaoEsperada];
      const inserida = await client.query(
        `INSERT INTO public.documentos_extracoes_ia
          (arquivo_id, entidade_bloco_id, status, prompt_codigo, prompt_versao, resultado, campos_extraidos, pendencias, erros${insertVersioned})
         VALUES ($1,$2,'pendente',$3,$4,'{}'::jsonb,'{}'::jsonb,'[]'::jsonb,'[]'::jsonb${valuesVersioned})
         RETURNING *`,
        paramsInsert,
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

router.get('/ia/documentos/:documentoId/status', auth, async (req: Request, res: Response) => {
  try {
    const arquivoId = req.params.documentoId;
    const documentoResult = await pool.query(
      `SELECT id, empresa_id, entidade_id, entidade_tipo, tipo_documento, resultado_validacao, exige_revisao_humana
         FROM public.documentos_arquivos
        WHERE id = $1
          AND excluido_em IS NULL
          AND COALESCE(status, 'ativo') <> 'excluido'
        LIMIT 1`,
      [arquivoId],
    );
    const documento = documentoResult.rows[0];
    if (!documento) { res.status(404).json({ error: 'Documento não encontrado' }); return; }

    const tipoDocumento = String(documento.tipo_documento || '');
    const config = documentAnalysisConfig(tipoDocumento);
    const promptCodigo = ['contrato_social', 'alteracao_contratual'].includes(tipoDocumento)
      ? 'contrato_junta_crosscheck'
      : (ANALISE_ESPECIALIZADA_POR_TIPO[tipoDocumento]?.promptCodigo || config?.promptCodigo || null);

    let extracao: any = null;
    if (promptCodigo && await tableExists('documentos_extracoes_ia')) {
      const temLifecycle = await columnExists('documentos_extracoes_ia', 'analysis_status');
      const lifecycleSelect = temLifecycle ? ', analysis_status' : '';
      const { rows } = await pool.query(
        `SELECT id, status${lifecycleSelect}, resultado, erros, pendencias, processado_em, atualizado_em, criado_em
           FROM public.documentos_extracoes_ia
          WHERE arquivo_id = $1
            AND prompt_codigo = $2
          ORDER BY processado_em DESC NULLS LAST, atualizado_em DESC, criado_em DESC
          LIMIT 1`,
        [arquivoId, promptCodigo],
      );
      extracao = rows[0] || null;
    }

    const validacao = documento.resultado_validacao && typeof documento.resultado_validacao === 'object'
      ? documento.resultado_validacao
      : {};
    const laudoArquivo = validacao.analise_regra_documental || null;
    const erroArquivo = validacao.analise_regra_documental_erro || null;
    const statusArquivo = String(validacao.analise_automatica_status || '').toLowerCase();
    const statusExtracao = String(extracao?.status || '').toLowerCase();

    // Contrato/alteração só é considerado concluído aqui quando o cross-check
    // contra os Atos da Junta terminou. O laudo genérico individual pode existir,
    // mas não substitui a validação da cadeia societária.
    const exigeCrosscheckSocietario = ['contrato_social', 'alteracao_contratual'].includes(tipoDocumento);
    const concluidoExtracao = ['concluido', 'revisao_humana'].includes(statusExtracao);
    const falhouExtracao = statusExtracao === 'falhou';
    const concluidoArquivo = !exigeCrosscheckSocietario && Boolean(laudoArquivo);
    const falhouArquivo = !exigeCrosscheckSocietario && Boolean(erroArquivo);
    const processando = ['pendente', 'processando'].includes(statusExtracao)
      || (!exigeCrosscheckSocietario && ['pendente', 'processando'].includes(statusArquivo));

    res.json({
      documento_id: arquivoId,
      tipo_documento: tipoDocumento,
      prompt_codigo: promptCodigo,
      suportado: Boolean(config),
      processando,
      concluido: concluidoExtracao || concluidoArquivo,
      falhou: falhouExtracao || falhouArquivo,
      status: statusExtracao || statusArquivo || (concluidoArquivo ? 'concluido' : falhouArquivo ? 'falhou' : 'nao_iniciado'),
      analysis_status: extracao?.analysis_status || null,
      exige_revisao_humana: documento.exige_revisao_humana === true,
      resultado: extracao?.resultado || laudoArquivo || null,
      erro: extracao?.erros?.[0] || erroArquivo || null,
      processado_em: extracao?.processado_em || validacao.analise_automatica_concluida_em || null,
    });
  } catch (err: any) {
    console.error('[GET /api/documentacao/ia/documentos/:documentoId/status]', err);
    res.status(500).json({ error: 'Erro ao consultar status da leitura documental' });
  }
});

router.post('/ia/documentos/:documentoId/extrair', auth, async (req: Request, res: Response) => {
  try {
    await ensureDocumentacaoSchema(pool);
    const { bloco_entidade_id, prompt_codigo, forcar } = req.body || {};
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

    // CORREÇÃO (Rodada 28, 02/09/2026, pedido explícito do usuário, com print
    // da tela em produção mostrando o Contrato Social preso em "Aguardando
    // análise" -- "o botãozinho também de reler, pra confirmar que o
    // contrato social é o que confirma o que foi pedido no ato da junta"):
    // Contrato Social/Alteração Contratual NUNCA tinham entrada em
    // `ANALISE_ESPECIALIZADA_POR_TIPO` -- clicar no botão "Reanalisar" (🔄,
    // já existente por arquivo desde 2026-08-31) para um desses dois tipos
    // sempre respondia 501 "ainda não implementado", silenciosamente, sem
    // nunca confrontar o contrato contra o Ato da Junta. A causa é estrutural:
    // a análise real desses dois tipos (`analisarContratoComAtosJunta`, já
    // usada por `montarValidacaoSocietaria` mais acima neste arquivo) exige
    // um segundo documento como parâmetro (o Ato da Junta correspondente) --
    // algo que o despacho genérico baseado em `ANALISE_ESPECIALIZADA_POR_TIPO`
    // (pensado para "1 documento -> 1 análise") não sabe fornecer. Em vez de
    // generalizar aquele despacho para suportar um segundo documento (mudança
    // ampla, arriscada, numa peça já complexa e usada por muitos outros
    // tipos), este bloco trata os dois tipos societários À PARTE, ANTES do
    // despacho genérico -- reaproveitando 100% da mesma função de análise já
    // usada e já testada indiretamente por `montarValidacaoSocietaria`, só
    // que disparada por arquivo (o mesmo botão "Reanalisar" que já existe na
    // tela), sem esperar o próximo "Iniciar análise societária" completo.
    // Resposta síncrona (200, não 202) porque a chamada é rápida o bastante
    // e evita o cliente ter que adivinhar quando a releitura de fato terminou.
    if (['contrato_social', 'alteracao_contratual'].includes(String(documento.tipo_documento || ''))) {
      const empresaIdContrato = documento.empresa_id || (documento.entidade_tipo === 'empresa' ? documento.entidade_id : null);
      if (!empresaIdContrato) { res.status(422).json({ error: 'Documento societário sem vínculo válido com uma empresa.' }); return; }
      const docsAtos = await listarDocumentosEmpresaPorTipos(empresaIdContrato, ['atos_junta_comercial']);
      const atos = docsAtos.find(arquivoDocumentoTemConteudo) || null;
      if (!atos) {
        res.status(422).json({ error: 'Anexe um Ato da Junta Comercial legível antes de reler o Contrato Social/Alteração Contratual -- é contra ele que o contrato é confrontado.' });
        return;
      }
      try {
        const analise = await analiseDocumentalService.analisarContratoComAtosJunta(empresaIdContrato, arquivoId, atos.id);
        await persistirAnaliseEspecializada(arquivoId, 'contrato_junta_crosscheck', analise);
        res.status(200).json({ message: 'Releitura concluída.', tipo_analise: 'contrato_junta_crosscheck', analise });
      } catch (error: any) {
        const mensagem = mensagemSeguraFalhaLeitura('Contrato/Alteração Social', error);
        await persistirFalhaAnaliseEspecializada(arquivoId, 'contrato_junta_crosscheck', error).catch(() => undefined);
        res.status(502).json({ error: mensagem });
      }
      return;
    }

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
      forcar: forcar === true,
    });

    if (deveProcessar) {
      setImmediate(() => {
        void executarAnaliseDocumentalEspecializada({
          extracaoId: extracao.id,
          empresaId,
          arquivoId,
          tipo: configuracao.tipo,
          tipoDocumento: String(documento.tipo_documento || ''),
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

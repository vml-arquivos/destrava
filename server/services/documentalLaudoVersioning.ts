import crypto from 'node:crypto';

export const CLASSIFIER_VERSION = '2026.09.05';
export const EXTRACTOR_VERSION = 'local-2026.09.04';
// CORREÇÃO (2026-08-31, caso real ZR CONSTRUCOES -- PGDAS aceito no slot de
// ECF): bump obrigatório sempre que `extrairHibrido`/`normalizarDocumentoCatalogado`
// mudam como um documento é classificado. Sem este bump, um laudo já
// persistido com o bug antigo (`documento_compativel` calculado sem o texto
// local real) continuaria sendo servido como "ATIVO" para sempre -- nenhum
// deploy de código, sozinho, muda um registro já gravado no banco. Com o
// bump, `decidirVersaoLaudo` marca esses laudos como REANALISE_NECESSARIA na
// própria leitura (`buscarAnaliseEspecializadaPersistida`), e
// `scripts/backfill-laudos.ts` (`npm run backfill:laudos -- enqueue-and-run`)
// os reprocessa em lote depois do deploy.
// CORREÇÃO (2026-08-31, Rodada 15 -- caso real "44.598.036 PAULO BOLSONI
// BALDI": o usuário reportou que o QSA de uma empresa Empresário Individual
// "continua com erro" mesmo depois da correção da Rodada 13 em
// `validarQsaExtraida` (server/services/analiseDocumentalEspecializada.ts).
// A causa raiz: a Rodada 13 mudou COMO um QSA é validado (o texto oficial "A
// NATUREZA JURÍDICA NÃO PERMITE O PREENCHIMENTO DO QSA" deixou de gerar um
// alerta de severidade alta), mas esqueceu de bumpar `RULE_VERSION` -- e sem
// esse bump, `decidirVersaoLaudo` (chamado por `buscarAnaliseEspecializadaPersistida`)
// considera qualquer laudo de QSA já persistido ANTES da correção como
// "ATIVO" para sempre, porque a assinatura antiga continua batendo com a
// assinatura esperada. O laudo antigo (com o alerta "Não foi possível
// identificar os nomes dos sócios no QSA", calculado pela regra ANTIGA)
// nunca é reprocessado -- nenhum deploy de código, sozinho, muda um registro
// já gravado no banco (mesmo problema documentado no comentário do bump da
// Rodada 7, logo acima). Com este bump, `decidirVersaoLaudo` marca qualquer
// laudo já persistido (de QUALQUER tipo de documento, não só QSA) como
// REANALISE_NECESSARIA na próxima leitura -- e `scripts/backfill-laudos.ts`
// (`npm run backfill:laudos -- enqueue-and-run`) os reprocessa em lote depois
// do deploy. É intencional que este bump seja amplo (afeta todo o sistema, não
// só o QSA): a Rodada 13 já havia mudado `promptQsa`/`normalizarDadosQsa`/
// `validarQsaExtraida` sem bump nenhum, então TODO QSA já analisado antes do
// deploy da Rodada 13 está na mesma situação -- não é possível bumpar de forma
// seletiva só para QSA com a infraestrutura de assinatura única hoje existente.
export const RULE_VERSION = 'rules-2026.09.05.1';
export const PROMPT_VERSION = 'prompt-2.0.0';
export const SCHEMA_VERSION = 'laudo-104';

const VERSOES_PROMPT_DOCUMENTAL: Readonly<Record<string, string>> = {
  qsa_extract: '5.1.0',
  simples_extract: '1.0.0',
  atos_junta_extract: '1.0.0',
  faturamento_12m_extract: '1.0.0',
  comprovante_residencia_extract: '1.0.0',
};

/** Fonte única da versão que entra na linha persistida e na assinatura. */
export function versaoPromptDocumental(promptCodigo: string): string {
  const codigo = String(promptCodigo || '').trim();
  if (VERSOES_PROMPT_DOCUMENTAL[codigo]) return VERSOES_PROMPT_DOCUMENTAL[codigo];
  if (codigo.startsWith('catalogo_')) return '2.0.0';
  return '1.0.0';
}

export type AnalysisLifecycleStatus = 'ATIVO' | 'STALE' | 'REANALISE_NECESSARIA' | 'SUPERSEDED';
export type ProcessingStatus = 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDO' | 'FALHOU';
export type IdentityStatus = 'IDENTIFICADO' | 'INCOMPATIVEL' | 'AMBIGUO' | 'NAO_IDENTIFICADO';
export type TemporalStatus = 'ATUAL' | 'HISTORICO' | 'FORA_JANELA' | 'AINDA_NAO_EXIGIVEL' | 'FUTURO' | 'NAO_VERIFICADO' | 'NAO_APLICAVEL';
export type CoverageStatus = 'SATISFAZ' | 'NAO_SATISFAZ' | 'PARCIAL' | 'EQUIVALENTE';

export interface AnalysisSignatureInput {
  arquivoId: string;
  arquivoHash?: string | null;
  promptCodigo: string;
  promptVersao: string;
  classifierVersion?: string;
  extractorVersion?: string;
  ruleVersion?: string;
  schemaVersion?: string;
}

export interface PersistedAnalysisVersion {
  analysis_signature?: string | null;
  classifier_version?: string | null;
  extractor_version?: string | null;
  rule_version?: string | null;
  schema_version?: string | null;
  prompt_versao?: string | null;
  analysis_status?: string | null;
  status?: string | null;
  stale_at?: string | Date | null;
}

export interface AnalysisVersionDecision {
  expectedSignature: string;
  isCurrent: boolean;
  lifecycleStatus: AnalysisLifecycleStatus;
  shouldReprocess: boolean;
}

function stablePart(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

export function calcularAssinaturaAnalise(input: AnalysisSignatureInput): string {
  const classifierVersion = stablePart(input.classifierVersion, CLASSIFIER_VERSION);
  const extractorVersion = stablePart(input.extractorVersion, EXTRACTOR_VERSION);
  const ruleVersion = stablePart(input.ruleVersion, RULE_VERSION);
  const schemaVersion = stablePart(input.schemaVersion, SCHEMA_VERSION);
  const arquivoHash = stablePart(input.arquivoHash, `sem_hash:${input.arquivoId}`);
  const canonical = [
    `arquivo_id=${input.arquivoId}`,
    `arquivo_hash=${arquivoHash}`,
    `prompt_codigo=${stablePart(input.promptCodigo, 'prompt_desconhecido')}`,
    `prompt_versao=${stablePart(input.promptVersao, PROMPT_VERSION)}`,
    `classifier_version=${classifierVersion}`,
    `extractor_version=${extractorVersion}`,
    `rule_version=${ruleVersion}`,
    `schema_version=${schemaVersion}`,
  ].join('|');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function decidirVersaoLaudo(
  row: PersistedAnalysisVersion | null | undefined,
  input: AnalysisSignatureInput,
): AnalysisVersionDecision {
  const expectedSignature = calcularAssinaturaAnalise(input);
  if (!row) {
    return {
      expectedSignature,
      isCurrent: false,
      lifecycleStatus: 'REANALISE_NECESSARIA',
      shouldReprocess: true,
    };
  }

  const sameSignature = String(row.analysis_signature || '') === expectedSignature;
  const sameClassifier = String(row.classifier_version || '') === stablePart(input.classifierVersion, CLASSIFIER_VERSION);
  const sameExtractor = String(row.extractor_version || '') === stablePart(input.extractorVersion, EXTRACTOR_VERSION);
  const sameRule = String(row.rule_version || '') === stablePart(input.ruleVersion, RULE_VERSION);
  const sameSchema = String(row.schema_version || '') === stablePart(input.schemaVersion, SCHEMA_VERSION);
  const samePrompt = String(row.prompt_versao || '') === stablePart(input.promptVersao, PROMPT_VERSION);
  const current = sameSignature && sameClassifier && sameExtractor && sameRule && sameSchema && samePrompt && row.analysis_status !== 'STALE' && row.analysis_status !== 'SUPERSEDED';
  if (current) {
    return {
      expectedSignature,
      isCurrent: true,
      lifecycleStatus: 'ATIVO',
      shouldReprocess: false,
    };
  }

  return {
    expectedSignature,
    isCurrent: false,
    lifecycleStatus: 'REANALISE_NECESSARIA',
    shouldReprocess: true,
  };
}

export function statusProcessamentoLegado(value: unknown): ProcessingStatus {
  switch (String(value || '').toLowerCase()) {
    case 'processando': return 'PROCESSANDO';
    case 'concluido': return 'CONCLUIDO';
    case 'falhou': return 'FALHOU';
    default: return 'PENDENTE';
  }
}

export function statusLaudoPodeSatisfazer(row: PersistedAnalysisVersion | null | undefined): boolean {
  if (!row) return false;
  return row.analysis_status === 'ATIVO'
    && statusProcessamentoLegado(row.status) === 'CONCLUIDO';
}

export function textoStatusLaudo(lifecycleStatus: AnalysisLifecycleStatus): string {
  switch (lifecycleStatus) {
    case 'ATIVO': return 'Laudo atual';
    case 'STALE': return 'Laudo histórico';
    case 'SUPERSEDED': return 'Laudo superseded';
    case 'REANALISE_NECESSARIA': return 'Reanálise necessária';
  }
}

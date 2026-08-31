import { normalizeText } from '../utils/helpers';

// Cobertura de evidência entre bureaus (Missão de evolução do Acervo
// Documental — SCR/CCS/CCF/CENPROT/CADIN/PGFN/CND/CNDT/Situação
// Fiscal/Serasa). Este módulo ADICIONA um registro de "quais requisitos de
// consulta cadastral este documento cobre" ao lado do upload por slot já
// existente (`documentos_arquivos.tipo_documento`) -- nada aqui substitui ou
// remove esse mecanismo. A ideia central: um relatório de bureau consolidado
// que já traga SCR + CCF + score numa página só deve poder satisfazer os
// TRÊS requisitos sem exigir três uploads separados e idênticos.
//
// Duas peças:
// 1. Um classificador puro (`detectarRequisitosCobertosPeloTexto`) que lê o
//    texto de um documento e aponta quais requisitos ele evidencia --
//    independente do slot em que foi anexado (mesmo espírito de
//    `detectarTipoComprovanteRegime` em extracaoDocumentalLocal.ts: a
//    identidade nunca vem do nome do campo de upload).
// 2. Um registro persistido (`registrarCoberturaEvidencia` /
//    `obterCoberturaPorEmpresa`) que guarda, por documento, os requisitos
//    cobertos com um status granular -- nunca colapsa CND (negativa),
//    Certidão Positiva com Efeito de Negativa (CPEND) e Certidão Positiva
//    pura num único "certidão ok", porque o risco de cada uma é diferente.

export interface Queryable {
  query: (text: string, values?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

// Catálogo fechado de requisitos reconhecidos. Cada um corresponde a uma
// consulta/relatório cadastral que a esteira de crédito pode exigir,
// independente de qual slot de upload historicamente carregava essa
// informação (scr_cnpj/scr_cpf, ccs_cnpj/ccs_cpf, ccf_cnpj/ccf_cpf,
// cenprot_*, cadin_*, pgfn_*, cnd_rfb_*, cndt, situacao_fiscal_*,
// consulta_serasa_*).
export const REQUISITOS_COBERTURA_BUREAU = [
  'SCR',
  'CCS',
  'CCF',
  'CENPROT',
  'CADIN',
  'PGFN',
  'CND_FEDERAL',
  'CNDT',
  'SITUACAO_FISCAL',
  'SERASA',
] as const;
export type RequisitoCoberturaBureau = typeof REQUISITOS_COBERTURA_BUREAU[number];

// Vocabulário de status de cobertura. Deliberadamente NÃO colapsa os quatro
// resultados possíveis de uma certidão de débitos num único "ok"/"pendente":
// uma Certidão Positiva com Efeito de Negativa (CPEND) tem o mesmo efeito
// prático de uma CND para fins de crédito, mas não é a mesma coisa que uma
// CND -- e uma Certidão Positiva pura (sem efeito de negativa) NÃO satisfaz
// o requisito, mesmo aparecendo como "documento anexado". Um Relatório de
// Situação Fiscal consolidado é reconhecido como sua própria fonte, distinta
// de uma CND isolada.
export const STATUS_COBERTURA_BUREAU = [
  'SATISFEITO',
  'CERTIDAO_POSITIVA_COM_EFEITO_NEGATIVO',
  'CERTIDAO_POSITIVA',
  'NAO_APLICAVEL',
  'PENDENTE',
] as const;
export type StatusCoberturaBureau = typeof STATUS_COBERTURA_BUREAU[number];

// Só os status abaixo contam como requisito efetivamente resolvido para fins
// de dossiê -- Certidão Positiva pura, PENDENTE e NAO_APLICAVEL nunca contam,
// mesmo que exista uma linha de cobertura registrada.
const STATUS_QUE_RESOLVEM_REQUISITO = new Set<StatusCoberturaBureau>(['SATISFEITO', 'CERTIDAO_POSITIVA_COM_EFEITO_NEGATIVO']);

export function statusResolveRequisito(status: StatusCoberturaBureau | string): boolean {
  return STATUS_QUE_RESOLVEM_REQUISITO.has(status as StatusCoberturaBureau);
}

// ---------------------------------------------------------------------------
// Classificador independente do slot: um documento pode cobrir mais de um
// requisito ao mesmo tempo (ex.: um relatório consolidado que traz SCR e CCF
// na mesma página). A ordem não importa aqui -- ao contrário do classificador
// de tipo de comprovante de regime (que escolhe UM tipo), aqui a saída é o
// conjunto de TODOS os requisitos encontrados no texto.
// ---------------------------------------------------------------------------
const MARCADORES_COBERTURA_BUREAU: Record<RequisitoCoberturaBureau, RegExp> = {
  SCR: /\bscr\b|sistema\s+de\s+informa[cç][oõ]es\s+de\s+cr[eé]dito|\bregistrato\b|rating\s+bacen/i,
  CCS: /\bccs\b|cadastro\s+de\s+clientes\s+do\s+sistema\s+financeiro/i,
  CCF: /\bccf\b|cadastro\s+de\s+emitentes\s+de\s+cheques\s+sem\s+fundos/i,
  CENPROT: /\bcenprot\b|central\s+nacional\s+de\s+protestos/i,
  CADIN: /\bcadin\b/i,
  PGFN: /\bpgfn\b|procuradoria[- ]geral\s+da\s+fazenda\s+nacional/i,
  CND_FEDERAL: /certid[aã]o\s+(?:negativa|positiva)\s+de\s+d[eé]bitos.{0,60}(?:federai|receita\s+federal|pgfn)|\bcnd\b.{0,15}(?:federal|rfb)/i,
  CNDT: /certid[aã]o\s+negativa\s+de\s+d[eé]bitos\s+trabalhistas|\bcndt\b/i,
  SITUACAO_FISCAL: /relat[oó]rio\s+de\s+situa[cç][aã]o\s+fiscal/i,
  SERASA: /\bserasa\b/i,
};

/**
 * Devolve TODOS os requisitos que o texto do documento evidencia -- nunca
 * apenas o primeiro. Um relatório de bureau consolidado legitimamente cobre
 * vários requisitos ao mesmo tempo; reduzir a busca a "o primeiro que bater"
 * jogaria fora justamente o cenário que este módulo existe para resolver.
 */
export function detectarRequisitosCobertosPeloTexto(texto: string): RequisitoCoberturaBureau[] {
  const encontrados: RequisitoCoberturaBureau[] = [];
  for (const requisito of REQUISITOS_COBERTURA_BUREAU) {
    if (MARCADORES_COBERTURA_BUREAU[requisito].test(texto)) {
      encontrados.push(requisito);
    }
  }
  return encontrados;
}

/**
 * Lê o status da certidão de débitos (CND/CPEND/Certidão Positiva) a partir
 * do texto, quando aplicável. Não adivinha: se o texto não afirmar
 * claramente um dos três resultados, devolve null (fica PENDENTE de revisão,
 * nunca é tratado como satisfeito por omissão).
 */
export function detectarStatusCertidaoDebitos(texto: string): StatusCoberturaBureau | null {
  const norm = normalizeText(texto);
  if (/certidao\s+positiva\s+com\s+efeito\s+de\s+negativa|\bcpen[d]?\b/i.test(norm)) {
    return 'CERTIDAO_POSITIVA_COM_EFEITO_NEGATIVO';
  }
  if (/certidao\s+negativa/i.test(norm)) {
    return 'SATISFEITO';
  }
  if (/certidao\s+positiva/i.test(norm)) {
    return 'CERTIDAO_POSITIVA';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Registro persistido (por documento, um ou mais requisitos cobertos).
// ---------------------------------------------------------------------------
export interface RegistroCoberturaEvidencia {
  id: string;
  documento_id: string;
  requirement_code: string;
  coverage_status: string;
  confidence: number | null;
  source_section: string | null;
  extracted_value: Record<string, unknown> | null;
}

export interface RegistrarCoberturaEvidenciaParams {
  documentoId: string;
  requirementCode: RequisitoCoberturaBureau | string;
  coverageStatus: StatusCoberturaBureau | string;
  confidence?: number | null;
  sourceSection?: string | null;
  extractedValue?: Record<string, unknown> | null;
}

export interface ResultadoRegistroCobertura {
  registro: RegistroCoberturaEvidencia;
  acao: 'inserido' | 'atualizado' | 'ignorado_evidencia_fraca';
}

/**
 * Registra que UM documento cobre UM requisito. Chamar uma vez por requisito
 * detectado no mesmo documento (ver `detectarRequisitosCobertosPeloTexto`)
 * para que um único arquivo cubra vários requisitos de uma vez. Nunca deixa
 * uma evidência mais fraca substituir uma já registrada mais forte para o
 * mesmo par (documento, requisito).
 */
export async function registrarCoberturaEvidencia(
  db: Queryable,
  params: RegistrarCoberturaEvidenciaParams,
): Promise<ResultadoRegistroCobertura> {
  const { documentoId, requirementCode, coverageStatus } = params;
  const confidence = params.confidence ?? null;
  const sourceSection = params.sourceSection ?? null;
  const extractedValue = params.extractedValue ?? null;

  const { rows: existentes } = await db.query(
    `SELECT id, documento_id, requirement_code, coverage_status, confidence, source_section, extracted_value
       FROM public.document_evidence_coverage
      WHERE documento_id = $1 AND requirement_code = $2`,
    [documentoId, requirementCode],
  );
  const existente = existentes[0] || null;

  if (existente && (confidence ?? 0) <= (existente.confidence ?? 0)) {
    return { registro: existente, acao: 'ignorado_evidencia_fraca' };
  }

  if (existente) {
    const { rows } = await db.query(
      `UPDATE public.document_evidence_coverage
          SET coverage_status = $2, confidence = $3, source_section = $4, extracted_value = $5
        WHERE id = $1
        RETURNING id, documento_id, requirement_code, coverage_status, confidence, source_section, extracted_value`,
      [existente.id, coverageStatus, confidence, sourceSection, extractedValue],
    );
    return { registro: rows[0], acao: 'atualizado' };
  }

  const { rows } = await db.query(
    `INSERT INTO public.document_evidence_coverage
       (documento_id, requirement_code, coverage_status, confidence, source_section, extracted_value)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, documento_id, requirement_code, coverage_status, confidence, source_section, extracted_value`,
    [documentoId, requirementCode, coverageStatus, confidence, sourceSection, extractedValue],
  );
  return { registro: rows[0], acao: 'inserido' };
}

export interface CoberturaConsolidadaRequisito {
  requirement_code: string;
  coverage_status: string;
  confidence: number | null;
  documento_id: string;
  resolvido: boolean;
}

/**
 * Cobertura consolidada de uma empresa (ou sócio) para TODOS os requisitos
 * já evidenciados por qualquer um dos seus documentos não excluídos/recusados
 * -- o ponto central do modelo: um único documento pode responder por vários
 * requisitos ao mesmo tempo, então esta função nunca exige um documento
 * dedicado por requisito, só a MELHOR evidência disponível para cada um.
 */
export async function obterCoberturaPorEmpresa(db: Queryable, empresaId: string): Promise<CoberturaConsolidadaRequisito[]> {
  const { rows } = await db.query(
    `SELECT c.requirement_code, c.coverage_status, c.confidence, c.documento_id
       FROM public.document_evidence_coverage c
       JOIN public.documentos_arquivos d ON d.id = c.documento_id
      WHERE d.empresa_id = $1
        AND d.status NOT IN ('excluido', 'recusado')
      ORDER BY c.confidence DESC NULLS LAST`,
    [empresaId],
  );
  const melhorPorRequisito = new Map<string, CoberturaConsolidadaRequisito>();
  for (const linha of rows) {
    if (melhorPorRequisito.has(linha.requirement_code)) continue;
    melhorPorRequisito.set(linha.requirement_code, {
      requirement_code: linha.requirement_code,
      coverage_status: linha.coverage_status,
      confidence: linha.confidence,
      documento_id: linha.documento_id,
      resolvido: statusResolveRequisito(linha.coverage_status),
    });
  }
  return Array.from(melhorPorRequisito.values());
}

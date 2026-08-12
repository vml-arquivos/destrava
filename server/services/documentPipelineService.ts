import { parseDate } from '../utils/helpers';

export enum DocumentPipelineStatus {
  PHASE_1_PENDING = 'PHASE_1_PENDING',
  PHASE_1_PROCESSING = 'PHASE_1_PROCESSING',
  PHASE_2_JUNTA_PENDING = 'PHASE_2_JUNTA_PENDING',
  PHASE_2_JUNTA_PROCESSING = 'PHASE_2_JUNTA_PROCESSING',
  PHASE_3_CONTRACT_PENDING = 'PHASE_3_CONTRACT_PENDING',
  PHASE_3_CONTRACT_PROCESSING = 'PHASE_3_CONTRACT_PROCESSING',
  PHASE_3_HISTORY_INSUFFICIENT = 'PHASE_3_HISTORY_INSUFFICIENT',
  COMPLETED = 'COMPLETED',
}

export class InsufficientHistoricalPeriodException extends Error {
  readonly code = 'INSUFFICIENT_HISTORICAL_PERIOD';
  readonly statusCode = 422;
  constructor(readonly monthsProven: number, readonly requiredMonths = 12) {
    super(`Histórico societário insuficiente: ${monthsProven} de ${requiredMonths} meses comprovados. Anexe a alteração anterior e/ou o Contrato Social original.`);
    this.name = 'InsufficientHistoricalPeriodException';
  }
}

export type ContractHistoryDocument = {
  id?: string | null;
  type: 'contrato_social' | 'alteracao_contratual';
  registrationDate: string | null;
  approved: boolean;
};

function asUtcDate(value: string | null | undefined): Date | null {
  const normalized = parseDate(value);
  if (!normalized) return null;
  const date = new Date(`${normalized}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function completedCalendarMonths(from: Date, to: Date): number {
  if (from.getTime() > to.getTime()) return 0;
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function validateTwelveMonthContractHistory(
  documents: ContractHistoryDocument[],
  referenceDate: Date = new Date(),
) {
  const approved = documents
    .filter((document) => document.approved)
    .map((document) => ({ ...document, parsedDate: asUtcDate(document.registrationDate) }))
    .filter((document): document is ContractHistoryDocument & { parsedDate: Date } => !!document.parsedDate)
    .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());
  if (!approved.length) throw new InsufficientHistoricalPeriodException(0);

  const monthsProven = completedCalendarMonths(approved[0].parsedDate, referenceDate);
  if (monthsProven < 12) throw new InsufficientHistoricalPeriodException(monthsProven);
  return {
    valid: true as const,
    monthsProven,
    oldestRegistrationDate: approved[0].parsedDate.toISOString().slice(0, 10),
    documentsConsidered: approved.map((document) => document.id).filter(Boolean),
  };
}

export function resolveDocumentPipelineStatus(input: {
  phase1Approved: boolean;
  phase1Processing?: boolean;
  juntaApproved: boolean;
  juntaProcessing?: boolean;
  contractProcessing?: boolean;
  historyApproved: boolean;
  hasContractDocuments?: boolean;
}): DocumentPipelineStatus {
  if (!input.phase1Approved) return input.phase1Processing ? DocumentPipelineStatus.PHASE_1_PROCESSING : DocumentPipelineStatus.PHASE_1_PENDING;
  if (!input.juntaApproved) return input.juntaProcessing ? DocumentPipelineStatus.PHASE_2_JUNTA_PROCESSING : DocumentPipelineStatus.PHASE_2_JUNTA_PENDING;
  if (!input.historyApproved) {
    if (input.contractProcessing) return DocumentPipelineStatus.PHASE_3_CONTRACT_PROCESSING;
    return input.hasContractDocuments ? DocumentPipelineStatus.PHASE_3_HISTORY_INSUFFICIENT : DocumentPipelineStatus.PHASE_3_CONTRACT_PENDING;
  }
  return DocumentPipelineStatus.COMPLETED;
}

export function assertUploadAllowed(status: DocumentPipelineStatus, documentType: string): void {
  const phase1 = new Set(['cartao_cnpj', 'qsa', 'enquadramento_tributario_cnpj', 'simples_nacional']);
  if (phase1.has(documentType)) return;
  if (documentType === 'atos_junta_comercial') {
    if ([DocumentPipelineStatus.PHASE_1_PENDING, DocumentPipelineStatus.PHASE_1_PROCESSING].includes(status)) {
      throw Object.assign(new Error('Conclua e aprove a Fase 1 antes de anexar os Atos da Junta Comercial.'), { code: 'PIPELINE_PREVIOUS_PHASE_REQUIRED', statusCode: 423 });
    }
    return;
  }
  if (documentType === 'contrato_social' || documentType === 'alteracao_contratual') {
    const allowed = new Set([DocumentPipelineStatus.PHASE_3_CONTRACT_PENDING, DocumentPipelineStatus.PHASE_3_CONTRACT_PROCESSING, DocumentPipelineStatus.PHASE_3_HISTORY_INSUFFICIENT, DocumentPipelineStatus.COMPLETED]);
    if (!allowed.has(status)) {
      throw Object.assign(new Error('Os Atos da Junta Comercial precisam estar analisados e aprovados antes do Contrato Social/Alteração.'), { code: 'PIPELINE_PREVIOUS_PHASE_REQUIRED', statusCode: 423 });
    }
  }
}

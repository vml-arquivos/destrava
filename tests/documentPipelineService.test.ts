import { describe, expect, it } from 'vitest';
import { DocumentPipelineStatus, InsufficientHistoricalPeriodException, assertUploadAllowed, resolveDocumentPipelineStatus, validateTwelveMonthContractHistory } from '../server/services/documentPipelineService';

const reference = new Date('2026-08-11T12:00:00.000Z');

describe('pipeline documental sequencial', () => {
  it('A: rejeita alteração recente isolada', () => {
    expect(() => validateTwelveMonthContractHistory([{ id: 'ultima', type: 'alteracao_contratual', registrationDate: '2026-03-01', approved: true }], reference)).toThrow(InsufficientHistoricalPeriodException);
  });
  it('A: libera alteração recente com documento anterior suficiente', () => {
    expect(validateTwelveMonthContractHistory([
      { id: 'anterior', type: 'alteracao_contratual', registrationDate: '2025-07-10', approved: true },
      { id: 'ultima', type: 'alteracao_contratual', registrationDate: '2026-03-01', approved: true },
    ], reference).valid).toBe(true);
  });
  it('B: libera última alteração com pelo menos 12 meses', () => {
    expect(validateTwelveMonthContractHistory([{ id: 'antiga', type: 'alteracao_contratual', registrationDate: '2025-08-11', approved: true }], reference).valid).toBe(true);
  });
  it('C: libera contrato social original com pelo menos 12 meses', () => {
    expect(validateTwelveMonthContractHistory([{ id: 'original', type: 'contrato_social', registrationDate: '2020-01-15', approved: true }], reference).valid).toBe(true);
  });
  it('bloqueia contrato antes da aprovação dos Atos da Junta', () => {
    expect(() => assertUploadAllowed(DocumentPipelineStatus.PHASE_2_JUNTA_PENDING, 'contrato_social')).toThrow(/Atos da Junta/);
  });
  it('resolve a transição para a Fase 3 sem salto', () => {
    expect(resolveDocumentPipelineStatus({ phase1Approved: true, juntaApproved: true, historyApproved: false })).toBe(DocumentPipelineStatus.PHASE_3_CONTRACT_PENDING);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { laudoConcluidoPodePermanecerAtivo } from '../server/services/documentalLaudoVersioning';
import { externalAiFallbackDocumentalEnabled } from '../server/services/documentExternalAiPolicy';

describe('Rodada 36 — validação documental persistente', () => {
  it('mantém conclusão válida durante atualização do motor', () => {
    expect(laudoConcluidoPodePermanecerAtivo({ status: 'concluido', analysis_status: 'ATIVO' })).toBe(true);
    expect(laudoConcluidoPodePermanecerAtivo({ status: 'concluido', analysis_status: 'REANALISE_NECESSARIA' })).toBe(true);
  });

  it('não ressuscita STALE, SUPERSEDED ou tentativa falha', () => {
    expect(laudoConcluidoPodePermanecerAtivo({ status: 'concluido', analysis_status: 'STALE' })).toBe(false);
    expect(laudoConcluidoPodePermanecerAtivo({ status: 'concluido', analysis_status: 'SUPERSEDED' })).toBe(false);
    expect(laudoConcluidoPodePermanecerAtivo({ status: 'falhou', analysis_status: 'REANALISE_NECESSARIA' })).toBe(false);
  });
});

describe('Rodada 36 — política internal-first', () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });

  it('uma chave Gemini sozinha não ativa IA externa documental', () => {
    process.env.GEMINI_API_KEY = 'configurada';
    delete process.env.DOCUMENT_EXTERNAL_AI_FALLBACK_ENABLED;
    process.env.GEMINI_DOCUMENT_OCR_ENABLED = 'true';
    expect(externalAiFallbackDocumentalEnabled()).toBe(false);
  });

  it('fallback externo exige dois opt-ins explícitos', () => {
    process.env.DOCUMENT_EXTERNAL_AI_FALLBACK_ENABLED = 'true';
    process.env.GEMINI_DOCUMENT_OCR_ENABLED = 'false';
    expect(externalAiFallbackDocumentalEnabled()).toBe(false);
    process.env.GEMINI_DOCUMENT_OCR_ENABLED = 'true';
    expect(externalAiFallbackDocumentalEnabled()).toBe(true);
  });
});

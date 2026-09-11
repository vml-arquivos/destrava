import { describe, expect, it } from 'vitest';
import { buildCadastralValidationDTO, phase1Approved } from '../server/services/phase1AnalysisService';

describe('Fase 1 institucional sem dados pessoais', () => {
  it('aprova CNPJ ativo, QSA correspondente e regime identificado sem RG/CPF/endereço/cônjuge', () => {
    const dto = buildCadastralValidationDTO({
      empresa: {
        situacao_cadastral: 'ATIVA', matriz_filial: 'MATRIZ', estado: 'GO', cidade: 'Goiânia',
        porte: 'ME', capital_social: 65000, opcao_simples: true,
      },
      identidade: { documentos_iniciais: { qsa: { analisado: true, consistente: true } } },
      enquadramento: { regime_tributario: 'Simples Nacional', opcao_simples: true, opcao_mei: false },
    });
    expect(phase1Approved(dto)).toBe(true);
    expect(Object.keys(dto).sort()).toEqual(['capitalSocial', 'cnpjStatus', 'companySize', 'isMatriz', 'location', 'qsaMatches', 'taxRegime'].sort());
    expect(JSON.stringify(dto)).not.toMatch(/rg|cpf|endereco|cônjuge|conjuge|casamento/i);
  });

  it('não aprova CNPJ inativo', () => {
    const dto = buildCadastralValidationDTO({
      empresa: { situacao_cadastral: 'INATIVA', matriz_filial: 'MATRIZ', regime_tributario: 'Lucro Real' },
      identidade: { documentos_iniciais: { qsa: { analisado: true, consistente: true } } },
    });
    expect(phase1Approved(dto)).toBe(false);
  });

  it('não aprova quando o vínculo oficial do QSA não confere', () => {
    const dto = buildCadastralValidationDTO({
      empresa: { situacao_cadastral: 'ATIVA', matriz_filial: 'MATRIZ', regime_tributario: 'Lucro Presumido' },
      identidade: { documentos_iniciais: { qsa: { analisado: true, consistente: false } } },
    });
    expect(phase1Approved(dto)).toBe(false);
  });
});

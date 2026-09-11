import { describe, expect, it } from 'vitest';
import { analisarTextoDocumentoLocal } from '../server/services/extracaoDocumentalLocal';
import { classificarResultadoPersistido } from '../server/services/classificadorDocumentalCentral';

const CNH_OCR = `
Carteira Nacional de Habilitação / Driver License / Permiso de Conducción
SECRETARIA NACIONAL DE TRÂNSITO SENATRAN
2 1 NOME E SOBRENOME
ANA MARIA DE TESTE
3 DATA, LOCAL E UF DE NASCIMENTO
10/01/1990, GOIÂNIA, GO
4a DATA EMISSÃO 4b VALIDADE
15/02/2024 15/02/2034
4d CPF
5 Nº REGISTRO
111.222.333-44
12345678901
DEPARTAMENTO ESTADUAL DE TRÂNSITO
GOIÁS
`;

describe('leitura local de CNH rasterizada', () => {
  it('extrai nome, CPF, registro, emissão e validade sem confundir o registro com CPF', () => {
    const resultado = analisarTextoDocumentoLocal('documento_identidade_socio', CNH_OCR, 'cnh');

    expect(resultado.dados.documento_compativel).toBe(true);
    expect(resultado.dados.tipo_detectado_local).toBe('CNH');
    expect(resultado.dados.nome).toBe('ANA MARIA DE TESTE');
    expect(resultado.dados.cpf).toBe('111.222.333-44');
    expect(resultado.dados.numero_documento).toBe('12345678901');
    expect(resultado.dados.data_emissao).toBe('2024-02-15');
    expect(resultado.dados.data_validade).toBe('2034-02-15');
    expect(resultado.dados.validade).toEqual({ inicio: '2024-02-15', fim: '2034-02-15' });
    expect(resultado.confianca).toBeGreaterThanOrEqual(0.9);
  });

  it('classifica um cabeçalho CNH mesmo quando o OCR preserva somente marcadores oficiais', () => {
    const resultado = classificarResultadoPersistido({
      tipoEsperado: 'cnh',
      resultado: {
        documento_compativel: true,
        campos_comprovados: { cpf: '111.222.333-44' },
      },
      texto: 'SENATRAN 4d CPF 111.222.333-44 5 Nº REGISTRO 12345678901',
    });

    expect(resultado.tipo_detectado).toBe('CNH');
    expect(resultado.identidade_status).toBe('IDENTIFICADO');
  });
});

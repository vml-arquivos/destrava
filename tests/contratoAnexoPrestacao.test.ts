import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validarArquivoPdfContrato } from '../client/src/utils/contratoAnexo';
import { MAX_CONTRATO_ASSINADO_BYTES, nomePdfSeguro } from '../shared/contratoAnexo';
import { ContratoAnexoValidationError, decodificarPdfContratoAssinado } from '../server/services/contratoAnexoValidation';

describe('anexo do contrato de prestação de serviços', () => {
  it('aceita PDF em data URL e normaliza o nome sem extensão', () => {
    const conteudo = Buffer.from('%PDF-1.7\ncontrato de teste').toString('base64');
    const resultado = decodificarPdfContratoAssinado(`data:application/pdf;base64,${conteudo}`, 'Contrato assinado 2026');

    expect(resultado.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(resultado.nomeOriginal).toBe('Contrato-assinado-2026.pdf');
  });

  it('rejeita conteúdo que não seja PDF antes de gravar o anexo', () => {
    const falsoPdf = Buffer.from('imagem ou texto').toString('base64');

    expect(() => decodificarPdfContratoAssinado(falsoPdf, 'contrato.pdf'))
      .toThrowError(ContratoAnexoValidationError);
    expect(() => decodificarPdfContratoAssinado(falsoPdf, 'contrato.pdf'))
      .toThrow('O anexo do contrato precisa ser um PDF válido.');
  });

  it('rejeita PDF acima do limite operacional', () => {
    const buffer = Buffer.alloc(MAX_CONTRATO_ASSINADO_BYTES + 1, 0x20);
    buffer.write('%PDF-', 0, 'ascii');

    expect(() => decodificarPdfContratoAssinado(buffer.toString('base64'), 'contrato.pdf'))
      .toThrow('excede o limite');
  });

  it('valida a assinatura do PDF no navegador antes de abrir a confirmação', async () => {
    const pdf = {
      size: 24,
      slice: () => new Blob([Buffer.from('%PDF-1.7\n')]),
    } as unknown as File;
    const falso = {
      size: 12,
      slice: () => new Blob([Buffer.from('not-a-pdf')]),
    } as unknown as File;

    await expect(validarArquivoPdfContrato(pdf)).resolves.toBeNull();
    await expect(validarArquivoPdfContrato(falso)).resolves.toBe('O arquivo selecionado não é um PDF válido.');
  });

  it('usa a validação nos dois componentes que oferecem o anexo assinado', () => {
    const ficha = readFileSync('client/src/pages/colaborador/Empresas.tsx', 'utf8');
    const lista = readFileSync('client/src/components/contratos/ListaContratos.tsx', 'utf8');

    expect(ficha).toContain('validarArquivoPdfContrato');
    expect(lista).toContain('validarArquivoPdfContrato');
    expect(nomePdfSeguro('contrato assinado.pdf')).toBe('contrato-assinado.pdf');
  });
});

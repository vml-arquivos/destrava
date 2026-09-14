import { MAX_CONTRATO_ASSINADO_BYTES, mensagemLimiteContrato, nomePdfSeguro, pdfHeaderValido } from '../../shared/contratoAnexo';

export class ContratoAnexoValidationError extends Error {
  statusCode = 400;
}

function erroValidacao(mensagem: string): ContratoAnexoValidationError {
  return new ContratoAnexoValidationError(mensagem);
}

export function decodificarPdfContratoAssinado(conteudo: unknown, nomeArquivo: unknown): { buffer: Buffer; nomeOriginal: string } {
  if (typeof conteudo !== 'string' || !conteudo.trim()) {
    throw erroValidacao('Informe o PDF assinado do contrato.');
  }

  const valor = conteudo.trim();
  const base64 = valor.includes(',') ? valor.slice(valor.indexOf(',') + 1) : valor;
  const normalizado = base64.replace(/\s/g, '');
  if (!normalizado || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalizado)) {
    throw erroValidacao('O anexo do contrato não contém um PDF base64 válido.');
  }

  const buffer = Buffer.from(normalizado, 'base64');
  if (!buffer.length || !pdfHeaderValido(buffer)) {
    throw erroValidacao('O anexo do contrato precisa ser um PDF válido.');
  }
  if (buffer.length > MAX_CONTRATO_ASSINADO_BYTES) {
    throw erroValidacao(mensagemLimiteContrato());
  }

  return { buffer, nomeOriginal: nomePdfSeguro(nomeArquivo) };
}

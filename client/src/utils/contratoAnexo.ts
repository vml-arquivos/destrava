import { MAX_CONTRATO_ASSINADO_BYTES, pdfHeaderValido } from '../../../shared/contratoAnexo';

export async function validarArquivoPdfContrato(file: File | null | undefined): Promise<string | null> {
  if (!file) return 'Selecione o PDF assinado do contrato.';
  if (file.size <= 0) return 'O arquivo selecionado está vazio.';
  if (file.size > MAX_CONTRATO_ASSINADO_BYTES) {
    return `O PDF do contrato excede o limite de ${Math.floor(MAX_CONTRATO_ASSINADO_BYTES / 1024 / 1024)}MB.`;
  }
  const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (!pdfHeaderValido(bytes)) return 'O arquivo selecionado não é um PDF válido.';
  return null;
}

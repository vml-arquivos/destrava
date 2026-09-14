export const MAX_CONTRATO_ASSINADO_BYTES = 25 * 1024 * 1024;

export function pdfHeaderValido(bytes: ArrayLike<number>): boolean {
  return bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d;
}

export function nomePdfSeguro(nome: unknown): string {
  const original = String(nome || '').trim();
  const base = (original || 'contrato-assinado.pdf')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 180) || 'contrato-assinado.pdf';
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

export function mensagemLimiteContrato(): string {
  return `O PDF do contrato excede o limite de ${Math.floor(MAX_CONTRATO_ASSINADO_BYTES / 1024 / 1024)}MB.`;
}

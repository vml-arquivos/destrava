import crypto from 'crypto';

export function normalizarCodigoIndicacao(value: unknown): string | null {
  const codigo = String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 64);
  return codigo || null;
}

export function gerarCodigoIndicacao(): string {
  return `PARC-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

export function montarLinkIndicacao(codigo: string, baseUrl = process.env.PUBLIC_SITE_URL || 'https://destravacredito.com'): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/simular?ref=${encodeURIComponent(codigo)}`;
}

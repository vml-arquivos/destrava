/*
 * Utilidades de validação e sanitização
 *
 * Este módulo centraliza funções comuns de validação de entradas e
 * sanitização de nomes de arquivos. Centralizar estas funções evita
 * duplicação de código entre diferentes módulos e facilita testes e
 * manutenção.
 */

/**
 * Verifica se o valor é uma UUID válida.
 * Aceita apenas strings no formato 8-4-4-4-12 com caracteres hexadecimais.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Converte um valor potencialmente JSON em objeto. Retorna objeto vazio caso
 * não consiga converter. Útil para normalizar campos que podem vir como
 * string JSON ou objeto já parseado.
 */
export function safeJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Sanitiza um nome de arquivo removendo acentos, espaços e caracteres
 * inválidos. Se o nome resultante estiver vazio ou for composto apenas por
 * pontos, retorna 'arquivo'. Limita o tamanho a 140 caracteres.
 */
export function sanitizeFileName(original: string): string {
  const base = (original || 'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normalized = base.replace(/[^a-zA-Z0-9_.-]+/g, '_').replace(/^\.+/, '').slice(0, 140);
  return normalized || 'arquivo';
}
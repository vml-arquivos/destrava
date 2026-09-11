export type NexusCatalogoTipo = 'empresa' | 'pessoa_fisica' | 'todos';

const TIPOS_PJ = new Set(['empresa', 'empresas', 'pj', 'cliente_pj', 'clientes_pj']);
const TIPOS_PF = new Set(['cliente', 'clientes', 'pessoa_fisica', 'pessoa-fisica', 'pf', 'cliente_pf', 'clientes_pf']);

export function normalizarTipoCatalogo(valor: unknown): NexusCatalogoTipo {
  const tipo = String(valor || 'todos').trim().toLowerCase();
  if (TIPOS_PJ.has(tipo)) return 'empresa';
  if (TIPOS_PF.has(tipo)) return 'pessoa_fisica';
  return 'todos';
}

export function normalizarPaginacaoCatalogo(pageRaw: unknown, limitRaw: unknown) {
  const pageNumber = Number(pageRaw === undefined || pageRaw === null || pageRaw === '' ? 1 : pageRaw);
  const limitNumber = Number(limitRaw === undefined || limitRaw === null || limitRaw === '' ? 200 : limitRaw);
  const page = Number.isFinite(pageNumber) ? Math.max(Math.trunc(pageNumber), 1) : 1;
  const limit = Number.isFinite(limitNumber) ? Math.min(Math.max(Math.trunc(limitNumber), 1), 500) : 200;
  return { page, limit, offset: (page - 1) * limit };
}

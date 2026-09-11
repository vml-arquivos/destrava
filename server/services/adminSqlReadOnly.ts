export interface SqlReadOnlyValidation {
  ok: boolean;
  normalized: string;
  error?: string;
}

function withoutLiteralsAndComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n\r]*/g, ' ')
    .replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)?\$[\s\S]*?\$\1\$/g, "''")
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validarSqlSomenteLeitura(input: unknown): SqlReadOnlyValidation {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, normalized: '', error: 'Query inválida.' };
  if (Buffer.byteLength(input, 'utf8') > 50_000) return { ok: false, normalized: '', error: 'Query excede o limite de 50 KB.' };
  const trimmed = input.trim();
  const noTrailingSemicolon = trimmed.replace(/;\s*$/, '').trim();
  const inspected = withoutLiteralsAndComments(noTrailingSemicolon);
  if (inspected.includes(';')) return { ok: false, normalized: '', error: 'Apenas uma instrução SQL é permitida.' };
  if (!/^(?:select|with|explain\s+(?:\([^)]*\)\s*)?(?:select|with))\b/i.test(inspected)) {
    return { ok: false, normalized: '', error: 'Somente SELECT, WITH ou EXPLAIN de leitura são permitidos.' };
  }
  const forbidden = /\b(?:insert|update|delete|merge|truncate|alter|drop|create|grant|revoke|comment|vacuum|analyze|reindex|cluster|refresh|copy|call|do|execute|prepare|deallocate|listen|notify|load|security|set|reset|lock)\b/i;
  if (forbidden.test(inspected) || /\bselect\b[\s\S]*\binto\b/i.test(inspected)) {
    return { ok: false, normalized: '', error: 'A instrução contém operação não permitida no modo somente leitura.' };
  }
  return { ok: true, normalized: noTrailingSemicolon };
}

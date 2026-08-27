export type EmpresaCnpjEnrichmentData = Record<string, any>;

export type EmpresaCnpjUpdate = {
  assignments: string[];
  values: unknown[];
};

/**
 * Monta somente atribuições para colunas que existem na instalação atual.
 * Campos já preenchidos nunca são substituídos por dados externos.
 */
export function buildEmpresaCnpjUpdate(
  columns: ReadonlySet<string>,
  dados: EmpresaCnpjEnrichmentData,
  now = new Date().toISOString(),
): EmpresaCnpjUpdate {
  const assignments: string[] = [];
  const values: unknown[] = [];

  const addTextIfEmpty = (column: string, value: unknown) => {
    if (!columns.has(column) || value === null || value === undefined || String(value).trim() === '') return;
    values.push(value);
    assignments.push(`"${column}" = COALESCE(NULLIF("${column}", ''), $${values.length})`);
  };
  const addValueIfNull = (column: string, value: unknown) => {
    if (!columns.has(column) || value === null || value === undefined || value === '') return;
    values.push(value);
    assignments.push(`"${column}" = COALESCE("${column}", $${values.length})`);
  };

  addTextIfEmpty('razao_social', dados.razao_social);
  addTextIfEmpty('nome_fantasia', dados.nome_fantasia);
  addTextIfEmpty('email', dados.email);
  addTextIfEmpty('telefone', dados.ddd_telefone_1);
  addTextIfEmpty('inscricao_estadual', dados.inscricao_estadual);
  addTextIfEmpty('cep', dados.cep);
  addTextIfEmpty('logradouro', dados.logradouro);
  addTextIfEmpty('numero', dados.numero);
  addTextIfEmpty('complemento', dados.complemento);
  addTextIfEmpty('bairro', dados.bairro);
  addTextIfEmpty('cidade', dados.municipio);
  addTextIfEmpty('estado', dados.uf);
  addTextIfEmpty('natureza_juridica', dados.natureza_juridica);
  addTextIfEmpty('cnae_principal', dados.cnae_fiscal);
  addTextIfEmpty('situacao_cadastral', dados.descricao_situacao_cadastral);
  addTextIfEmpty('motivo_situacao_cadastral', dados.motivo_situacao_cadastral);
  addTextIfEmpty('matriz_filial', dados.descricao_identificador_matriz_filial);
  addValueIfNull('capital_social', dados.capital_social);
  addValueIfNull('data_abertura', dados.data_inicio_atividade);
  addValueIfNull('data_situacao_cadastral', dados.data_situacao_cadastral);

  if (columns.has('cnaes_secundarios') && Array.isArray(dados.cnaes_secundarios) && dados.cnaes_secundarios.length > 0) {
    const cnaes = dados.cnaes_secundarios
      .map((item: any) => {
        if (typeof item === 'string') return item.trim();
        return `${item?.codigo || ''}${item?.descricao ? ` - ${item.descricao}` : ''}`.trim();
      })
      .filter(Boolean);
    if (cnaes.length > 0) {
      values.push(cnaes);
      assignments.push(`"cnaes_secundarios" = CASE WHEN COALESCE(cardinality("cnaes_secundarios"), 0) = 0 THEN $${values.length}::text[] ELSE "cnaes_secundarios" END`);
    }
  }

  if (columns.has('dados_extra_receita')) {
    const snapshot = {
      origem: 'enriquecimento_automatico_simulador',
      atualizado_em: dados.data_sincronizacao || now,
      provedor: dados.provedor_principal || dados.provedor || null,
      fontes_consulta: dados.fontes_consulta || [],
      qsa_count: dados.qsa_count || 0,
    };
    values.push(JSON.stringify({ enriquecimento_automatico: snapshot }));
    assignments.push(`"dados_extra_receita" = COALESCE("dados_extra_receita", '{}'::jsonb) || $${values.length}::jsonb`);
  }

  addValueIfNull('ultima_sincronizacao_receita', dados.ultima_sincronizacao_receita || dados.data_sincronizacao);
  if (columns.has('updated_at')) assignments.push('"updated_at" = NOW()');

  return { assignments, values };
}

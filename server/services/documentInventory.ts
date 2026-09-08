export type DocumentoInventario = {
  id?: string | null;
  tipo_documento?: string | null;
  [key: string]: unknown;
};

export type BlocoInventario = {
  codigo?: string | null;
  documentos?: DocumentoInventario[] | null;
  [key: string]: unknown;
};

function idDocumento(documento: DocumentoInventario): string {
  return String(documento?.id || '').trim();
}

/**
 * Mantém no dossiê os arquivos ativos que existem na empresa, mas ainda não
 * possuem vínculo em documentacao_bloco_arquivos. Esses arquivos não recebem
 * automaticamente um requisito: entram em um bloco informativo e continuam
 * sujeitos ao mesmo laudo/status do acervo. O vínculo de bloco permanece
 * preferível; o bloco virtual só evita que o relatório perca anexos legados.
 */
export function anexarDocumentosNaoVinculados(
  blocos: BlocoInventario[],
  documentosAtivos: DocumentoInventario[],
  codigo = 'documentos_avulsos',
): BlocoInventario[] {
  const idsVinculados = new Set(
    blocos.flatMap((bloco) => Array.isArray(bloco.documentos) ? bloco.documentos : [])
      .map(idDocumento)
      .filter(Boolean),
  );
  const avulsos = documentosAtivos.filter((documento) => {
    const id = idDocumento(documento);
    return Boolean(id) && !idsVinculados.has(id);
  });
  if (!avulsos.length) return blocos;

  return [
    ...blocos,
    {
      id: `virtual-${codigo}`,
      entidade_tipo: 'empresa',
      status: 'analisado',
      completo: false,
      validado: false,
      dados_estruturados: {},
      pendencias: [],
      origem: 'sistema',
      codigo,
      nome_amigavel: 'Documentos anexados fora dos blocos',
      descricao: 'Arquivos ativos preservados no inventário, mas sem vínculo documental específico.',
      entidade_principal: true,
      obrigatorio: false,
      ordem: 999,
      configuracao: {},
      documentos: avulsos,
    },
  ];
}

export function idsDocumentosVinculados(blocos: BlocoInventario[]): string[] {
  return Array.from(new Set(
    blocos.flatMap((bloco) => Array.isArray(bloco.documentos) ? bloco.documentos : [])
      .map(idDocumento)
      .filter(Boolean),
  ));
}

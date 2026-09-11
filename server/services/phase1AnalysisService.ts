export type Phase1TaxRegime = {
  simplesNacional: boolean;
  simei: boolean;
  regime: 'Simples Nacional' | 'Lucro Presumido' | 'Lucro Real' | 'Não identificado';
};

export type CadastralValidationDTO = {
  cnpjStatus: string | null;
  isMatriz: boolean;
  location: { uf: string | null; municipality: string | null };
  companySize: string | null;
  qsaMatches: boolean;
  capitalSocial: number | null;
  taxRegime: Phase1TaxRegime;
};

function normalize(value: unknown): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function booleanFlag(value: unknown, fallbackText: string, pattern: RegExp): boolean {
  if (typeof value === 'boolean') return value;
  return pattern.test(normalize(fallbackText));
}

export function buildCadastralValidationDTO(input: {
  empresa: Record<string, any>;
  identidade?: Record<string, any> | null;
  enquadramento?: Record<string, any> | null;
}): CadastralValidationDTO {
  const empresa = input.empresa || {};
  const identidade = input.identidade || {};
  const enquadramento = input.enquadramento || {};
  const regimeRaw = String(enquadramento.regime_tributario || identidade.enquadramento_tributario || empresa.regime_tributario || '');
  const simples = booleanFlag(enquadramento.opcao_simples ?? empresa.opcao_simples, regimeRaw, /simples nacional/);
  const simei = booleanFlag(enquadramento.opcao_mei ?? empresa.opcao_mei, regimeRaw, /\bmei\b|simei|microempreendedor individual/);
  const regime: Phase1TaxRegime['regime'] = simples || simei
    ? 'Simples Nacional'
    : /presumido/.test(normalize(regimeRaw))
      ? 'Lucro Presumido'
      : /lucro real|\breal\b/.test(normalize(regimeRaw))
        ? 'Lucro Real'
        : 'Não identificado';
  const qsa = identidade.documentos_iniciais?.qsa;

  return {
    cnpjStatus: empresa.situacao_cadastral || null,
    isMatriz: /matriz/.test(normalize(empresa.matriz_filial || empresa.identificador_matriz_filial || '')),
    location: { uf: empresa.estado || empresa.uf || null, municipality: empresa.cidade || empresa.municipio || null },
    companySize: empresa.porte || empresa.porte_receita || null,
    qsaMatches: qsa?.analisado === true && qsa?.consistente === true,
    capitalSocial: Number.isFinite(Number(empresa.capital_social)) ? Number(empresa.capital_social) : null,
    taxRegime: { simplesNacional: simples, simei, regime },
  };
}

export function phase1Approved(dto: CadastralValidationDTO): boolean {
  return normalize(dto.cnpjStatus) === 'ativa'
    && dto.isMatriz
    && dto.qsaMatches
    && dto.taxRegime.regime !== 'Não identificado';
}

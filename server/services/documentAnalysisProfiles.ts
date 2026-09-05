import { canonicalizeDocumentType, getDocumentCatalogEntry } from '../../shared/documentTypes';

export type DocumentTemporalPolicy =
  | 'sem_validade_formal'
  | 'validade_expressa'
  | 'competencia_mensal'
  | 'competencia_anual'
  | 'ultimos_12_meses'
  | 'emissao_30_dias'
  | 'emissao_60_dias';

// CORREÇÃO (Rodada 33, 05/09/2026, diagnóstico cruzado de duas pesquisas
// independentes -- "Manus AI" e GPT -- sobre a matriz documental de crédito):
// as duas pesquisas, cada uma com seu próprio vocabulário, pedem que toda
// regra temporal/documental carregue o grau da fonte que a sustenta, porque
// hoje o código trata com o MESMO peso (i) certidões com prazo de validade
// definido em norma/serviço oficial (CND/PGFN: 180 dias; CRF/FGTS) e (ii)
// consultas de cadastro/bureau que são só uma FOTO de um instante (Cartão
// CNPJ, CADIN, SCR/rating Bacen, CCS, CCF, Cenprot, Serasa) -- para as quais
// nenhuma das duas pesquisas encontrou fonte normativa que justifique um
// prazo fixo de "vencimento" (CADIN é citado nominalmente pelas duas: "não é
// sinônimo de CND federal"). Este campo não muda nenhum resultado de
// classificação hoje calculado (`temporalidade()` em
// `classificadorDocumentalCentral.ts` continua igual) -- é só a informação,
// que faltava, de QUE TIPO de exigência cada prazo representa:
//   LEI_NORMA        -- obrigação com prazo definido em lei/instrução normativa/resolução.
//   ORGAO_OFICIAL     -- validade/serviço definido por órgão público competente (ex.: prazo do próprio certificado oficial).
//   PRATICA_MERCADO   -- prazo operacional de política de crédito, sem fonte normativa própria encontrada nas duas pesquisas.
export type GrauFonteRegraDocumental = 'LEI_NORMA' | 'ORGAO_OFICIAL' | 'PRATICA_MERCADO';

export interface DocumentAnalysisProfile {
  tipo: string;
  categoria: string;
  camposObrigatorios: string[];
  camposQuandoPresentes: string[];
  politicaTemporal: DocumentTemporalPolicy;
  validadePadraoDias: number | null;
  // `null` quando o tipo não está na tabela `POLITICA_POR_TIPO` (perfil
  // genérico por categoria) -- as duas pesquisas não cobriram esses tipos
  // especificamente, então não há classificação a herdar sem inferência.
  grauFonte: GrauFonteRegraDocumental | null;
}

const CAMPOS_POR_CATEGORIA: Record<string, { obrigatorios: string[]; adicionais: string[] }> = {
  contrato: {
    obrigatorios: ['partes', 'objeto', 'data_assinatura', 'vigencia', 'assinaturas'],
    adicionais: ['cnpj', 'cpf', 'valor', 'obrigacoes', 'garantias', 'numero_contrato'],
  },
  societario: {
    obrigatorios: ['razao_social', 'cnpj', 'data_documento', 'registro', 'assinaturas'],
    adicionais: ['nire', 'capital_social', 'socios', 'administradores', 'poderes_representacao', 'numero_arquivamento'],
  },
  cadastral: {
    obrigatorios: ['cnpj', 'razao_social', 'situacao_cadastral', 'data_emissao'],
    adicionais: ['nome_fantasia', 'cnae', 'natureza_juridica', 'porte', 'endereco', 'telefone', 'email'],
  },
  socio: {
    obrigatorios: ['nome', 'cpf', 'tipo_documento', 'numero_documento'],
    adicionais: ['data_nascimento', 'data_validade', 'orgao_emissor', 'endereco', 'estado_civil', 'assinatura'],
  },
  regularidade: {
    obrigatorios: ['entidade_consultada', 'situacao_certidao', 'data_emissao', 'data_validade', 'orgao_emissor'],
    adicionais: ['cnpj', 'cpf', 'numero_certidao', 'codigo_autenticidade', 'debitos', 'pendencias'],
  },
  credito: {
    obrigatorios: ['entidade_consultada', 'data_consulta', 'resultado_consulta'],
    adicionais: ['cnpj', 'cpf', 'score', 'dividas', 'limites', 'restricoes', 'protestos', 'instituicoes'],
  },
  fiscal: {
    obrigatorios: ['cnpj', 'competencia', 'situacao', 'recibo_ou_protocolo'],
    adicionais: ['regime_tributario', 'receita_bruta', 'tributos', 'codigo_receita', 'data_transmissao', 'data_validade'],
  },
  trabalhista: {
    obrigatorios: ['cnpj', 'competencia', 'situacao'],
    adicionais: ['eventos', 'debitos', 'retencoes', 'recibo_ou_protocolo'],
  },
  contabil: {
    obrigatorios: ['cnpj', 'periodo', 'demonstracao'],
    adicionais: ['ativo', 'passivo', 'patrimonio_liquido', 'receita', 'resultado', 'fluxo_caixa', 'contador', 'crc', 'assinaturas'],
  },
  financeiro: {
    obrigatorios: ['cnpj_ou_titular', 'periodo', 'valores'],
    adicionais: ['competencias_mensais', 'saldo_inicial', 'entradas', 'saidas', 'saldo_final', 'clientes', 'fornecedores', 'assinaturas'],
  },
  garantia: {
    obrigatorios: ['bem_ou_garantidor', 'proprietario', 'identificacao', 'valor'],
    adicionais: ['registro', 'onus', 'gravames', 'data_avaliacao', 'validade', 'assinaturas'],
  },
  operacional: {
    obrigatorios: ['tipo_evidencia', 'conteudo_visivel', 'qualidade_imagem'],
    adicionais: ['data_captura', 'local_declarado', 'fachada', 'instalacoes', 'equipamentos'],
  },
  outros: {
    obrigatorios: ['tipo_detectado', 'entidade_relacionada', 'finalidade'],
    adicionais: ['datas', 'valores', 'situacao', 'assinaturas', 'evidencias'],
  },
};

// CORREÇÃO (Rodada 33): `grauFonte` acrescentado a cada linha desta tabela --
// nenhuma linha teve `politica`/`dias` alterados (o comportamento de
// classificação hoje em produção continua idêntico), só a classificação da
// fonte que faltava. Grupo "PRATICA_MERCADO" aqui reúne exatamente os tipos
// que as duas pesquisas (Manus AI e GPT) descreveram como snapshot/consulta
// de cadastro ou bureau, sem prazo de validade com fonte normativa própria --
// CADIN em especial é citado nominalmente pelas duas como não equivalente a
// uma CND. O Cartão CNPJ entra no mesmo grupo pelo mesmo motivo (é uma foto
// do cadastro num instante; a Receita não define um "vencimento" de 30 dias
// para o documento em si -- o sistema já prefere reconsulta automática via a
// API gratuita de CNPJ nesses casos, ver Rodada 19).
const POLITICA_POR_TIPO: Record<string, { politica: DocumentTemporalPolicy; dias?: number; grauFonte: GrauFonteRegraDocumental }> = {
  cartao_cnpj: { politica: 'emissao_30_dias', dias: 30, grauFonte: 'PRATICA_MERCADO' },
  comprovante_residencia: { politica: 'emissao_60_dias', dias: 60, grauFonte: 'PRATICA_MERCADO' },
  cnd_rfb_cnpj: { politica: 'validade_expressa', grauFonte: 'ORGAO_OFICIAL' },
  cnd_rfb_cpf: { politica: 'validade_expressa', grauFonte: 'ORGAO_OFICIAL' },
  pgfn_cnpj: { politica: 'validade_expressa', grauFonte: 'ORGAO_OFICIAL' },
  pgfn_cpf: { politica: 'validade_expressa', grauFonte: 'ORGAO_OFICIAL' },
  crf_fgts: { politica: 'validade_expressa', grauFonte: 'ORGAO_OFICIAL' },
  cndt: { politica: 'validade_expressa', grauFonte: 'ORGAO_OFICIAL' },
  cnd_estadual: { politica: 'validade_expressa', grauFonte: 'ORGAO_OFICIAL' },
  cnd_municipal: { politica: 'validade_expressa', grauFonte: 'ORGAO_OFICIAL' },
  certidao: { politica: 'validade_expressa', grauFonte: 'ORGAO_OFICIAL' },
  // Bureau/cadastro -- snapshot, não certidão com prazo legal (ver comentário
  // acima). CADIN citado nominalmente pelas duas pesquisas.
  situacao_fiscal_cnpj: { politica: 'emissao_30_dias', dias: 30, grauFonte: 'PRATICA_MERCADO' },
  situacao_fiscal_cpf: { politica: 'emissao_30_dias', dias: 30, grauFonte: 'PRATICA_MERCADO' },
  rating_bacen_cnpj: { politica: 'emissao_30_dias', dias: 30, grauFonte: 'PRATICA_MERCADO' },
  rating_bacen_cpf: { politica: 'emissao_30_dias', dias: 30, grauFonte: 'PRATICA_MERCADO' },
  ccs_cnpj: { politica: 'emissao_30_dias', dias: 30, grauFonte: 'PRATICA_MERCADO' },
  ccs_cpf: { politica: 'emissao_30_dias', dias: 30, grauFonte: 'PRATICA_MERCADO' },
  ccf_cnpj: { politica: 'emissao_30_dias', dias: 30, grauFonte: 'PRATICA_MERCADO' },
  ccf_cpf: { politica: 'emissao_30_dias', dias: 30, grauFonte: 'PRATICA_MERCADO' },
  cenprot_cnpj: { politica: 'emissao_30_dias', dias: 30, grauFonte: 'PRATICA_MERCADO' },
  cenprot_cpf: { politica: 'emissao_30_dias', dias: 30, grauFonte: 'PRATICA_MERCADO' },
  cadin_cnpj: { politica: 'emissao_30_dias', dias: 30, grauFonte: 'PRATICA_MERCADO' },
  cadin_cpf: { politica: 'emissao_30_dias', dias: 30, grauFonte: 'PRATICA_MERCADO' },
  consulta_serasa_cnpj: { politica: 'emissao_30_dias', dias: 30, grauFonte: 'PRATICA_MERCADO' },
  consulta_serasa_cpf: { politica: 'emissao_30_dias', dias: 30, grauFonte: 'PRATICA_MERCADO' },
  // Obrigações fiscais/acessórias com prazo em lei/instrução normativa/resolução.
  pgdas: { politica: 'competencia_mensal', grauFonte: 'LEI_NORMA' },
  pgmei: { politica: 'competencia_mensal', grauFonte: 'LEI_NORMA' },
  das_mei: { politica: 'competencia_mensal', grauFonte: 'LEI_NORMA' },
  dctf: { politica: 'competencia_mensal', grauFonte: 'LEI_NORMA' },
  dctfweb: { politica: 'competencia_mensal', grauFonte: 'LEI_NORMA' },
  mit: { politica: 'competencia_mensal', grauFonte: 'LEI_NORMA' },
  darf: { politica: 'competencia_mensal', grauFonte: 'ORGAO_OFICIAL' },
  efd_contribuicoes: { politica: 'competencia_mensal', grauFonte: 'LEI_NORMA' },
  efd_icms_ipi: { politica: 'competencia_mensal', grauFonte: 'LEI_NORMA' },
  esocial: { politica: 'competencia_mensal', grauFonte: 'LEI_NORMA' },
  efd_reinf: { politica: 'competencia_mensal', grauFonte: 'LEI_NORMA' },
  ecf: { politica: 'competencia_anual', grauFonte: 'LEI_NORMA' },
  ecd: { politica: 'competencia_anual', grauFonte: 'LEI_NORMA' },
  defis: { politica: 'competencia_anual', grauFonte: 'LEI_NORMA' },
  dasn_simei: { politica: 'competencia_anual', grauFonte: 'LEI_NORMA' },
  imposto_renda: { politica: 'competencia_anual', grauFonte: 'LEI_NORMA' },
  // Evidência de crédito -- coletada por prática de mercado/política de
  // crédito, não por obrigação fiscal (ambas as pesquisas: rolling 12 meses é
  // política de análise de crédito coerente com a RBT12 oficial, não uma
  // obrigação em si).
  faturamento_12_meses: { politica: 'ultimos_12_meses', grauFonte: 'PRATICA_MERCADO' },
  extrato_bancario: { politica: 'competencia_mensal', grauFonte: 'PRATICA_MERCADO' },
  relatorio_receitas_mei: { politica: 'competencia_mensal', grauFonte: 'PRATICA_MERCADO' },
  balancete: { politica: 'competencia_mensal', grauFonte: 'PRATICA_MERCADO' },
};

const CAMPOS_ESPECIFICOS: Record<string, string[]> = {
  qsa: ['socios', 'administradores', 'capital_social'],
  atos_junta_comercial: ['nire', 'historico_arquivamentos', 'ato_mais_recente'],
  requerimento_empresario: ['razao_social', 'cnpj', 'nire', 'numero_registro', 'data_registro', 'titular', 'assinaturas'],
  estatuto: ['razao_social', 'cnpj', 'registro', 'data_registro', 'administradores', 'poderes_representacao', 'assinaturas'],
  ata: ['razao_social', 'cnpj', 'tipo_assembleia', 'data_documento', 'deliberacoes', 'administradores', 'assinaturas'],
  registro_cartorio_pj: ['razao_social', 'cnpj', 'orgao_registro', 'numero_registro', 'data_registro', 'situacao_registro'],
  registro_oab: ['razao_social', 'cnpj', 'secional_oab', 'numero_registro', 'data_registro', 'situacao_registro'],
  enquadramento_tributario_cnpj: ['regime_tributario', 'opcao_simples', 'opcao_mei'],
  simples_nacional: ['regime_tributario', 'opcao_simples', 'opcao_mei'],
  efd_contribuicoes: ['periodo', 'registros_m400', 'registros_m800', 'totais_m400_m800'],
  efd_icms_ipi: ['periodo', 'registros_e110', 'icms_debitos', 'icms_creditos', 'icms_recolher'],
  balanco: ['ativo_total', 'passivo_total', 'patrimonio_liquido'],
  dre: ['receita_liquida', 'lucro_bruto', 'ebit', 'ebitda', 'lucro_liquido'],
  dfc: ['fluxo_operacional', 'fluxo_investimento', 'fluxo_financiamento', 'variacao_caixa'],
  extrato_bancario: ['banco', 'agencia', 'conta', 'saldo_inicial', 'lancamentos', 'saldo_final'],
  garantia: ['tipo_bem', 'matricula_ou_registro', 'valor_avaliado', 'onus_e_gravames'],
};

export function obterPerfilAnaliseDocumental(tipoDocumento: string): DocumentAnalysisProfile {
  const tipo = canonicalizeDocumentType(tipoDocumento);
  const item = getDocumentCatalogEntry(tipoDocumento) || getDocumentCatalogEntry(tipo);
  const categoria = item?.categoria || 'outros';
  const base = CAMPOS_POR_CATEGORIA[categoria] || CAMPOS_POR_CATEGORIA.outros;
  const temporal = POLITICA_POR_TIPO[tipo] || { politica: 'sem_validade_formal' as const, grauFonte: null };
  return {
    tipo,
    categoria,
    camposObrigatorios: Array.from(new Set(CAMPOS_ESPECIFICOS[tipo]?.length ? CAMPOS_ESPECIFICOS[tipo] : base.obrigatorios)),
    camposQuandoPresentes: base.adicionais,
    politicaTemporal: temporal.politica,
    validadePadraoDias: temporal.dias ?? null,
    grauFonte: temporal.grauFonte ?? null,
  };
}

export function descricaoPerfilParaPrompt(tipoDocumento: string): string {
  const perfil = obterPerfilAnaliseDocumental(tipoDocumento);
  const notaFonte = perfil.grauFonte === 'PRATICA_MERCADO'
    ? ' Este prazo é política de crédito/prática de mercado, não obrigação legal -- não apresente como exigência da lei.'
    : '';
  return [
    `Campos essenciais deste tipo: ${perfil.camposObrigatorios.join(', ')}.`,
    `Também extraia, quando existirem: ${perfil.camposQuandoPresentes.join(', ')}.`,
    `Política temporal: ${perfil.politicaTemporal}${perfil.validadePadraoDias ? ` (${perfil.validadePadraoDias} dias)` : ''}.${notaFonte}`,
    'Para cada campo confirmado, informe evidência textual e confiança. Campo ausente ou ilegível deve ser null e gerar pendência; não inferir.',
  ].join(' ');
}

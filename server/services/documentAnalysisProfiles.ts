import { canonicalizeDocumentType, getDocumentCatalogEntry } from '../../shared/documentTypes';

export type DocumentTemporalPolicy =
  | 'sem_validade_formal'
  | 'validade_expressa'
  | 'competencia_mensal'
  | 'competencia_anual'
  | 'ultimos_12_meses'
  | 'emissao_30_dias'
  | 'emissao_60_dias';

export interface DocumentAnalysisProfile {
  tipo: string;
  categoria: string;
  camposObrigatorios: string[];
  camposQuandoPresentes: string[];
  politicaTemporal: DocumentTemporalPolicy;
  validadePadraoDias: number | null;
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

const POLITICA_POR_TIPO: Record<string, { politica: DocumentTemporalPolicy; dias?: number }> = {
  cartao_cnpj: { politica: 'emissao_30_dias', dias: 30 },
  comprovante_residencia: { politica: 'emissao_60_dias', dias: 60 },
  cnd_rfb_cnpj: { politica: 'validade_expressa' },
  cnd_rfb_cpf: { politica: 'validade_expressa' },
  pgfn_cnpj: { politica: 'validade_expressa' },
  pgfn_cpf: { politica: 'validade_expressa' },
  crf_fgts: { politica: 'validade_expressa' },
  cndt: { politica: 'validade_expressa' },
  cnd_estadual: { politica: 'validade_expressa' },
  cnd_municipal: { politica: 'validade_expressa' },
  certidao: { politica: 'validade_expressa' },
  situacao_fiscal_cnpj: { politica: 'emissao_30_dias', dias: 30 },
  situacao_fiscal_cpf: { politica: 'emissao_30_dias', dias: 30 },
  rating_bacen_cnpj: { politica: 'emissao_30_dias', dias: 30 },
  rating_bacen_cpf: { politica: 'emissao_30_dias', dias: 30 },
  ccs_cnpj: { politica: 'emissao_30_dias', dias: 30 },
  ccs_cpf: { politica: 'emissao_30_dias', dias: 30 },
  ccf_cnpj: { politica: 'emissao_30_dias', dias: 30 },
  ccf_cpf: { politica: 'emissao_30_dias', dias: 30 },
  cenprot_cnpj: { politica: 'emissao_30_dias', dias: 30 },
  cenprot_cpf: { politica: 'emissao_30_dias', dias: 30 },
  cadin_cnpj: { politica: 'emissao_30_dias', dias: 30 },
  cadin_cpf: { politica: 'emissao_30_dias', dias: 30 },
  consulta_serasa_cnpj: { politica: 'emissao_30_dias', dias: 30 },
  consulta_serasa_cpf: { politica: 'emissao_30_dias', dias: 30 },
  pgdas: { politica: 'competencia_mensal' },
  pgmei: { politica: 'competencia_mensal' },
  das_mei: { politica: 'competencia_mensal' },
  dctf: { politica: 'competencia_mensal' },
  dctfweb: { politica: 'competencia_mensal' },
  mit: { politica: 'competencia_mensal' },
  darf: { politica: 'competencia_mensal' },
  efd_contribuicoes: { politica: 'competencia_mensal' },
  efd_icms_ipi: { politica: 'competencia_mensal' },
  esocial: { politica: 'competencia_mensal' },
  efd_reinf: { politica: 'competencia_mensal' },
  ecf: { politica: 'competencia_anual' },
  ecd: { politica: 'competencia_anual' },
  defis: { politica: 'competencia_anual' },
  dasn_simei: { politica: 'competencia_anual' },
  imposto_renda: { politica: 'competencia_anual' },
  faturamento_12_meses: { politica: 'ultimos_12_meses' },
  extrato_bancario: { politica: 'competencia_mensal' },
  relatorio_receitas_mei: { politica: 'competencia_mensal' },
  balancete: { politica: 'competencia_mensal' },
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
  const temporal = POLITICA_POR_TIPO[tipo] || { politica: 'sem_validade_formal' as const };
  return {
    tipo,
    categoria,
    camposObrigatorios: Array.from(new Set(CAMPOS_ESPECIFICOS[tipo]?.length ? CAMPOS_ESPECIFICOS[tipo] : base.obrigatorios)),
    camposQuandoPresentes: base.adicionais,
    politicaTemporal: temporal.politica,
    validadePadraoDias: temporal.dias ?? null,
  };
}

export function descricaoPerfilParaPrompt(tipoDocumento: string): string {
  const perfil = obterPerfilAnaliseDocumental(tipoDocumento);
  return [
    `Campos essenciais deste tipo: ${perfil.camposObrigatorios.join(', ')}.`,
    `Também extraia, quando existirem: ${perfil.camposQuandoPresentes.join(', ')}.`,
    `Política temporal: ${perfil.politicaTemporal}${perfil.validadePadraoDias ? ` (${perfil.validadePadraoDias} dias)` : ''}.`,
    'Para cada campo confirmado, informe evidência textual e confiança. Campo ausente ou ilegível deve ser null e gerar pendência; não inferir.',
  ].join(' ');
}

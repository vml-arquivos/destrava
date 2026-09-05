export type DocumentEntityScope = 'empresa' | 'socio' | 'garantia' | 'qualquer';
export type DocumentRequirementKind =
  | 'obrigacao_legal'
  | 'politica_bancaria'
  | 'boa_pratica_analise'
  | 'documento_complementar'
  | 'garantia'
  | 'programa_publico';

export type DocumentCatalogEntry = {
  tipo: string;
  nome: string;
  categoria: string;
  escopo: DocumentEntityScope;
  uploadavel: boolean;
  aliases?: readonly string[];
  tipoCanonico?: string;
  fonteAutomatica?: string;
  analise?: string;
  promptCodigo?: string;
  bloco?: string;
  tipoExigencia?: DocumentRequirementKind;
};

const entry = (
  tipo: string,
  nome: string,
  categoria: string,
  escopo: DocumentEntityScope = 'empresa',
  extras: Omit<DocumentCatalogEntry, 'tipo' | 'nome' | 'categoria' | 'escopo' | 'uploadavel'> & { uploadavel?: boolean } = {},
): DocumentCatalogEntry => ({
  tipo,
  nome,
  categoria,
  escopo,
  uploadavel: true,
  tipoExigencia: 'documento_complementar',
  ...extras,
});

/**
 * Catálogo único da taxonomia documental.
 *
 * O array inclui nomes históricos como entradas de primeira classe para que uploads
 * antigos continuem abrindo e sendo encontrados. `tipoCanonico` documenta a
 * equivalência sem reescrever dados existentes.
 */
export const DOCUMENT_TYPE_CATALOG = [
  // Contratos e documentação societária.
  entry('contrato_prestacao_servicos', 'Contrato de prestação de serviços', 'contrato', 'empresa', { tipoExigencia: 'obrigacao_legal' }),
  entry('contrato_assessoria', 'Contrato de assessoria', 'contrato', 'empresa', { tipoExigencia: 'obrigacao_legal' }),
  entry('contrato_social', 'Contrato social', 'societario', 'empresa', { tipoExigencia: 'obrigacao_legal' }),
  entry('alteracao_contratual', 'Alteração contratual', 'societario', 'empresa', { tipoExigencia: 'obrigacao_legal' }),
  entry('requerimento_empresario', 'Requerimento de Empresário / Instrumento de Inscrição', 'societario', 'empresa', { tipoExigencia: 'obrigacao_legal' }),
  entry('contrato_gerado', 'Contrato gerado pelo sistema', 'contrato', 'empresa'),
  entry('contrato_assinado', 'Contrato assinado', 'contrato', 'empresa', { tipoExigencia: 'obrigacao_legal' }),
  entry('cartao_cnpj', 'Cartão CNPJ', 'cadastral', 'empresa', { aliases: ['cnpj_cartao'], analise: 'cartao_cnpj', promptCodigo: 'cnpj_receita_cartao' }),
  entry('cnpj_cartao', 'Cartão CNPJ (legado)', 'cadastral', 'empresa', { tipoCanonico: 'cartao_cnpj', analise: 'cartao_cnpj', promptCodigo: 'cnpj_receita_cartao' }),
  entry('qsa', 'QSA / Quadro societário', 'societario', 'empresa', { analise: 'qsa', promptCodigo: 'qsa_extract', bloco: 'qsa_quadro_societario' }),
  entry('atos_junta_comercial', 'Atos da Junta Comercial', 'societario', 'empresa', { analise: 'atos_junta_comercial', promptCodigo: 'atos_junta_extract', bloco: 'atos_junta_comercial', tipoExigencia: 'obrigacao_legal' }),
  entry('nire', 'NIRE / registro empresarial', 'societario', 'empresa', { tipoExigencia: 'obrigacao_legal' }),
  entry('estatuto', 'Estatuto social', 'societario', 'empresa', { tipoExigencia: 'obrigacao_legal' }),
  entry('ata', 'Ata societária', 'societario', 'empresa', { tipoExigencia: 'obrigacao_legal' }),
  entry('registro_cartorio_pj', 'Registro no RCPJ / Cartório de Pessoas Jurídicas', 'societario', 'empresa', { tipoExigencia: 'obrigacao_legal' }),
  entry('procuracao', 'Procuração', 'societario', 'empresa', { tipoExigencia: 'obrigacao_legal' }),
  entry('registro_oab', 'Registro/ato da OAB', 'societario', 'empresa', { tipoExigencia: 'obrigacao_legal' }),
  entry('enquadramento_tributario_cnpj', 'Enquadramento tributário da empresa', 'fiscal', 'empresa', { fonteAutomatica: 'receita_federal', analise: 'simples_nacional', promptCodigo: 'simples_extract', bloco: 'enquadramento_tributario' }),
  entry('enquadramento_tributario_cpf', 'Enquadramento tributário do CPF', 'fiscal', 'socio', { tipoExigencia: 'documento_complementar' }),
  entry('situacao_fiscal_cnpj', 'Situação fiscal do CNPJ', 'regularidade', 'empresa'),
  entry('situacao_fiscal_cpf', 'Situação fiscal do CPF', 'regularidade', 'socio'),

  // Pessoas e sócios. A presença no catálogo não torna esses documentos obrigatórios na Fase 1.
  entry('documento_socio', 'Documento de identificação do sócio', 'socio', 'socio', { tipoExigencia: 'obrigacao_legal' }),
  entry('rg', 'RG', 'socio', 'socio', { tipoExigencia: 'obrigacao_legal' }),
  entry('cpf', 'CPF', 'socio', 'socio', { tipoExigencia: 'obrigacao_legal' }),
  entry('cnh', 'CNH', 'socio', 'socio', { tipoExigencia: 'obrigacao_legal' }),
  entry('rg_socio', 'RG do sócio (legado)', 'socio', 'socio', { tipoCanonico: 'rg' }),
  entry('cpf_socio', 'CPF do sócio (legado)', 'socio', 'socio', { tipoCanonico: 'cpf' }),
  entry('cnh_socio', 'CNH do sócio (legado)', 'socio', 'socio', { tipoCanonico: 'cnh' }),
  entry('comprovante_residencia', 'Comprovante de residência', 'socio', 'socio', { analise: 'comprovante_residencia', promptCodigo: 'comprovante_residencia_extract' }),
  entry('comprovante_endereco', 'Comprovante de endereço', 'socio', 'socio', { tipoCanonico: 'comprovante_residencia', analise: 'comprovante_residencia', promptCodigo: 'comprovante_residencia_extract' }),
  entry('comprovante_residencia_socio', 'Comprovante de residência do sócio (legado)', 'socio', 'socio', { tipoCanonico: 'comprovante_residencia', analise: 'comprovante_residencia', promptCodigo: 'comprovante_residencia_extract' }),
  entry('imposto_renda', 'Imposto de renda da pessoa física', 'socio', 'socio', { aliases: ['irpf'], analise: 'irpf', promptCodigo: 'irpf_extract' }),
  entry('irpf', 'IRPF', 'socio', 'socio', { tipoCanonico: 'imposto_renda', analise: 'irpf', promptCodigo: 'irpf_extract' }),
  entry('irpf_socio', 'IRPF do sócio (legado)', 'socio', 'socio', { tipoCanonico: 'imposto_renda', analise: 'irpf', promptCodigo: 'irpf_extract' }),
  entry('recibo_irpf', 'Recibo de entrega do IRPF', 'socio', 'socio', { analise: 'irpf', promptCodigo: 'irpf_extract' }),
  entry('certidao_casamento', 'Certidão de casamento', 'socio', 'socio'),
  entry('certidao_nascimento', 'Certidão de nascimento', 'socio', 'socio'),
  entry('averbacao_divorcio', 'Averbação de divórcio', 'socio', 'socio'),
  entry('certidao_obito', 'Certidão de óbito', 'socio', 'socio'),

  // Certidões, regularidade e consultas de crédito.
  entry('cnd_rfb_cnpj', 'CND/CPEND Federal do CNPJ', 'regularidade', 'empresa', { aliases: ['cnd_cpend_federal'], analise: 'cnd_cpend', promptCodigo: 'cnd_cpend_extract', tipoExigencia: 'obrigacao_legal' }),
  entry('cnd_rfb_cpf', 'CND/CPEND Federal do CPF', 'regularidade', 'socio', { analise: 'cnd_cpend', promptCodigo: 'cnd_cpend_extract', tipoExigencia: 'obrigacao_legal' }),
  entry('cnd_cpend_federal', 'CND/CPEND Federal (nome explícito)', 'regularidade', 'empresa', { tipoCanonico: 'cnd_rfb_cnpj', analise: 'cnd_cpend', promptCodigo: 'cnd_cpend_extract', tipoExigencia: 'obrigacao_legal' }),
  entry('cnd_receita_inss', 'CND Receita Federal/INSS (legado)', 'regularidade', 'empresa', { tipoCanonico: 'cnd_rfb_cnpj' }),
  entry('pgfn_cnpj', 'Regularidade PGFN / Dívida Ativa da União', 'regularidade', 'empresa', { analise: 'cnd_cpend', promptCodigo: 'cnd_cpend_extract' }),
  entry('pgfn_cpf', 'Regularidade PGFN do CPF', 'regularidade', 'socio', { analise: 'cnd_cpend', promptCodigo: 'cnd_cpend_extract' }),
  entry('cadin_cnpj', 'CADIN do CNPJ', 'regularidade', 'empresa', { analise: 'cnd_cpend', promptCodigo: 'cnd_cpend_extract' }),
  entry('cadin_cpf', 'CADIN do CPF', 'regularidade', 'socio', { analise: 'cnd_cpend', promptCodigo: 'cnd_cpend_extract' }),
  entry('crf_fgts', 'Certificado de Regularidade do FGTS', 'regularidade', 'empresa', { aliases: ['fgts'], analise: 'crf_fgts', promptCodigo: 'crf_fgts_extract', tipoExigencia: 'obrigacao_legal' }),
  entry('fgts', 'FGTS (nome legado)', 'regularidade', 'empresa', { tipoCanonico: 'crf_fgts', analise: 'crf_fgts', promptCodigo: 'crf_fgts_extract', tipoExigencia: 'obrigacao_legal' }),
  entry('cndt', 'Certidão Negativa de Débitos Trabalhistas', 'regularidade', 'empresa', { aliases: ['cndt_trabalhista', 'certidao_trabalhista'], analise: 'cndt', promptCodigo: 'cndt_extract', tipoExigencia: 'politica_bancaria' }),
  entry('cndt_trabalhista', 'CNDT Trabalhista (legado)', 'regularidade', 'empresa', { tipoCanonico: 'cndt', analise: 'cndt', promptCodigo: 'cndt_extract', tipoExigencia: 'politica_bancaria' }),
  entry('certidao_trabalhista', 'Certidão trabalhista (legado)', 'regularidade', 'empresa', { tipoCanonico: 'cndt', analise: 'cndt', promptCodigo: 'cndt_extract', tipoExigencia: 'politica_bancaria' }),
  entry('cnd_estadual', 'CND estadual', 'regularidade', 'empresa', { aliases: ['certidao_estadual'], analise: 'cnd_estadual', promptCodigo: 'cnd_estadual_extract', tipoExigencia: 'politica_bancaria' }),
  entry('certidao_estadual', 'Certidão estadual (legado)', 'regularidade', 'empresa', { tipoCanonico: 'cnd_estadual', analise: 'cnd_estadual', promptCodigo: 'cnd_estadual_extract', tipoExigencia: 'politica_bancaria' }),
  entry('cnd_municipal', 'CND municipal', 'regularidade', 'empresa', { aliases: ['certidao_municipal'], analise: 'cnd_municipal', promptCodigo: 'cnd_municipal_extract', tipoExigencia: 'politica_bancaria' }),
  entry('certidao_municipal', 'Certidão municipal (legado)', 'regularidade', 'empresa', { tipoCanonico: 'cnd_municipal', analise: 'cnd_municipal', promptCodigo: 'cnd_municipal_extract', tipoExigencia: 'politica_bancaria' }),
  entry('certidao', 'Certidão genérica', 'regularidade', 'empresa'),
  entry('rating_bacen_cnpj', 'SCR/Rating BACEN do CNPJ', 'credito', 'empresa', { aliases: ['scr_cnpj', 'relatorio_scr'], analise: 'scr', promptCodigo: 'scr_extract' }),
  entry('scr_cnpj', 'SCR do CNPJ', 'credito', 'empresa', { tipoCanonico: 'rating_bacen_cnpj', analise: 'scr', promptCodigo: 'scr_extract' }),
  entry('relatorio_scr', 'Relatório SCR/Registrato', 'credito', 'empresa', { tipoCanonico: 'rating_bacen_cnpj', analise: 'scr', promptCodigo: 'scr_extract' }),
  entry('rating_bacen_cpf', 'SCR/Rating BACEN do CPF', 'credito', 'socio', { aliases: ['scr_cpf'], analise: 'scr', promptCodigo: 'scr_extract' }),
  entry('scr_cpf', 'SCR do CPF', 'credito', 'socio', { tipoCanonico: 'rating_bacen_cpf', analise: 'scr', promptCodigo: 'scr_extract' }),
  entry('ccs_cnpj', 'CCS do CNPJ', 'credito', 'empresa', { analise: 'ccs', promptCodigo: 'ccs_extract' }),
  entry('ccs_cpf', 'CCS do CPF', 'credito', 'socio', { analise: 'ccs', promptCodigo: 'ccs_extract' }),
  entry('ccf_cnpj', 'CCF do CNPJ', 'credito', 'empresa', { analise: 'ccf', promptCodigo: 'ccf_extract' }),
  entry('ccf_cpf', 'CCF do CPF', 'credito', 'socio', { analise: 'ccf', promptCodigo: 'ccf_extract' }),
  entry('cenprot_cnpj', 'CENPROT do CNPJ', 'credito', 'empresa', { analise: 'cenprot', promptCodigo: 'cenprot_extract', tipoExigencia: 'politica_bancaria' }),
  entry('cenprot_cpf', 'CENPROT do CPF', 'credito', 'socio', { analise: 'cenprot', promptCodigo: 'cenprot_extract' }),
  entry('consulta_serasa_cnpj', 'Consulta Serasa do CNPJ', 'credito', 'empresa', { aliases: ['score_serasa'], analise: 'serasa', promptCodigo: 'serasa_extract', tipoExigencia: 'politica_bancaria' }),
  entry('consulta_serasa_cpf', 'Consulta Serasa do CPF', 'credito', 'socio', { analise: 'serasa', promptCodigo: 'serasa_extract' }),
  entry('score_serasa', 'Score Serasa (legado)', 'credito', 'empresa', { tipoCanonico: 'consulta_serasa_cnpj', analise: 'serasa', promptCodigo: 'serasa_extract' }),
  entry('score_boavista', 'Score Boa Vista (legado)', 'credito', 'empresa', { analise: 'serasa', promptCodigo: 'serasa_extract' }),
  entry('restricoes_cnpj', 'Restrições no CNPJ (legado)', 'credito', 'empresa', { analise: 'serasa', promptCodigo: 'serasa_extract' }),
  entry('restricoes_cpf_socio', 'Restrições no CPF do sócio (legado)', 'credito', 'socio', { analise: 'serasa', promptCodigo: 'serasa_extract' }),

  // Fiscal e contábil.
  entry('simples_nacional', 'Comprovação do Simples Nacional', 'fiscal', 'empresa', { analise: 'simples_nacional', promptCodigo: 'simples_extract' }),
  entry('pgdas', 'PGDAS-D', 'fiscal', 'empresa', { aliases: ['pgdas_d'], analise: 'pgdas', promptCodigo: 'pgdas_extract', tipoExigencia: 'obrigacao_legal' }),
  entry('pgdas_d', 'PGDAS-D (nome explícito)', 'fiscal', 'empresa', { tipoCanonico: 'pgdas', analise: 'pgdas', promptCodigo: 'pgdas_extract', tipoExigencia: 'obrigacao_legal' }),
  entry('recibo_pgdas', 'Recibo PGDAS-D', 'fiscal', 'empresa', { tipoCanonico: 'pgdas', analise: 'pgdas', promptCodigo: 'pgdas_extract' }),
  entry('pgmei', 'PGMEI', 'fiscal', 'empresa', { analise: 'pgmei', promptCodigo: 'pgmei_extract', tipoExigencia: 'obrigacao_legal' }),
  entry('recibo_pgmei', 'Recibo PGMEI', 'fiscal', 'empresa', { tipoCanonico: 'pgmei', analise: 'pgmei', promptCodigo: 'pgmei_extract' }),
  entry('das_mei', 'DAS-MEI', 'fiscal', 'empresa', { analise: 'das_mei', promptCodigo: 'das_mei_extract', tipoExigencia: 'obrigacao_legal' }),
  entry('ecf', 'ECF', 'fiscal', 'empresa', { analise: 'ecf', promptCodigo: 'ecf_extract', tipoExigencia: 'obrigacao_legal' }),
  entry('recibo_ecf', 'Recibo ECF', 'fiscal', 'empresa', { tipoCanonico: 'ecf', analise: 'ecf', promptCodigo: 'ecf_extract' }),
  entry('ecd', 'ECD', 'contabil', 'empresa', { analise: 'ecd', promptCodigo: 'ecd_extract', tipoExigencia: 'obrigacao_legal' }),
  entry('recibo_ecd', 'Recibo ECD', 'contabil', 'empresa', { tipoCanonico: 'ecd', analise: 'ecd', promptCodigo: 'ecd_extract' }),
  entry('defis', 'DEFIS', 'fiscal', 'empresa', { analise: 'defis', promptCodigo: 'defis_extract', tipoExigencia: 'obrigacao_legal' }),
  entry('recibo_defis', 'Recibo DEFIS', 'fiscal', 'empresa', { tipoCanonico: 'defis', analise: 'defis', promptCodigo: 'defis_extract' }),
  entry('dasn_simei', 'DASN-SIMEI', 'fiscal', 'empresa', { analise: 'dasn_simei', promptCodigo: 'dasn_simei_extract', tipoExigencia: 'obrigacao_legal' }),
  entry('recibo_dasn_simei', 'Recibo DASN-SIMEI', 'fiscal', 'empresa', { tipoCanonico: 'dasn_simei', analise: 'dasn_simei', promptCodigo: 'dasn_simei_extract' }),
  entry('ccmei', 'CCMEI', 'fiscal', 'empresa', { analise: 'ccmei', promptCodigo: 'ccmei_extract', tipoExigencia: 'obrigacao_legal' }),
  entry('irpj', 'IRPJ (legado)', 'fiscal', 'empresa', { analise: 'irpj', promptCodigo: 'irpj_extract' }),
  entry('dctf', 'DCTF', 'fiscal', 'empresa', { analise: 'dctf_mit', promptCodigo: 'dctf_mit_extract', tipoExigencia: 'obrigacao_legal' }),
  entry('dctfweb', 'DCTFWeb', 'fiscal', 'empresa', { analise: 'dctf_mit', promptCodigo: 'dctf_mit_extract', tipoExigencia: 'obrigacao_legal' }),
  entry('mit', 'MIT / módulo de inclusão de tributos', 'fiscal', 'empresa', { analise: 'dctf_mit', promptCodigo: 'dctf_mit_extract' }),
  entry('darf', 'DARF', 'fiscal', 'empresa', { analise: 'darf', promptCodigo: 'darf_extract', tipoExigencia: 'obrigacao_legal' }),
  // Rodada 12 (31/08/2026, pedido explícito do usuário): campo de upload
  // genérico para quando a empresa não tem ECF, DCTF/DCTFWeb, DARF nem Livro
  // Caixa para comprovar o regime tributário efetivo -- aceita qualquer OUTRO
  // documento, desde que o regime tributário esteja explicitamente declarado
  // no texto (ver `tiposComprovacaoRegime` em analiseDocumentalEspecializada.ts).
  // Ao contrário de ECF/DCTF/DARF/Livro Caixa, este campo não tem uma
  // identidade/formato fixo esperado -- por isso não entra na lista de
  // `tiposCriticos` daquele arquivo (mesmo tratamento do campo "outros" já
  // existente no catálogo, um pouco abaixo).
  entry('comprovante_regime_outro', 'Outro comprovante do regime tributário', 'fiscal', 'empresa', { analise: 'comprovante_regime_outro', promptCodigo: 'comprovante_regime_outro_extract' }),
  entry('efd_contribuicoes', 'EFD-Contribuições', 'fiscal', 'empresa', { analise: 'efd', promptCodigo: 'efd_extract' }),
  entry('efd_icms_ipi', 'EFD ICMS/IPI', 'fiscal', 'empresa', { analise: 'efd', promptCodigo: 'efd_extract' }),
  entry('esocial', 'eSocial', 'trabalhista', 'empresa', { analise: 'esocial', promptCodigo: 'esocial_extract' }),
  entry('efd_reinf', 'EFD-Reinf', 'trabalhista', 'empresa', { analise: 'efd_reinf', promptCodigo: 'efd_reinf_extract' }),
  entry('efd', 'EFD (legado)', 'fiscal', 'empresa', { tipoCanonico: 'efd_contribuicoes', analise: 'efd', promptCodigo: 'efd_extract' }),
  entry('livro_caixa', 'Livro Caixa', 'contabil', 'empresa', { analise: 'livro_caixa', promptCodigo: 'livro_caixa_extract' }),
  entry('balanco', 'Balanço Patrimonial', 'contabil', 'empresa', { aliases: ['balanco_patrimonial'], analise: 'balanco', promptCodigo: 'balanco_extract' }),
  entry('balanco_patrimonial', 'Balanço Patrimonial (legado)', 'contabil', 'empresa', { tipoCanonico: 'balanco', analise: 'balanco', promptCodigo: 'balanco_extract' }),
  entry('dre', 'DRE', 'contabil', 'empresa', { analise: 'dre', promptCodigo: 'dre_extract' }),
  entry('dfc', 'DFC', 'contabil', 'empresa', { analise: 'dfc', promptCodigo: 'dfc_extract' }),
  entry('dmpl', 'DMPL', 'contabil', 'empresa', { analise: 'dmpl', promptCodigo: 'dmpl_extract' }),
  entry('notas_explicativas', 'Notas explicativas', 'contabil', 'empresa', { analise: 'notas_explicativas', promptCodigo: 'notas_explicativas_extract' }),
  entry('balancete', 'Balancete', 'contabil', 'empresa', { analise: 'balancete', promptCodigo: 'balancete_extract' }),
  entry('razao_contabil', 'Razão contábil', 'contabil', 'empresa', { analise: 'razao_contabil', promptCodigo: 'razao_contabil_extract' }),

  // Faturamento, notas, bancos e capital de giro.
  entry('faturamento_12_meses', 'Faturamento dos últimos 12 meses', 'financeiro', 'empresa', { aliases: ['comprovante_faturamento', 'declaracao_faturamento'], analise: 'faturamento_12_meses', promptCodigo: 'faturamento_12m_extract', tipoExigencia: 'boa_pratica_analise' }),
  entry('comprovante_faturamento', 'Comprovante de faturamento (legado)', 'financeiro', 'empresa', { tipoCanonico: 'faturamento_12_meses', analise: 'faturamento_12_meses', promptCodigo: 'faturamento_12m_extract' }),
  entry('declaracao_faturamento', 'Declaração de faturamento (legado)', 'financeiro', 'empresa', { tipoCanonico: 'faturamento_12_meses', analise: 'faturamento_12_meses', promptCodigo: 'faturamento_12m_extract' }),
  entry('projecao_receitas', 'Projeção de receitas', 'financeiro', 'empresa', { aliases: ['demonstrativo_receitas_projetadas'], analise: 'projecao_receitas', promptCodigo: 'projecao_receitas_extract', tipoExigencia: 'politica_bancaria' }),
  entry('demonstrativo_receitas_projetadas', 'Demonstrativo de receitas projetadas', 'financeiro', 'empresa', { tipoCanonico: 'projecao_receitas', analise: 'projecao_receitas', promptCodigo: 'projecao_receitas_extract' }),
  entry('relatorio_receitas_mei', 'Relatório mensal de receitas do MEI', 'financeiro', 'empresa', { analise: 'relatorio_receitas_mei', promptCodigo: 'relatorio_receitas_mei_extract' }),
  entry('extrato_bancario', 'Extrato bancário', 'financeiro', 'empresa', { analise: 'extrato_bancario', promptCodigo: 'extrato_bancario_extract' }),
  entry('nf_e', 'NF-e', 'fiscal', 'empresa', { aliases: ['nfe', 'notas_fiscais'], analise: 'notas_fiscais', promptCodigo: 'notas_fiscais_extract' }),
  entry('nfe', 'NF-e (legado)', 'fiscal', 'empresa', { tipoCanonico: 'nf_e', analise: 'notas_fiscais', promptCodigo: 'notas_fiscais_extract' }),
  entry('nfs_e', 'NFS-e', 'fiscal', 'empresa', { aliases: ['nfse'], analise: 'notas_fiscais', promptCodigo: 'notas_fiscais_extract' }),
  entry('nfse', 'NFS-e (legado)', 'fiscal', 'empresa', { tipoCanonico: 'nfs_e', analise: 'notas_fiscais', promptCodigo: 'notas_fiscais_extract' }),
  entry('notas_fiscais', 'Notas fiscais', 'fiscal', 'empresa', { tipoCanonico: 'nf_e', analise: 'notas_fiscais', promptCodigo: 'notas_fiscais_extract' }),
  entry('recebiveis', 'Recebíveis', 'financeiro', 'empresa', { analise: 'recebiveis', promptCodigo: 'recebiveis_extract', tipoExigencia: 'politica_bancaria' }),
  entry('contas_receber', 'Contas a receber', 'financeiro', 'empresa', { analise: 'contas_receber', promptCodigo: 'contas_receber_extract' }),
  entry('contas_pagar', 'Contas a pagar', 'financeiro', 'empresa', { analise: 'contas_pagar', promptCodigo: 'contas_pagar_extract' }),
  entry('estoque', 'Estoque', 'financeiro', 'empresa', { analise: 'estoque', promptCodigo: 'estoque_extract' }),
  entry('capital_giro', 'Memória de necessidade de capital de giro', 'financeiro', 'empresa', { analise: 'capital_giro', promptCodigo: 'capital_giro_extract' }),

  // Garantias e ativos.
  entry('garantia', 'Documento de garantia', 'garantia', 'garantia', { analise: 'garantia', promptCodigo: 'garantia_extract', tipoExigencia: 'garantia' }),
  entry('documento_bem_garantia', 'Documento do bem em garantia (legado)', 'garantia', 'garantia', { tipoCanonico: 'garantia', analise: 'garantia', promptCodigo: 'garantia_extract', tipoExigencia: 'garantia' }),
  entry('contrato_garantia', 'Contrato de garantia', 'garantia', 'garantia', { analise: 'garantia', promptCodigo: 'garantia_extract', tipoExigencia: 'garantia' }),
  entry('alienacao_fiduciaria', 'Instrumento de alienação fiduciária', 'garantia', 'garantia', { analise: 'garantia', promptCodigo: 'garantia_extract', tipoExigencia: 'garantia' }),
  entry('aval', 'Aval / garantidor', 'garantia', 'garantia', { analise: 'garantia', promptCodigo: 'garantia_extract', tipoExigencia: 'garantia' }),
  entry('nota_promissoria', 'Nota promissória', 'garantia', 'garantia', { analise: 'garantia', promptCodigo: 'garantia_extract', tipoExigencia: 'garantia' }),
  entry('patrimonio_garantia', 'Comprovação patrimonial para garantia', 'garantia', 'garantia', { analise: 'garantia', promptCodigo: 'garantia_extract', tipoExigencia: 'garantia' }),

  // eCAC, fotos e compatibilidade histórica.
  entry('compartilhamento_ecac', 'Compartilhamento eCAC', 'fiscal', 'empresa', { tipoExigencia: 'politica_bancaria' }),
  entry('foto_fachada', 'Foto da fachada', 'operacional', 'empresa'),
  entry('foto_interna_1', 'Foto interna 1', 'operacional', 'empresa'),
  entry('foto_interna_2', 'Foto interna 2', 'operacional', 'empresa'),
  entry('foto_interna_3', 'Foto interna 3', 'operacional', 'empresa'),
  entry('outros', 'Outros documentos', 'outros', 'qualquer'),
  entry('outro', 'Outro documento (legado)', 'outros', 'qualquer', { tipoCanonico: 'outros' }),
] as const satisfies readonly DocumentCatalogEntry[];

export type DocumentType = typeof DOCUMENT_TYPE_CATALOG[number]['tipo'];

export const TIPOS_DOCUMENTO = DOCUMENT_TYPE_CATALOG.map((item) => item.tipo) as DocumentType[];
export const TIPOS_DOCUMENTO_SET = new Set<string>(TIPOS_DOCUMENTO);

const CATALOG_BY_TYPE = new Map<string, DocumentCatalogEntry>(DOCUMENT_TYPE_CATALOG.map((item) => [item.tipo, item]));
const ALIAS_TO_TYPE = new Map<string, string>();
for (const item of DOCUMENT_TYPE_CATALOG) {
  for (const alias of item.aliases || []) ALIAS_TO_TYPE.set(alias, item.tipo);
  if (item.tipoCanonico) ALIAS_TO_TYPE.set(item.tipo, item.tipoCanonico);
}

export function getDocumentCatalogEntry(tipo: unknown): DocumentCatalogEntry | null {
  const key = String(tipo || '').trim();
  return CATALOG_BY_TYPE.get(key) || null;
}

export function canonicalizeDocumentType(tipo: unknown): string {
  const key = String(tipo || '').trim();
  const item = getDocumentCatalogEntry(key);
  return item?.tipoCanonico || ALIAS_TO_TYPE.get(key) || key;
}

export function isKnownDocumentType(tipo: unknown): boolean {
  return TIPOS_DOCUMENTO_SET.has(String(tipo || '').trim());
}

export function isUploadableDocumentType(tipo: unknown): boolean {
  return Boolean(getDocumentCatalogEntry(tipo)?.uploadavel);
}

export function documentAnalysisConfig(tipo: unknown): { tipo: string; promptCodigo: string } | null {
  const item = getDocumentCatalogEntry(tipo);
  if (!item?.uploadavel) return null;
  const tipoCanonico = canonicalizeDocumentType(item.tipo);
  return {
    tipo: item.analise || 'documento_generico',
    promptCodigo: item.promptCodigo || `catalogo_${tipoCanonico}_extract`,
  };
}

export function documentTypesForScope(scope: DocumentEntityScope): string[] {
  return DOCUMENT_TYPE_CATALOG
    .filter((item) => item.escopo === scope || item.escopo === 'qualquer')
    .map((item) => item.tipo);
}

export function documentLabel(tipo: unknown): string {
  return getDocumentCatalogEntry(tipo)?.nome || String(tipo || 'Documento');
}

export const AUTOMATIC_DOCUMENT_TYPES = new Set(
  DOCUMENT_TYPE_CATALOG.filter((item) => item.fonteAutomatica && !item.uploadavel).map((item) => item.tipo),
);

export const DOCUMENT_CATALOG_VERSION = '2026.09.05';

export const LEGACY_DOCUMENT_TYPE_ALIASES: Readonly<Record<string, string>> = Object.freeze(
  DOCUMENT_TYPE_CATALOG.reduce<Record<string, string>>((aliases, item) => {
    if (item.tipoCanonico) aliases[item.tipo] = item.tipoCanonico;
    return aliases;
  }, {}),
);

export function documentTypeCatalogForDatabase(): Array<{
  tipo_documento: string;
  nome_amigavel: string;
  categoria: string;
  escopo: DocumentEntityScope;
  uploadavel: boolean;
  tipo_canonico: string | null;
  fonte_automatica: string | null;
  analise: string | null;
  prompt_codigo: string | null;
  tipo_exigencia: DocumentRequirementKind;
}> {
  return DOCUMENT_TYPE_CATALOG.map((item) => {
    const config = documentAnalysisConfig(item.tipo);
    return {
      tipo_documento: item.tipo,
      nome_amigavel: item.nome,
      categoria: item.categoria,
      escopo: item.escopo,
      uploadavel: item.uploadavel,
      tipo_canonico: item.tipoCanonico || null,
      fonte_automatica: item.fonteAutomatica || null,
      analise: config?.tipo || null,
      prompt_codigo: config?.promptCodigo || null,
      tipo_exigencia: item.tipoExigencia || 'documento_complementar',
    };
  });
}

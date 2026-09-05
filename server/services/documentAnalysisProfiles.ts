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
  /**
   * `true` significa que o tipo passou por uma decisão explícita de quais
   * dados devem ser lidos. O fallback por categoria existe apenas para tipos
   * desconhecidos/legados e nunca deve ser usado silenciosamente pelo
   * catálogo oficial.
   */
  perfilIndividual: boolean;
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

type CamposPerfil = { obrigatorios: string[]; adicionais: string[] };

/**
 * Registro interno individual por tipo canônico.
 *
 * Alguns tipos compartilham a mesma ficha técnica (por exemplo CND de CNPJ e
 * CPF), mas todos são registrados nominalmente. Isso impede que um documento
 * novo entre no catálogo e herde, sem revisão, os campos genéricos de sua
 * categoria. Campos condicionais ficam em `adicionais`: a ausência deles não
 * reprova automaticamente um documento ao qual legalmente não se apliquem.
 */
const CAMPOS_POR_TIPO: Record<string, CamposPerfil> = {};

function registrarPerfis(tipos: readonly string[], obrigatorios: readonly string[], adicionais: readonly string[] = []): void {
  for (const tipo of tipos) {
    CAMPOS_POR_TIPO[tipo] = {
      obrigatorios: [...obrigatorios],
      adicionais: [...adicionais],
    };
  }
}

registrarPerfis(
  ['contrato_prestacao_servicos', 'contrato_assessoria', 'contrato_gerado', 'contrato_assinado'],
  ['partes', 'objeto', 'data_assinatura'],
  ['vigencia', 'assinaturas', 'cnpj', 'cpf', 'valor', 'obrigacoes', 'garantias', 'numero_contrato'],
);
registrarPerfis(
  ['contrato_social', 'alteracao_contratual'],
  ['razao_social', 'registro', 'data_registro', 'socios', 'administradores'],
  ['cnpj', 'nire', 'sede', 'objeto_social', 'capital_social', 'quotas', 'poderes_representacao', 'assinaturas', 'eventos', 'consolidacao'],
);
registrarPerfis(
  ['requerimento_empresario'],
  ['razao_social', 'titular', 'registro', 'data_registro'],
  ['cnpj', 'cpf', 'nire', 'endereco', 'objeto_social', 'capital_social', 'eventos', 'protocolo', 'assinaturas'],
);
registrarPerfis(
  ['qsa'],
  ['cnpj', 'socios', 'administrador_titular'],
  ['data_consulta', 'qualificacoes', 'representantes', 'capital_social', 'razao_social'],
);
registrarPerfis(
  ['atos_junta_comercial'],
  ['nire', 'historico_arquivamentos', 'data_emissao'],
  ['cnpj', 'razao_social', 'natureza_juridica', 'endereco', 'capital_social', 'socios', 'administradores', 'situacao_registro', 'codigo_autenticidade'],
);
registrarPerfis(['nire'], ['nire', 'razao_social', 'situacao_registro'], ['cnpj', 'data_registro', 'orgao_registro', 'codigo_autenticidade']);
registrarPerfis(
  ['estatuto'],
  ['razao_social', 'finalidade', 'administradores', 'poderes_representacao'],
  ['cnpj', 'registro', 'data_registro', 'patrimonio', 'orgaos_governanca', 'quoruns', 'regras_alteracao', 'regras_dissolucao', 'assinaturas'],
);
registrarPerfis(
  ['ata'],
  ['data_documento', 'deliberacoes', 'administradores'],
  ['razao_social', 'cnpj', 'tipo_assembleia', 'quorum', 'presentes', 'mandatos', 'poderes_representacao', 'capital_social', 'registro', 'assinaturas'],
);
registrarPerfis(
  ['registro_cartorio_pj'],
  ['razao_social', 'orgao_registro', 'numero_registro', 'data_registro'],
  ['cnpj', 'finalidade', 'sede', 'atos_averbados', 'diretoria', 'situacao_registro', 'selo_ou_codigo_autenticidade'],
);
registrarPerfis(
  ['procuracao'],
  ['outorgante', 'outorgado', 'poderes', 'data_assinatura'],
  ['cpf', 'cnpj', 'prazo', 'revogacao', 'reconhecimento_firma', 'assinaturas'],
);
registrarPerfis(
  ['registro_oab'],
  ['razao_social', 'secional_oab', 'numero_registro', 'situacao_registro'],
  ['cnpj', 'tipo_societario', 'socios', 'advogados_responsaveis', 'atos_averbados', 'data_registro', 'codigo_autenticidade'],
);

registrarPerfis(['cartao_cnpj'], ['cnpj', 'razao_social', 'situacao_cadastral'], ['nome_fantasia', 'data_abertura', 'natureza_juridica', 'endereco', 'cnae_principal', 'cnaes_secundarios', 'data_situacao_cadastral', 'motivo_situacao', 'porte', 'municipio', 'uf', 'capital_social', 'data_emissao']);
registrarPerfis(['enquadramento_tributario_cnpj', 'simples_nacional'], ['cnpj', 'opcao_simples', 'opcao_mei'], ['regime_tributario', 'datas_opcao_exclusao', 'periodos', 'eventos', 'data_consulta']);
registrarPerfis(['enquadramento_tributario_cpf'], ['cpf', 'situacao', 'data_consulta'], ['regime_tributario', 'periodos', 'eventos']);
registrarPerfis(['situacao_fiscal_cnpj'], ['cnpj', 'resultado_consulta', 'data_consulta'], ['pendencias', 'debitos', 'orgao_emissor', 'codigo_autenticidade']);
registrarPerfis(['situacao_fiscal_cpf'], ['cpf', 'resultado_consulta', 'data_consulta'], ['pendencias', 'debitos', 'orgao_emissor', 'codigo_autenticidade']);
registrarPerfis(['ccmei'], ['cnpj', 'nome_empresarial', 'titular', 'condicao_mei'], ['cpf', 'data_inicio', 'capital_social', 'ocupacoes', 'cnaes', 'endereco', 'situacao', 'data_emissao', 'codigo_autenticidade']);

registrarPerfis(['documento_socio', 'rg'], ['nome', 'numero_documento'], ['cpf', 'data_nascimento', 'data_emissao', 'orgao_emissor', 'uf_emissor', 'filiacao', 'assinatura']);
registrarPerfis(['cpf'], ['nome', 'cpf', 'situacao_cadastral'], ['data_nascimento', 'data_inscricao', 'data_emissao', 'codigo_autenticidade']);
registrarPerfis(['cnh'], ['nome', 'cpf', 'numero_documento', 'data_validade'], ['data_nascimento', 'categoria_cnh', 'numero_registro', 'data_emissao', 'orgao_emissor', 'assinatura']);
registrarPerfis(['comprovante_residencia'], ['nome_titular', 'endereco_completo', 'data_emissao'], ['cpf', 'cnpj', 'emissor', 'tipo_comprovante', 'mes_referencia', 'cep']);
registrarPerfis(['imposto_renda'], ['cpf', 'ano_calendario', 'titular'], ['recibo_ou_protocolo', 'data_transmissao', 'rendimentos', 'bens_direitos', 'dividas', 'imposto', 'retificacao']);
registrarPerfis(['recibo_irpf'], ['cpf', 'ano_calendario', 'recibo_ou_protocolo'], ['titular', 'data_transmissao', 'retificacao']);
registrarPerfis(['certidao_casamento'], ['nomes', 'data_ato', 'numero_registro'], ['regime_bens', 'cartorio', 'livro', 'folha', 'termo', 'averbacoes']);
registrarPerfis(['certidao_nascimento'], ['nome', 'data_nascimento', 'numero_registro'], ['filiacao', 'cartorio', 'livro', 'folha', 'termo']);
registrarPerfis(['averbacao_divorcio'], ['nomes', 'data_ato', 'numero_registro'], ['cartorio', 'regime_bens', 'partilha', 'averbacoes']);
registrarPerfis(['certidao_obito'], ['nome', 'data_ato', 'numero_registro'], ['cpf', 'cartorio', 'livro', 'folha', 'termo']);

registrarPerfis(['cnd_rfb_cnpj', 'pgfn_cnpj', 'crf_fgts', 'cndt', 'cnd_estadual', 'cnd_municipal'], ['cnpj', 'situacao_certidao', 'data_emissao', 'data_validade'], ['entidade_consultada', 'orgao_emissor', 'numero_certidao', 'codigo_autenticidade', 'debitos', 'pendencias', 'inscricao_estadual', 'inscricao_municipal']);
registrarPerfis(['cnd_rfb_cpf', 'pgfn_cpf'], ['cpf', 'situacao_certidao', 'data_emissao', 'data_validade'], ['entidade_consultada', 'orgao_emissor', 'numero_certidao', 'codigo_autenticidade', 'debitos', 'pendencias']);
registrarPerfis(['cadin_cnpj'], ['cnpj', 'situacao_certidao', 'data_consulta'], ['ente_cadin', 'pendencias', 'data_inclusao', 'codigo_autenticidade']);
registrarPerfis(['cadin_cpf'], ['cpf', 'situacao_certidao', 'data_consulta'], ['ente_cadin', 'pendencias', 'data_inclusao', 'codigo_autenticidade']);
registrarPerfis(['certidao'], ['entidade_consultada', 'situacao_certidao', 'data_emissao'], ['cnpj', 'cpf', 'data_validade', 'orgao_emissor', 'numero_certidao', 'codigo_autenticidade']);

registrarPerfis(['rating_bacen_cnpj'], ['cnpj', 'data_base', 'instituicoes'], ['modalidades', 'saldo', 'limites', 'coobrigacoes', 'atrasos', 'historico']);
registrarPerfis(['rating_bacen_cpf'], ['cpf', 'data_base', 'instituicoes'], ['modalidades', 'saldo', 'limites', 'coobrigacoes', 'atrasos', 'historico']);
registrarPerfis(['ccs_cnpj'], ['cnpj', 'data_consulta', 'instituicoes'], ['datas_relacionamento', 'representantes', 'procuradores']);
registrarPerfis(['ccs_cpf'], ['cpf', 'data_consulta', 'instituicoes'], ['datas_relacionamento', 'representantes', 'procuradores']);
registrarPerfis(['ccf_cnpj'], ['cnpj', 'data_consulta', 'resultado_consulta'], ['ocorrencias', 'instituicoes', 'quantidade_cheques']);
registrarPerfis(['ccf_cpf'], ['cpf', 'data_consulta', 'resultado_consulta'], ['ocorrencias', 'instituicoes', 'quantidade_cheques']);
registrarPerfis(['cenprot_cnpj'], ['cnpj', 'data_consulta', 'resultado_consulta'], ['protestos', 'cartorios', 'valores', 'datas']);
registrarPerfis(['cenprot_cpf'], ['cpf', 'data_consulta', 'resultado_consulta'], ['protestos', 'cartorios', 'valores', 'datas']);
registrarPerfis(['consulta_serasa_cnpj', 'score_boavista', 'restricoes_cnpj'], ['cnpj', 'data_consulta', 'resultado_consulta'], ['score', 'restricoes', 'dividas', 'protestos', 'consultas', 'limites']);
registrarPerfis(['consulta_serasa_cpf', 'restricoes_cpf_socio'], ['cpf', 'data_consulta', 'resultado_consulta'], ['score', 'restricoes', 'dividas', 'protestos', 'consultas', 'limites']);

registrarPerfis(['pgdas'], ['cnpj', 'competencia', 'receita_bruta', 'recibo_ou_protocolo'], ['receitas_por_estabelecimento', 'receitas_por_atividade', 'anexos', 'segregacoes', 'rbt12', 'tributos', 'das', 'retificacao', 'data_transmissao']);
registrarPerfis(['pgmei', 'das_mei'], ['cnpj', 'competencia', 'valor_total'], ['vencimento', 'data_pagamento', 'situacao_pagamento', 'codigo_barras', 'autenticacao', 'recibo_ou_protocolo']);
registrarPerfis(['ecf'], ['cnpj', 'periodo', 'regime_tributario', 'recibo_ou_protocolo'], ['irpj', 'csll', 'lalur', 'elacs', 'saldos', 'registros', 'assinaturas', 'hash', 'retificacao']);
registrarPerfis(['ecd'], ['cnpj', 'periodo', 'recibo_ou_protocolo'], ['tipo_livro', 'saldos', 'demonstracoes', 'assinaturas', 'hash', 'retificacao']);
registrarPerfis(['defis'], ['cnpj', 'ano_calendario', 'recibo_ou_protocolo'], ['receita_bruta', 'estoque', 'distribuicao', 'empregados', 'dados_socioeconomicos', 'situacao_especial', 'retificacao', 'data_transmissao']);
registrarPerfis(['dasn_simei'], ['cnpj', 'ano_calendario', 'receita_bruta', 'recibo_ou_protocolo'], ['receita_comercio_industria', 'receita_servicos', 'empregados', 'situacao_especial', 'data_transmissao']);
registrarPerfis(['irpj'], ['cnpj', 'periodo', 'regime_tributario'], ['base_calculo', 'aliquota', 'imposto_devido', 'recibo_ou_protocolo', 'data_transmissao']);
registrarPerfis(['dctf', 'dctfweb', 'mit'], ['cnpj', 'competencia', 'recibo_ou_protocolo'], ['tributos', 'codigos_receita', 'debitos', 'creditos', 'suspensoes', 'saldo', 'situacao', 'retificacao', 'data_transmissao']);
registrarPerfis(['darf'], ['cnpj', 'competencia', 'codigo_receita', 'valor_total'], ['data_vencimento', 'data_pagamento', 'valor_principal', 'multa', 'juros', 'autenticacao']);
registrarPerfis(['comprovante_regime_outro'], ['cnpj', 'regime_tributario', 'data_documento'], ['competencia', 'orgao_emissor', 'recibo_ou_protocolo', 'evidencias']);
registrarPerfis(['efd_contribuicoes'], ['cnpj', 'periodo', 'registros_m400', 'registros_m800'], ['regime_tributario', 'receitas', 'creditos', 'debitos', 'totais_m400_m800', 'recibo_ou_protocolo', 'hash']);
registrarPerfis(['efd_icms_ipi'], ['cnpj', 'periodo', 'registros_e110'], ['estabelecimentos', 'icms_debitos', 'icms_creditos', 'icms_recolher', 'saldo', 'recibo_ou_protocolo', 'hash']);
registrarPerfis(['esocial'], ['cnpj', 'competencia', 'situacao'], ['eventos', 'folha', 'debitos', 'recibo_ou_protocolo', 'data_transmissao']);
registrarPerfis(['efd_reinf'], ['cnpj', 'competencia', 'situacao'], ['eventos', 'retencoes', 'debitos', 'recibo_ou_protocolo', 'data_transmissao']);

registrarPerfis(['livro_caixa'], ['cnpj', 'periodo', 'lancamentos'], ['saldo_inicial', 'entradas', 'saidas', 'saldo_final', 'responsavel', 'assinaturas']);
registrarPerfis(['balanco'], ['cnpj', 'periodo', 'ativo_total', 'passivo_total', 'patrimonio_liquido'], ['ativo_circulante', 'passivo_circulante', 'contador', 'crc', 'assinaturas']);
registrarPerfis(['dre'], ['cnpj', 'periodo', 'receita_liquida', 'lucro_liquido'], ['lucro_bruto', 'ebit', 'ebitda', 'custos', 'despesas', 'contador', 'crc', 'assinaturas']);
registrarPerfis(['dfc'], ['cnpj', 'periodo', 'fluxo_operacional', 'variacao_caixa'], ['fluxo_investimento', 'fluxo_financiamento', 'saldo_inicial', 'saldo_final', 'contador', 'crc', 'assinaturas']);
registrarPerfis(['dmpl'], ['cnpj', 'periodo', 'patrimonio_liquido_inicial', 'patrimonio_liquido_final'], ['capital_social', 'reservas', 'lucros_prejuizos', 'dividendos', 'ajustes']);
registrarPerfis(['notas_explicativas'], ['cnpj', 'periodo', 'demonstracoes_referenciadas'], ['politicas_contabeis', 'contingencias', 'partes_relacionadas', 'eventos_subsequentes', 'assinaturas']);
registrarPerfis(['balancete'], ['cnpj', 'periodo', 'contas', 'saldos'], ['saldo_inicial', 'debitos', 'creditos', 'saldo_final', 'contador', 'crc']);
registrarPerfis(['razao_contabil'], ['cnpj', 'periodo', 'contas', 'lancamentos'], ['historicos', 'debitos', 'creditos', 'saldos', 'contrapartidas']);

registrarPerfis(['faturamento_12_meses'], ['cnpj', 'meses_referencia'], ['competencias_mensais', 'receita_bruta', 'total_12_meses', 'assinatura_socio_administrador', 'assinatura_contador', 'data_assinatura']);
registrarPerfis(['projecao_receitas'], ['cnpj', 'periodo', 'valores'], ['premissas', 'cenarios', 'responsavel', 'data_documento', 'assinaturas']);
registrarPerfis(['relatorio_receitas_mei'], ['cnpj', 'competencia', 'receita_bruta'], ['receita_comercio_industria', 'receita_servicos', 'notas_fiscais', 'responsavel', 'assinatura']);
registrarPerfis(['extrato_bancario'], ['banco', 'periodo', 'lancamentos'], ['cnpj_ou_titular', 'agencia', 'conta', 'saldo_inicial', 'total_entradas', 'total_saidas', 'saldo_final']);
registrarPerfis(['nf_e', 'nfs_e'], ['cnpj_emitente', 'data_emissao', 'numero_documento', 'valor_total'], ['cnpj_destinatario', 'chave_acesso', 'itens', 'tributos', 'situacao', 'cancelamento']);
registrarPerfis(['recebiveis'], ['cnpj', 'periodo', 'titulos', 'valor_total'], ['clientes', 'vencimentos', 'situacao', 'garantias', 'conciliacao']);
registrarPerfis(['contas_receber'], ['cnpj', 'data_base', 'titulos', 'valor_total'], ['clientes', 'vencimentos', 'atrasos', 'situacao']);
registrarPerfis(['contas_pagar'], ['cnpj', 'data_base', 'titulos', 'valor_total'], ['fornecedores', 'vencimentos', 'atrasos', 'situacao']);
registrarPerfis(['estoque'], ['cnpj', 'data_base', 'itens', 'valor_total'], ['quantidades', 'custos', 'localizacao', 'obsolescencia']);
registrarPerfis(['capital_giro'], ['cnpj', 'data_base', 'necessidade_capital_giro'], ['ciclo_financeiro', 'prazos_medios', 'estoques', 'contas_receber', 'contas_pagar', 'premissas']);

registrarPerfis(['garantia', 'patrimonio_garantia'], ['bem_ou_garantidor', 'proprietario', 'identificacao', 'valor'], ['tipo_bem', 'matricula_ou_registro', 'registro', 'onus_e_gravames', 'data_avaliacao', 'validade', 'assinaturas']);
registrarPerfis(['contrato_garantia'], ['partes', 'garantia', 'obrigacao_garantida', 'data_assinatura'], ['valor', 'prazo', 'registro', 'assinaturas']);
registrarPerfis(['alienacao_fiduciaria'], ['devedor', 'credor', 'bem', 'registro'], ['valor', 'obrigacao_garantida', 'prazo', 'onus_e_gravames', 'assinaturas']);
registrarPerfis(['aval'], ['avalista', 'devedor', 'obrigacao_garantida'], ['cpf', 'cnpj', 'valor', 'prazo', 'assinaturas']);
registrarPerfis(['nota_promissoria'], ['emitente', 'beneficiario', 'valor', 'data_vencimento'], ['local_pagamento', 'avalistas', 'data_emissao', 'assinaturas']);

registrarPerfis(['compartilhamento_ecac'], ['cnpj', 'autorizacao', 'data_inicio'], ['data_fim', 'destinatario', 'escopo_dados', 'situacao']);
registrarPerfis(['foto_fachada', 'foto_interna_1', 'foto_interna_2', 'foto_interna_3'], ['tipo_evidencia', 'qualidade_imagem'], ['data_captura', 'local_declarado', 'geolocalizacao', 'fachada', 'instalacoes', 'equipamentos']);
registrarPerfis(['outros'], [], ['tipo_detectado', 'entidade_relacionada', 'finalidade', 'datas', 'valores', 'situacao', 'assinaturas', 'evidencias']);

export function possuiPerfilIndividualDocumental(tipoDocumento: string): boolean {
  return Boolean(CAMPOS_POR_TIPO[canonicalizeDocumentType(tipoDocumento)]);
}

export function obterPerfilAnaliseDocumental(tipoDocumento: string): DocumentAnalysisProfile {
  const tipo = canonicalizeDocumentType(tipoDocumento);
  const item = getDocumentCatalogEntry(tipoDocumento) || getDocumentCatalogEntry(tipo);
  const categoria = item?.categoria || 'outros';
  const base = CAMPOS_POR_CATEGORIA[categoria] || CAMPOS_POR_CATEGORIA.outros;
  const temporal = POLITICA_POR_TIPO[tipo] || { politica: 'sem_validade_formal' as const, grauFonte: null };
  const individual = CAMPOS_POR_TIPO[tipo];
  return {
    tipo,
    categoria,
    perfilIndividual: Boolean(individual),
    camposObrigatorios: Array.from(new Set(individual?.obrigatorios ?? base.obrigatorios)),
    camposQuandoPresentes: Array.from(new Set([...(individual?.adicionais ?? []), ...base.adicionais])),
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
